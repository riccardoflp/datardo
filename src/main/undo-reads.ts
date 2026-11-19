/**
 * The reads of the undo history the main process answers, because it alone computes fingerprints (SHA-1 of a
 * document's BSON bytes and of a key's dump): `undo.keep`, what a write is about to change and the same documents or
 * keys after it (`undo.record`), and `undo.read-operation`, an operation's file and its documents or keys as they are
 * now (`undo.revert`, `undo.details`). The requests are those the features build; they go to the connection's client.
 */
import { createHash } from 'node:crypto';
import { bsonBytes, type EngineService } from '../engines';
import { keyFingerprintOf } from '../features/undo/kept';
import { afterRequests, beforeRequests, idBatch, keepTimeLimitMs, type KeepArgs } from '../features/undo/reads/keep';
import { bytesOfBase64, fingerprint, keepsOf, sameValueKey, type Keeps, type KeyName } from '../features/undo/types';
import type { ConnectionRequest, Json } from '../shared/engine-request';
import { redisCommand } from '../shared/engine-request';
import type { ConnectionId } from '../shared/ids';
import type { UndoEntry } from '../shared/state/undo';

type JsonFields = Readonly<Record<string, Json>>;

/** The SHA-1 of bytes, in base64. */
export function sha1Of(bytes: Uint8Array): string {
  return createHash('sha1').update(bytes).digest('base64');
}

function fields(value: unknown): JsonFields {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonFields) : {};
}

function idOf(document: Json): Json {
  return fields(document)['_id'] ?? null;
}

