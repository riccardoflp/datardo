/**
 * The content of an operation's file, `undo/<id>.json.gz`, before it is compressed: canonical Extended JSON,
 * `{ docs: [{ id, before, after }] }` for documents and `{ keys: [{ key, before, after }] }` for keys (`undo.record`).
 * `src/storage/undo.ts` writes and reads it with its `version`; these functions turn it into records and back.
 */
import type { Json } from '../../../shared/engine-request';
import type {
  DocumentRecord,
  Fingerprint,
  KeyFingerprint,
  KeyImage,
  KeyName,
  KeyRecord,
  OperationRecords,
} from '../types';
import { fieldsOf, isObject } from '../types';

/** The records as the file holds them. */
export function recordsJson(records: OperationRecords): Json {
  return records.kind === 'documents'
    ? { docs: records.docs.map((each) => ({ id: each.id, before: each.before, after: each.after })) }
    : { keys: records.keys.map(keyJson) };
}

function keyJson(record: KeyRecord): Json {
  return {
    key: record.key,
    before: record.before === null ? null : { ...record.before },
    after: record.after === null ? null : { ...record.after },
  };
}

/** A key's image as read; none when it is not one. */
export function keyImageOf(value: unknown): KeyImage | undefined {
  const fields = fieldsOf(value);
  const { dump, pttl, type } = fields;
  return typeof dump === 'string' && typeof pttl === 'number' && typeof type === 'string'
    ? { dump, pttl, type }
    : undefined;
}

/** A key's fingerprint as read; none when it is not one. */
export function keyFingerprintFrom(value: unknown): KeyFingerprint | undefined {
  const fields = fieldsOf(value);
  const { sha1, expiresAt } = fields;
  return typeof sha1 === 'string' && (expiresAt === null || typeof expiresAt === 'number')
    ? { sha1: sha1 as Fingerprint, expiresAt }
    : undefined;
}

function documentRecordOf(value: unknown): DocumentRecord | undefined {
  if (!isObject(value) || !('id' in value)) {
    return undefined;
  }
  const after = value['after'];
  return {
    id: value['id'] as Json,
    before: (value['before'] ?? null) as Json | null,
    after: typeof after === 'string' ? (after as Fingerprint) : null,
  };
}

function keyRecordOf(value: unknown): KeyRecord | undefined {
  const fields = fieldsOf(value);
  const key = fields['key'];
  if (typeof key !== 'string') {
    return undefined;
  }
  return {
    key: key as KeyName,
    before: keyImageOf(fields['before']) ?? null,
    after: keyFingerprintFrom(fields['after']) ?? null,
  };
}

function listOf<T>(value: unknown, read: (item: unknown) => T | undefined): readonly T[] {
  return Array.isArray(value)
    ? (value as readonly unknown[]).flatMap((item) => {
        const found = read(item);
        return found === undefined ? [] : [found];
      })
    : [];
}

/** The records of a file's content; none when it holds neither documents nor keys. */
export function recordsOf(value: unknown): OperationRecords | undefined {
  const fields = fieldsOf(value);
  if (Array.isArray(fields['docs'])) {
    return { kind: 'documents', docs: listOf(fields['docs'], documentRecordOf) };
  }
  if (Array.isArray(fields['keys'])) {
    return { kind: 'keys', keys: listOf(fields['keys'], keyRecordOf) };
  }
  return undefined;
}

/** How many documents or keys the records hold. */
export function recordCount(records: OperationRecords): number {
  return records.kind === 'documents' ? records.docs.length : records.keys.length;
}
