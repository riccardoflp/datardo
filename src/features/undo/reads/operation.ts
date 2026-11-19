/**
 * The read of `undo.revert` and `undo.details` (their **Reads** lines, with no card of its own): an operation's file,
 * and its documents or keys as they are now. The main process answers it (app action `undo.read-operation`): it reads
 * and unzips the file, reads the documents by `_id` (batches of 1,000) or the keys with `DUMP`, `PTTL` and `TYPE`, and
 * computes their fingerprints.
 */
import type { Json } from '../../../shared/engine-request';
import type { Context, ReadRequest } from '../../../shared/feature';
import type { Current, DocumentNow, KeyNow } from '../changed-since';
import { keyFingerprintFrom, keyImageOf, recordsOf } from '../files/records';
import type { Fingerprint, KeyName, OperationId, OperationRecords } from '../types';
import { fieldsOf, isObject } from '../types';

/** The identifier of the read, which the main process answers. */
export const operationRead = 'undo.read-operation';

/** What the read gives: the records (all, or the first `first`), how many there are, and how they are now. */
export type OperationRead =
  | { readonly kind: 'read'; readonly records: OperationRecords; readonly total: number; readonly current: Current }
  | { readonly kind: 'missing' };

/** The arguments of the read: the operation, and how many of its documents or keys to read (all when absent). */
export function operationArgs(operation: OperationId, first?: number): Json {
  return first === undefined ? { operation } : { operation, first };
}

/** The read, answered by the main process. */
export function request(_context: Context, args: Json): ReadRequest {
  return { kind: 'app', action: operationRead, args };
}

/** What the main process answered. */
export function parse(replies: readonly unknown[]): OperationRead | undefined {
  return operationReadOf(replies[0]);
}

function documentNowOf(value: unknown): DocumentNow | undefined {
  if (!isObject(value) || !('id' in value) || typeof value['fingerprint'] !== 'string') {
    return undefined;
  }
  return {
    id: value['id'] as Json,
    document: (value['document'] ?? null) as Json,
    fingerprint: value['fingerprint'] as Fingerprint,
  };
}

function keyNowOf(value: unknown): KeyNow | undefined {
  const fields = fieldsOf(value);
  const image = keyImageOf(fields['image']);
  const found = keyFingerprintFrom(fields['fingerprint']);
  return typeof fields['key'] === 'string' && image !== undefined && found !== undefined
    ? { key: fields['key'] as KeyName, image, fingerprint: found }
    : undefined;
}

function itemsOf<T>(value: unknown, read: (item: unknown) => T | undefined): readonly T[] {
  return Array.isArray(value)
    ? (value as readonly unknown[]).flatMap((item) => {
        const found = read(item);
        return found === undefined ? [] : [found];
      })
    : [];
}

/** The documents or keys as they are now; those that do not exist are not listed. */
export function currentOf(value: unknown): Current | undefined {
  const fields = fieldsOf(value);
  if (Array.isArray(fields['docs'])) {
    return { kind: 'documents', docs: itemsOf(fields['docs'], documentNowOf) };
  }
  if (Array.isArray(fields['keys'])) {
    return { kind: 'keys', keys: itemsOf(fields['keys'], keyNowOf) };
  }
  return undefined;
}

/** The answer of the read; none when it is not one. */
export function operationReadOf(value: unknown): OperationRead | undefined {
  const fields = fieldsOf(value);
  if (fields['kind'] === 'missing') {
    return { kind: 'missing' };
  }
  const records = recordsOf(fields['records']);
  const current = currentOf(fields['current']);
  if (records === undefined || current === undefined) {
    return undefined;
  }
  const total =
    typeof fields['total'] === 'number'
      ? fields['total']
      : records.kind === 'documents'
        ? records.docs.length
        : records.keys.length;
  return { kind: 'read', records, total, current };
}
