/**
 * Feature: watch.event-diff
 *
 * Gives, field by field, what an update or a replacement changed: from the fields of an update, with the values
 * before read from the document before when the change event carries it; from the two documents of a replacement
 * when it carries both, flattened to their innermost fields (into sub-documents, not into arrays). Two values differ
 * when their canonical Extended JSON does: `1` as an `Int32` and as a `Double` are a change.
 */
import type { Json } from '../../shared/engine-request';
import { isTypedValue } from '../aggregate/mongosh/format';
import { isRecord, type JsonObject } from '../history/types';
import { truncatedNote } from './text';
import type { WatchEvent } from './types';

/** What a row says happened to a field. */
export type EventDiffKind = 'added' | 'changed' | 'removed' | 'truncated';

/** One row: a field path, what happened, the values before and after when known, a note. */
export interface EventDiffRow {
  readonly path: string;
  readonly kind: EventDiffKind;
  readonly before?: Json;
  readonly after?: Json;
  readonly note?: string;
}

const missing = Symbol('missing');

/** The value at a field path, going into sub-documents and arrays; {@link missing} when there is none. */
export function valueAt(document: JsonObject, path: string): Json | typeof missing {
  let node: Json = document;
  for (const part of path.split('.')) {
    if (Array.isArray(node) && /^\d+$/u.test(part)) {
      const list = node as readonly Json[];
      const index = Number(part);
      if (index >= list.length) {
        return missing;
      }
      node = list[index] ?? null;
    } else if (isRecord(node) && !isTypedValue(node) && Object.hasOwn(node, part)) {
      node = node[part] ?? null;
    } else {
      return missing;
    }
  }
  return node;
}

/** Whether two values differ: their canonical Extended JSON does. */
export function differs(before: Json, after: Json): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

/** The innermost fields of a document, by field path: into sub-documents, not into arrays nor typed values. */
export function flattened(document: JsonObject, prefix = ''): ReadonlyMap<string, Json> {
  const fields = new Map<string, Json>();
  for (const [key, value] of Object.entries(document)) {
    const path = prefix + key;
    if (isRecord(value) && !isTypedValue(value) && Object.keys(value).length > 0) {
      flattened(value, `${path}.`).forEach((inner, innerPath) => fields.set(innerPath, inner));
    } else {
      fields.set(path, value);
    }
  }
  return fields;
}

function updateRows(event: WatchEvent): readonly EventDiffRow[] {
  const before = event.before;
  const valueBefore = (path: string): Json | typeof missing => (before === undefined ? missing : valueAt(before, path));
  const set = Object.entries(event.updated ?? {}).map(([path, after]): EventDiffRow => {
    const old = valueBefore(path);
    const kind = before !== undefined && old === missing ? 'added' : 'changed';
    return { path, kind, ...(old === missing ? {} : { before: old }), after };
  });
  const removed = (event.removed ?? []).map((path): EventDiffRow => {
    const old = valueBefore(path);
    return { path, kind: 'removed', ...(old === missing ? {} : { before: old }) };
  });
  const truncated = (event.truncated ?? []).map((each): EventDiffRow => ({
    path: each.field,
    kind: 'truncated',
    note: truncatedNote(each.size),
  }));
  return [...set, ...removed, ...truncated];
}

function replaceRows(before: JsonObject, after: JsonObject): readonly EventDiffRow[] {
  const old = flattened(before);
  const now = flattened(after);
  const rows: EventDiffRow[] = [];
  old.forEach((value, path) => {
    const next = now.get(path);
    if (next === undefined) {
      rows.push({ path, kind: 'removed', before: value });
    } else if (differs(value, next)) {
      rows.push({ path, kind: 'changed', before: value, after: next });
    }
  });
  now.forEach((value, path) => {
    if (!old.has(path)) {
      rows.push({ path, kind: 'added', after: value });
    }
  });
  return rows;
}

/** Feature: watch.event-diff — the rows of what the change event changed; none for any other change event. */
export function eventDiff(event: WatchEvent): readonly EventDiffRow[] {
  if (event.updated !== undefined) {
    return updateRows(event);
  }
  if (event.before !== undefined && event.after !== undefined) {
    return replaceRows(event.before, event.after);
  }
  return [];
}
