/**
 * The replies of the app actions `mcp.undo-history` and `mcp.undo-write` (`mcp.debugging-tools`), made by the main
 * process from what the undo history holds: the operations of the state (`undo/index.json`), and the content of one
 * operation's file (`undo/<id>.json.gz`: `{ docs: [{ id, before, after }] }` or `{ keys: [{ key, before, after }] }`,
 * as `undo.record` writes it). The values of keys stay in the file: only their name, type, size and expiry are given.
 */
import type { ConnectionView } from '../../../shared/connection';
import type { UndoEntry as StoredEntry } from '../../../shared/state/undo';
import { bytesOfBase64 } from '../../undo/types';
import { keyText } from './redis';
import type { KeptDocument, KeptKey, UndoEntry, UndoHistoryReply, UndoWriteReply } from './undo-writes';

type Fields = Readonly<Record<string, unknown>>;

function fieldsOf(value: unknown): Fields | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : undefined;
}

/** One operation as the tools read it: the connection named as it is now, else as it was when recorded. */
export function undoEntryOf(stored: StoredEntry, connections: readonly ConnectionView[]): UndoEntry {
  const name = connections.find((each) => each.id === stored.connection)?.name ?? stored.connectionName;
  const where =
    stored.engine === 'redis'
      ? { redisDatabase: stored.database, keys: stored.inserted + stored.updated + stored.deleted }
      : {
          database: stored.database,
          collection: stored.collection,
          inserted: stored.inserted,
          updated: stored.updated,
          deleted: stored.deleted,
        };
  return {
    id: stored.id,
    at: stored.time,
    connection: stored.connection,
    connectionName: name,
    title: stored.title,
    ...where,
    ...(stored.undone === undefined ? {} : { undoneAt: stored.undone }),
    ...(stored.undoOf === undefined ? {} : { undoOf: stored.undoOf }),
  };
}

/** The reply of `mcp.undo-history`: every operation, newest first; the newest `limit` when it is more than 0. */
export function undoHistoryReply(
  entries: readonly StoredEntry[],
  connections: readonly ConnectionView[],
  limit?: number,
): UndoHistoryReply {
  const sorted = [...entries].sort((one, other) => other.time - one.time);
  const kept = limit === undefined || limit <= 0 ? sorted : sorted.slice(0, limit);
  return { total: entries.length, entries: kept.map((each) => undoEntryOf(each, connections)) };
}

function keptDocument(record: Fields): KeptDocument {
  const before = record['before'] ?? null;
  return { id: record['id'], before, deleted: before !== null && record['after'] === null };
}

function keptKey(record: Fields): KeptKey {
  const name = typeof record['key'] === 'string' ? keyText(bytesOfBase64(record['key'])) : '?';
  const before = fieldsOf(record['before']);
  if (before === undefined) {
    return { key: name, existed: false };
  }
  const dump = before['dump'];
  const pttl = before['pttl'];
  const type = before['type'];
  return {
    key: name,
    existed: true,
    ...(typeof type === 'string' ? { type } : {}),
    ...(typeof dump === 'string' ? { bytes: bytesOfBase64(dump).length } : {}),
    ...(typeof pttl === 'number' && pttl > 0 ? { ttlMs: pttl } : {}),
  };
}

/** The reply of `mcp.undo-write`: the first `limit` documents or keys an operation kept, and how many it kept. */
export function undoWriteReply(content: Fields, limit: number): UndoWriteReply {
  const records = (list: unknown): readonly Fields[] =>
    (Array.isArray(list) ? (list as readonly unknown[]) : []).map((each) => fieldsOf(each) ?? {});
  if (content['keys'] !== undefined) {
    const keys = records(content['keys']);
    return { total: keys.length, keys: keys.slice(0, limit).map(keptKey) };
  }
  const documents = records(content['docs']);
  return { total: documents.length, documents: documents.slice(0, limit).map(keptDocument) };
}
