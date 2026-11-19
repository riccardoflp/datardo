/**
 * Feature: undo.changed-since — before undoing, Datardo finds what someone changed after the operation, because
 * undoing would overwrite those changes; the answer decides what the undo asks.
 */
import type { Json } from '../../shared/engine-request';
import { keysDiffer } from './kept';
import { revertText } from './text';
import type { Fingerprint, KeyFingerprint, KeyImage, KeyName, OperationRecords } from './types';
import { sameValueKey } from './types';

/** A document as it is now: as stored, and its fingerprint. */
export interface DocumentNow {
  readonly id: Json;
  readonly document: Json;
  readonly fingerprint: Fingerprint;
}

/** A key as it is now: its dump, `PTTL` and `TYPE`, and its fingerprint. */
export interface KeyNow {
  readonly key: KeyName;
  readonly image: KeyImage;
  readonly fingerprint: KeyFingerprint;
}

/** The documents or keys of an operation as they are now; one that does not exist is not listed. */
export type Current =
  | { readonly kind: 'documents'; readonly docs: readonly DocumentNow[] }
  | { readonly kind: 'keys'; readonly keys: readonly KeyNow[] };

/** What the undo asks: nothing, or **Undo all** or **Undo unchanged only**. */
export type UndoQuestion = 'none' | 'all-or-unchanged';

/** The records changed since, the question to ask, and the line of the confirmation. */
export interface ChangedSince {
  /** The records changed since, by {@link recordKey}. */
  readonly changed: readonly string[];
  readonly total: number;
  readonly question: UndoQuestion;
  readonly line?: string;
}

/** The answer to **Undo all** or **Undo unchanged only**. */
export type UndoChoice = 'all' | 'unchanged';

/** What names a record of an operation: its `_id` with its type, or its key's name. */
export function recordKey(record: { readonly id: Json } | { readonly key: KeyName }): string {
  return 'id' in record ? sameValueKey(record.id) : `key:${record.key}`;
}

/** The fingerprints now, by record. */
export function nowByRecord(current: Current): ReadonlyMap<string, DocumentNow | KeyNow> {
  return current.kind === 'documents'
    ? new Map(current.docs.map((each) => [recordKey(each), each]))
    : new Map(current.keys.map((each) => [recordKey(each), each]));
}

function changedKeys(records: OperationRecords, current: Current): readonly string[] {
  const now = nowByRecord(current);
  if (records.kind === 'documents') {
    return records.docs
      .filter((record) => {
        const found = now.get(recordKey(record)) as DocumentNow | undefined;
        return (found?.fingerprint ?? null) !== record.after;
      })
      .map(recordKey);
  }
  return records.keys
    .filter((record) => {
      const found = now.get(recordKey(record)) as KeyNow | undefined;
      return keysDiffer(found?.fingerprint ?? null, record.after);
    })
    .map(recordKey);
}

function lineOf(changed: number, total: number, unit: 'document' | 'key'): string | undefined {
  if (changed === 0) {
    return undefined;
  }
  if (changed === total) {
    return total === 1 ? revertText.oneChanged(unit) : revertText.allChanged;
  }
  return revertText.someChanged(changed);
}

/** Feature: undo.changed-since. */
export function changedSince(records: OperationRecords, current: Current): ChangedSince {
  const changed = changedKeys(records, current);
  const total = records.kind === 'documents' ? records.docs.length : records.keys.length;
  const line = lineOf(changed.length, total, records.kind === 'documents' ? 'document' : 'key');
  return {
    changed,
    total,
    question: changed.length > 0 && changed.length < total ? 'all-or-unchanged' : 'none',
    ...(line === undefined ? {} : { line }),
  };
}

/**
 * The confirmation's button: **Undo** when nothing taken changed since (none changed, or **Undo unchanged only**), and
 * **Undo anyway** otherwise.
 */
export function undoButton(found: ChangedSince, choice: UndoChoice | undefined): string {
  if (found.changed.length === 0 || choice === 'unchanged') {
    return revertText.undo;
  }
  return revertText.undoAnyway;
}

/** The line the confirmation shows about what changed since; none after **Undo unchanged only**. */
export function changedLine(found: ChangedSince, choice: UndoChoice | undefined): string | undefined {
  return choice === 'unchanged' ? undefined : found.line;
}
