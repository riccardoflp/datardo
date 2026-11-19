/**
 * The reads of `undo.record` (its **Reads** line, with no card of its own): what a write is about to change, before
 * the steps, and the fingerprints of the same documents or keys after them. The requests are built here; the main
 * process sends them (app action `undo.keep`), computes the fingerprints and sizes it alone can compute (SHA-1 of BSON
 * bytes and of dumps), and answers in the shapes {@link beforeReadOf} and {@link afterReadOf} read.
 */
import type { ConnectionRequest, Json } from '../../../shared/engine-request';
import { redisCommand } from '../../../shared/engine-request';
import type { Context, ReadRequest } from '../../../shared/feature';
import type { ConnectionId } from '../../../shared/ids';
import { keyFingerprintFrom, keyImageOf } from '../files/records';
import type { Fingerprint, KeyFingerprint, KeyImage, KeyName, Keeps } from '../types';
import { bytesOfBase64, fieldsOf, isObject } from '../types';

/** The identifier of the read, which the runner and the main process answer. */
export const keepRead = 'undo.keep';

/** Documents are read by `_id` in batches of 1,000. */
export const idBatch = 1000;

/** How long each read may take, in milliseconds (R9.2; Datardo's choice). */
export const keepTimeLimitMs = 60_000;

/** A document as read before the write: as stored, its fingerprint, and its BSON size. */
export interface DocumentImage {
  readonly id: Json;
  readonly before: Json | null;
  readonly beforeFingerprint: Fingerprint | null;
  /** The BSON size of the document, or of `{ _id }` for one that did not exist. */
  readonly size: number;
}

/** A key as read before the write: its dump, `PTTL` and `TYPE`, and its fingerprint; `null` when it did not exist. */
export interface KeyImageRead {
  readonly key: KeyName;
  readonly before: KeyImage | null;
  readonly beforeFingerprint: KeyFingerprint | null;
}

/** What was read before the write, or why it could not be (a `DUMP` refused). */
export type BeforeRead =
  | { readonly kind: 'documents'; readonly docs: readonly DocumentImage[] }
  | { readonly kind: 'keys'; readonly keys: readonly KeyImageRead[] }
  | { readonly kind: 'failed'; readonly error: string };

/** The fingerprints read after the write; `null` for what no longer exists. */
export type AfterRead =
  | { readonly kind: 'documents'; readonly docs: readonly { readonly id: Json; readonly after: Fingerprint | null }[] }
  | {
      readonly kind: 'keys';
      readonly keys: readonly { readonly key: KeyName; readonly after: KeyFingerprint | null }[];
    };

/** What the read is asked: before the steps, what `keeps` names; after them, the same documents or keys again. */
export type KeepArgs =
  | { readonly phase: 'before'; readonly connection: ConnectionId; readonly keeps: Keeps; readonly limit: number }
  | {
      readonly phase: 'after';
      readonly connection: ConnectionId;
      readonly database: string | number;
      readonly collection?: string;
      readonly ids?: readonly Json[];
      readonly keys?: readonly KeyName[];
    };

/** The read of `undo.record`, answered by the main process. */
export function request(_context: Context, args: Json): ReadRequest {
  return { kind: 'app', action: keepRead, args };
}

/** What the main process answered, as the plan of `undo.record` reads it. */
export function parse(replies: readonly unknown[], args: Json): BeforeRead | AfterRead | undefined {
  const [reply] = replies;
  return fieldsOf(args)['phase'] === 'after' ? afterReadOf(reply) : beforeReadOf(reply);
}

function batches<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    out.push(items.slice(start, start + size));
  }
  return out;
}

function findByIds(connection: ConnectionId, database: string, collection: string, ids: readonly Json[]) {
  return batches(ids, idBatch).map((batch): ConnectionRequest => ({
    connection,
    request: {
      engine: 'mongodb',
      database,
      collection,
      method: 'find',
      arguments: [{ _id: { $in: [...batch] } }],
      timeLimitMs: keepTimeLimitMs,
    },
  }));
}

function keyRequests(
  connection: ConnectionId,
  database: number,
  keys: readonly KeyName[],
  commands: readonly string[],
): readonly ConnectionRequest[] {
  return keys.flatMap((key) =>
    commands.map((command): ConnectionRequest => ({
      connection,
      request: { ...redisCommand(database, command, bytesOfBase64(key)), timeLimitMs: keepTimeLimitMs },
    })),
  );
}