function base64Of(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function textOf(reply: unknown): string {
  return reply instanceof Uint8Array ? Buffer.from(reply).toString('utf8') : String(reply);
}

/** A document as read: its fingerprint and its BSON size. */
function measured(document: Json): { readonly fingerprint: string; readonly size: number } {
  const bytes = bsonBytes(document);
  return { fingerprint: sha1Of(bytes), size: bytes.byteLength };
}

async function documentsOf(
  engines: Pick<EngineService, 'send'>,
  requests: readonly ConnectionRequest[],
  signal: AbortSignal,
): Promise<readonly Json[]> {
  const found: Json[] = [];
  for (const request of requests) {
    const reply = await engines.send(request, signal);
    found.push(...(Array.isArray(reply) ? (reply as readonly Json[]) : []));
  }
  return found;
}

/** Documents before the write: those the filter matches, or each `_id` named, with `null` for one that is not there. */
async function documentsBefore(
  engines: Pick<EngineService, 'send'>,
  args: KeepArgs & { phase: 'before' },
  signal: AbortSignal,
) {
  const found = await documentsOf(engines, beforeRequests(args.connection, args.keeps, args.limit), signal);
  const byId = new Map(found.map((document) => [sameValueKey(idOf(document)), document]));
  const ids = args.keeps.kind === 'ids' ? args.keeps.ids : found.map(idOf);
  const docs = ids.map((id): Json => {
    const document = byId.get(sameValueKey(id));
    if (document === undefined) {
      return { id, before: null, beforeFingerprint: null, size: bsonBytes({ _id: id }).byteLength };
    }
    const { fingerprint: beforeFingerprint, size } = measured(document);
    return { id, before: document, beforeFingerprint, size };
  });
  return { kind: 'documents', docs };
}

/** The replies of commands on keys, `commands.length` per key in order, in pipelines of {@link idBatch} keys. */
async function keyReplies(
  engines: Pick<EngineService, 'send'>,
  requests: readonly ConnectionRequest[],
  perKey: number,
  signal: AbortSignal,
): Promise<readonly (readonly unknown[])[]> {
  const replies: unknown[] = [];
  const batch = idBatch * perKey;
  for (let start = 0; start < requests.length; start += batch) {
    const sent = requests.slice(start, start + batch).map((request) => engines.send(request, signal));
    replies.push(...(await Promise.all(sent)));
  }
  const perKeyReplies: (readonly unknown[])[] = [];
  for (let start = 0; start < replies.length; start += perKey) {
    perKeyReplies.push(replies.slice(start, start + perKey));
  }
  return perKeyReplies;
}

/** A key's image and fingerprint from its `DUMP`, `PTTL` (and `TYPE`); none when it does not exist. */
function keyRead(replies: readonly unknown[], readAt: number) {
  const [dump, pttl, type] = replies;
  if (!(dump instanceof Uint8Array)) {
    return undefined;
  }
  const expiry = typeof pttl === 'number' ? pttl : -1;
  const found = keyFingerprintOf(fingerprint(sha1Of(dump)), expiry, readAt);
  return {
    image: { dump: base64Of(dump), pttl: expiry, type: textOf(type) },
    fingerprint: { sha1: found.sha1 as string, expiresAt: found.expiresAt },
  };
}

/** Keys before the write: `DUMP`, `PTTL` and `TYPE` of each; a `DUMP` the server refuses means none can be kept. */
async function keysBefore(
  engines: Pick<EngineService, 'send'>,
  args: KeepArgs & { phase: 'before' },
  signal: AbortSignal,
) {
  const keys = args.keeps.kind === 'keys' ? args.keeps.keys : [];
  let replies: readonly (readonly unknown[])[];
  try {
    replies = await keyReplies(engines, beforeRequests(args.connection, args.keeps, args.limit), 3, signal);
  } catch (error: unknown) {
    return { kind: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
  const readAt = Date.now();
  return {
    kind: 'keys',
    keys: keys.map((key, index): Json => {
      const read = keyRead(replies[index] ?? [], readAt);
      return read === undefined
        ? { key, before: null, beforeFingerprint: null }
        : { key, before: read.image, beforeFingerprint: read.fingerprint };
    }),
  };
}

/** The same documents or keys after the write: the fingerprint of each, `null` for what no longer exists. */
async function readAfter(
  engines: Pick<EngineService, 'send'>,
  args: KeepArgs & { phase: 'after' },
  signal: AbortSignal,
) {
  const requests = afterRequests(args);
  if (typeof args.database === 'number') {
    const replies = await keyReplies(engines, requests, 2, signal);
    const readAt = Date.now();
    const keys = (args.keys ?? []).map((key, index): Json => ({
      key,
      after: keyRead(replies[index] ?? [], readAt)?.fingerprint ?? null,
    }));
    return { kind: 'keys', keys };
  }
  const found = await documentsOf(engines, requests, signal);
  const byId = new Map(found.map((document) => [sameValueKey(idOf(document)), document]));
  const docs = (args.ids ?? []).map((id): Json => {
    const document = byId.get(sameValueKey(id));
    return { id, after: document === undefined ? null : measured(document).fingerprint };
  });
  return { kind: 'documents', docs };
}

function keepArgsOf(args: Json): KeepArgs {
  const given = fields(args);
  const connection = given['connection'];
  if (typeof connection !== 'string') {
    throw new Error('undo.keep needs a connection.');
  }
  if (given['phase'] === 'after') {
    return args as unknown as KeepArgs;
  }
  const keeps: Keeps | undefined = keepsOf(given['keeps']);
  if (keeps === undefined) {
    throw new Error('undo.keep needs what to keep.');
  }
  const limit = typeof given['limit'] === 'number' ? given['limit'] : 0;
  return { phase: 'before', connection: connection as ConnectionId, keeps, limit };
}

/** `undo.keep`: what a write is about to change, or the fingerprints of the same documents or keys after it. */
export async function keep(engines: Pick<EngineService, 'send'>, args: Json, signal: AbortSignal): Promise<unknown> {
  const read = keepArgsOf(args);
  if (read.phase === 'after') {
    return readAfter(engines, read, signal);
  }
  return read.keeps.kind === 'keys' ? keysBefore(engines, read, signal) : documentsBefore(engines, read, signal);
}

/** The documents of an operation as they are now, by `_id` in batches of {@link idBatch}: each with its fingerprint. */
async function documentsNow(
  engines: Pick<EngineService, 'send'>,
  entry: Extract<UndoEntry, { engine: 'mongodb' }>,
  ids: readonly Json[],
  signal: AbortSignal,
): Promise<Json> {
  const requests: ConnectionRequest[] = [];
  for (let start = 0; start < ids.length; start += idBatch) {
    requests.push({
      connection: entry.connection,
      request: {
        engine: 'mongodb',
        database: entry.database,
        collection: entry.collection,
        method: 'find',
        arguments: [{ _id: { $in: ids.slice(start, start + idBatch) } }],
        timeLimitMs: keepTimeLimitMs,
      },
    });
  }
  const found = await documentsOf(engines, requests, signal);
  return {
    docs: found.map((document) => ({ id: idOf(document), document, fingerprint: measured(document).fingerprint })),
  };
}

/** The keys of an operation as they are now: `DUMP`, `PTTL` and `TYPE` of each; those that do not exist are left out. */
async function keysNow(
  engines: Pick<EngineService, 'send'>,
  entry: Extract<UndoEntry, { engine: 'redis' }>,
  keys: readonly KeyName[],
  signal: AbortSignal,
): Promise<Json> {
  const requests = keys.flatMap((key) =>
    ['DUMP', 'PTTL', 'TYPE'].map((command): ConnectionRequest => ({
      connection: entry.connection,
      request: { ...redisCommand(entry.database, command, bytesOfBase64(key)), timeLimitMs: keepTimeLimitMs },
    })),
  );
  const replies = await keyReplies(engines, requests, 3, signal);
  const readAt = Date.now();
  return {
    keys: keys.flatMap((key, index): Json[] => {
      const read = keyRead(replies[index] ?? [], readAt);
      return read === undefined ? [] : [{ key, image: read.image, fingerprint: read.fingerprint }];
    }),
  };
}

/** How the documents or keys of an operation's records are now. */
export function readCurrent(
  engines: Pick<EngineService, 'send'>,
  entry: UndoEntry,
  records: JsonFields,
  signal: AbortSignal,
): Promise<Json> {
  const items = (records['docs'] ?? records['keys'] ?? []) as readonly Json[];
  if (entry.engine === 'mongodb') {
    return documentsNow(
      engines,
      entry,
      items.map((each) => fields(each)['id'] ?? null),
      signal,
    );
  }
  const keys = items.flatMap((each): readonly KeyName[] => {
    const key = fields(each)['key'];
    return typeof key === 'string' ? [key as KeyName] : [];
  });
  return keysNow(engines, entry, keys, signal);
}
