/**
 * Feature: history.versions
 *
 * Rebuilds the document as it was after each write, from the writes read and the document as it is now. Each version is
 * rebuilt forwards from the last insert, replacement, delete or drop when there is one, and otherwise backwards from
 * the current document, with the values the oplog does not tell left unknown. A stretch rebuilt forwards that
 * disagrees with what is known backwards is dropped whole, and the result reports a conflict.
 */
import type { Json } from '../../shared/engine-request';
import { versionDiff } from './diff';
import { applyUpdate, Mismatch } from './rebuild/forwards';
import { revertUpdate } from './rebuild/backwards';
import { mismatchText } from './text';
import { updateChanges } from './update-changes';
import {
  copied,
  inOrder,
  isSubDocument,
  isUnknown,
  joinedPath,
  writeKey,
  writeKind,
  type DocumentHistory,
  type DocumentVersion,
  type DocumentWrite,
  type JsonObject,
  type KnownDocument,
  type VersionDocument,
} from './types';

/** A state rebuilt forwards, with the number of the stretch it belongs to. */
type Forward = KnownDocument & { readonly stretch: number };

/** The field paths of the unknown values of a value: `status`, `items.1`, or `(document)` for the whole. */
export function unknownPaths(value: Json, path = ''): readonly string[] {
  if (isUnknown(value)) {
    return [path === '' ? '(document)' : path];
  }
  if (Array.isArray(value)) {
    return (value as readonly Json[]).flatMap((item, index) => unknownPaths(item, joinedPath(path, index)));
  }
  if (isSubDocument(value)) {
    return Object.entries(value).flatMap(([key, item]) => unknownPaths(item, joinedPath(path, key)));
  }
  return [];
}

/** Whether an exact value fits a partial one: equal where known; an unknown value is anything, or missing. */
function agrees(exact: Json, partial: Json): boolean {
  if (isUnknown(partial)) {
    return true;
  }
  if (Array.isArray(partial)) {
    return Array.isArray(exact) && arrayAgrees(exact as readonly Json[], partial as readonly Json[]);
  }
  if (isSubDocument(partial)) {
    return isSubDocument(exact) && documentAgrees(exact, partial);
  }
  return JSON.stringify(exact) === JSON.stringify(partial);
}

function arrayAgrees(exact: readonly Json[], partial: readonly Json[]): boolean {
  let known = partial.length;
  while (known > 0 && isUnknown(partial[known - 1])) {
    known -= 1;
  }
  return (
    exact.length >= known &&
    exact.length <= partial.length &&
    exact.every((item, index) => agrees(item, partial[index] ?? null))
  );
}

function documentAgrees(exact: JsonObject, partial: JsonObject): boolean {
  for (const [key, value] of Object.entries(partial)) {
    const fits = key in exact ? agrees(exact[key] ?? null, value) : isUnknown(value);
    if (!fits) {
      return false;
    }
  }
  return Object.keys(exact).every((key) => key in partial);
}

/** A replacement's document: `o`, with the `_id` of `o2` when `o` has none. */
function replacementOf(write: DocumentWrite): JsonObject {
  const id = write.o2?.['_id'];
  return copied('_id' in write.o || id === undefined ? write.o : { _id: id, ...write.o });
}

/** The state after one write, going forwards from the state before it, and why it did not fit when it did not. */
function forwardStep(before: Forward, write: DocumentWrite, next: number): { state: Forward; mismatch?: string } {
  switch (writeKind(write)) {
    case 'insert':
      return { state: { kind: 'document', document: copied(write.o), stretch: next } };
    case 'replace':
      return { state: { kind: 'document', document: replacementOf(write), stretch: next } };
    case 'delete':
    case 'drop':
      return { state: { kind: 'absent', stretch: next } };
    case 'renamed':
      return { state: { kind: 'unknown', stretch: next } };
    case 'update':
      return updateForwards(before, write, next);
  }
}

function updateForwards(before: Forward, write: DocumentWrite, next: number): { state: Forward; mismatch?: string } {
  const unknown: Forward = { kind: 'unknown', stretch: next };
  if (before.kind === 'absent') {
    return { state: unknown, mismatch: mismatchText.updateAfterDelete };
  }
  if (before.kind !== 'document') {
    return { state: unknown };
  }
  try {
    return { state: { kind: 'document', document: applyUpdate(before.document, write.o), stretch: before.stretch } };
  } catch (error: unknown) {
    if (error instanceof Mismatch) {
      return { state: unknown, mismatch: error.message };
    }
    throw error;
  }
}