/**
 * The requests that read what a write is about to change: `db.orders.find(<filter>)` with at most `limit` documents,
 * `db.orders.find({ _id: { $in: [<1,000 ids>] } })` in batches, nothing for the `_id`s the steps insert, and `DUMP`,
 * `PTTL` and `TYPE` of each key (sent in pipelines of 1,000 keys).
 */
export function beforeRequests(connection: ConnectionId, keeps: Keeps, limit: number): readonly ConnectionRequest[] {
  switch (keeps.kind) {
    case 'filter':
      return [
        {
          connection,
          request: {
            engine: 'mongodb',
            database: keeps.database,
            collection: keeps.collection,
            method: 'find',
            arguments: [keeps.filter],
            limit,
            timeLimitMs: keepTimeLimitMs,
          },
        },
      ];
    case 'ids':
      return findByIds(connection, keeps.database, keeps.collection, keeps.ids);
    case 'keys':
      return keyRequests(connection, keeps.database, keeps.keys, ['DUMP', 'PTTL', 'TYPE']);
    case 'inserted':
    case 'images':
      return [];
  }
}

/** The requests that read the same documents by `_id`, or the same keys with `DUMP` and `PTTL`, after the write. */
export function afterRequests(args: Extract<KeepArgs, { readonly phase: 'after' }>): readonly ConnectionRequest[] {
  if (typeof args.database === 'number') {
    return keyRequests(args.connection, args.database, args.keys ?? [], ['DUMP', 'PTTL']);
  }
  return findByIds(args.connection, args.database, args.collection ?? '', args.ids ?? []);
}

function documentImageOf(value: unknown): DocumentImage | undefined {
  if (!isObject(value) || !('id' in value) || typeof value['size'] !== 'number') {
    return undefined;
  }
  const before = (value['before'] ?? null) as Json | null;
  const known = value['beforeFingerprint'];
  return {
    id: value['id'] as Json,
    before,
    beforeFingerprint: before === null || typeof known !== 'string' ? null : (known as Fingerprint),
    size: value['size'],
  };
}

function keyImageReadOf(value: unknown): KeyImageRead | undefined {
  const fields = fieldsOf(value);
  if (typeof fields['key'] !== 'string') {
    return undefined;
  }
  const before = keyImageOf(fields['before']) ?? null;
  return {
    key: fields['key'] as KeyName,
    before,
    beforeFingerprint: before === null ? null : (keyFingerprintFrom(fields['beforeFingerprint']) ?? null),
  };
}

function itemsOf<T>(value: unknown, read: (item: unknown) => T | undefined): readonly T[] {
  return Array.isArray(value)
    ? (value as readonly unknown[]).flatMap((item) => {
        const found = read(item);
        return found === undefined ? [] : [found];
      })
    : [];
}

/** What was read before the write; none when the answer is not one. */
export function beforeReadOf(value: unknown): BeforeRead | undefined {
  const fields = fieldsOf(value);
  switch (fields['kind']) {
    case 'documents':
      return { kind: 'documents', docs: itemsOf(fields['docs'], documentImageOf) };
    case 'keys':
      return { kind: 'keys', keys: itemsOf(fields['keys'], keyImageReadOf) };
    case 'failed':
      return { kind: 'failed', error: typeof fields['error'] === 'string' ? fields['error'] : '' };
    default:
      return undefined;
  }
}

/** The fingerprints read after the write; none when the answer is not one. */
export function afterReadOf(value: unknown): AfterRead | undefined {
  const fields = fieldsOf(value);
  if (fields['kind'] === 'documents') {
    const docs = itemsOf(fields['docs'], (item) => {
      const each = fieldsOf(item);
      const after = each['after'];
      return 'id' in each
        ? { id: each['id'] as Json, after: typeof after === 'string' ? (after as Fingerprint) : null }
        : undefined;
    });
    return { kind: 'documents', docs };
  }
  if (fields['kind'] === 'keys') {
    const keys = itemsOf(fields['keys'], (item) => {
      const each = fieldsOf(item);
      return typeof each['key'] === 'string'
        ? { key: each['key'] as KeyName, after: keyFingerprintFrom(each['after']) ?? null }
        : undefined;
    });
    return { kind: 'keys', keys };
  }
  return undefined;
}