/** Forwards: unknown before the oldest write; each insert, replacement, delete or drop starts a stretch. */
function forwards(writes: readonly DocumentWrite[]): { states: Forward[]; mismatches: (string | undefined)[] } {
  const states: Forward[] = [{ kind: 'unknown', stretch: 0 }];
  const mismatches: (string | undefined)[] = [undefined];
  for (const write of writes) {
    const before = states.at(-1) ?? { kind: 'unknown', stretch: 0 };
    const step = forwardStep(before, write, states.length);
    states.push(step.state);
    mismatches.push(step.mismatch);
  }
  return { states, mismatches };
}

/** The state before one write, going back from the state after it. */
function backwardStep(after: KnownDocument, write: DocumentWrite): KnownDocument {
  const kind = writeKind(write);
  if (kind === 'insert') {
    return { kind: 'absent' };
  }
  if (kind !== 'update' || after.kind !== 'document') {
    return { kind: 'unknown' };
  }
  try {
    return { kind: 'document', document: revertUpdate(after.document, write.o) };
  } catch (error: unknown) {
    if (error instanceof Mismatch) {
      return { kind: 'unknown' };
    }
    throw error;
  }
}

/** Backwards from the current document: the state after each write, the last one first. */
function backwards(writes: readonly DocumentWrite[], current: JsonObject | undefined): KnownDocument[] {
  const states: KnownDocument[] = new Array<KnownDocument>(writes.length + 1);
  states[writes.length] = current === undefined ? { kind: 'absent' } : { kind: 'document', document: copied(current) };
  for (let index = writes.length; index > 0; index -= 1) {
    const write = writes[index - 1];
    const after = states[index];
    states[index - 1] = write === undefined || after === undefined ? { kind: 'unknown' } : backwardStep(after, write);
  }
  return states;
}

/** The stretches rebuilt forwards that disagree with what is known backwards at some point. */
function wrongStretches(forward: readonly Forward[], backward: readonly KnownDocument[]): Set<number> {
  const wrong = new Set<number>();
  forward.forEach((state, index) => {
    const known = backward[index];
    if (state.kind === 'unknown' || known === undefined || known.kind === 'unknown') {
      return;
    }
    const differs =
      state.kind !== known.kind ||
      (state.kind === 'document' && known.kind === 'document' && !agrees(state.document, known.document));
    if (differs) {
      wrong.add(state.stretch);
    }
  });
  return wrong;
}

/** What is shown of a state: its state name, its document and its unknown field paths. */
export function versionDocument(state: KnownDocument): VersionDocument {
  if (state.kind !== 'document') {
    return { state: state.kind };
  }
  const unknown = unknownPaths(state.document);
  return unknown.length > 0
    ? { state: 'partial', document: state.document, unknown }
    : { state: 'exact', document: state.document };
}

function versionOf(write: DocumentWrite, before: KnownDocument, after: KnownDocument, mismatch?: string) {
  const kind = writeKind(write);
  const changes = kind === 'update' ? updateChanges(write.o) : undefined;
  const version: DocumentVersion = {
    write,
    kind,
    key: writeKey(write),
    ...(changes === undefined ? {} : { changes }),
    ...versionDocument(after),
    diff: versionDiff(before, after),
    ...(mismatch === undefined ? {} : { mismatch }),
  };
  return version;
}

/**
 * Feature: history.versions — the versions, oldest first, from the writes in any order and the document as it is now
 * (`undefined` when it does not exist), as canonical Extended JSON.
 */
export function documentHistory(writes: readonly DocumentWrite[], current: JsonObject | undefined): DocumentHistory {
  const ordered = inOrder(writes);
  const forward = forwards(ordered);
  const backward = backwards(ordered, current);
  const wrong = wrongStretches(forward.states, backward);
  const states: KnownDocument[] = forward.states.map((state, index) =>
    state.kind !== 'unknown' && !wrong.has(state.stretch) ? state : (backward[index] ?? { kind: 'unknown' }),
  );
  const versions = ordered.map((write, index) =>
    versionOf(
      write,
      states[index] ?? { kind: 'unknown' },
      states[index + 1] ?? { kind: 'unknown' },
      forward.mismatches[index + 1],
    ),
  );
  return {
    versions,
    before: versionDocument(states[0] ?? { kind: 'unknown' }),
    conflict: wrong.size > 0,
  };
}
