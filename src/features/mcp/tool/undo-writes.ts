/**
 * The text of `datardo_writes` and `datardo_write_details` (`mcp.debugging-tools`): the operations of the undo
 * history and what one of them kept. The undo area (`undo.record`, `undo.limits`, `undo.show`, M11) is not on this
 * branch: the main process answers the app actions `mcp.undo-history` and `mcp.undo-write` with the shapes below,
 * read from `undo/index.json` and `undo/<id>.json.gz`, and these functions write them.
 */
import type { ConnectionView } from '../../../shared/connection';
import type { SettingsState } from '../../../shared/state/settings';
import { setting } from '../../settings/read';
import { counted } from '../output-limits';
import { titleWithoutValues } from '../read-data';
import { documentsText, shellText, utcText } from './mongo';
import { shortDuration, sizeText } from './units';

/** One operation of the undo history, as `mcp.undo-history` gives it. */
export interface UndoEntry {
  readonly id: string;
  /** When it was made, in milliseconds. */
  readonly at: number;
  readonly connection: string;
  readonly connectionName: string;
  /** For an operation on documents. */
  readonly database?: string;
  readonly collection?: string;
  /** For an operation on keys: the index of the Redis database. */
  readonly redisDatabase?: number;
  readonly title: string;
  readonly inserted?: number;
  readonly updated?: number;
  readonly deleted?: number;
  /** For an operation on keys: how many it kept. */
  readonly keys?: number;
  readonly undoneAt?: number;
  /** The operation this one undid. */
  readonly undoOf?: string;
}

/** The reply of `mcp.undo-history` `{ limit? }`: every operation newest first (the newest `limit` when given). */
export interface UndoHistoryReply {
  readonly total: number;
  readonly entries: readonly UndoEntry[];
}

/** A document one operation kept: as it was before (`null`: the operation inserted it), and whether it deleted it. */
export interface KeptDocument {
  readonly id: unknown;
  readonly before: unknown;
  readonly deleted: boolean;
}

/** A key one operation kept: its name as `keyText` writes it, and what it was before. */
export interface KeptKey {
  readonly key: string;
  /** `false` for a key the operation created. */
  readonly existed: boolean;
  readonly type?: string;
  readonly bytes?: number;
  /** Its time to live then, in milliseconds; absent when it had none. */
  readonly ttlMs?: number;
}

/** The reply of `mcp.undo-write` `{ id, limit }`: the first `limit` documents or keys, and how many it kept. */
export interface UndoWriteReply {
  readonly total: number;
  readonly documents?: readonly KeptDocument[];
  readonly keys?: readonly KeptKey[];
}

function countsText(entry: UndoEntry): string {
  if (entry.keys !== undefined) {
    return counted(entry.keys, 'key');
  }
  const counts = [
    ...(entry.inserted ? [`${entry.inserted.toLocaleString('en-US')} inserted`] : []),
    ...(entry.updated ? [`${entry.updated.toLocaleString('en-US')} updated`] : []),
    ...(entry.deleted ? [`${entry.deleted.toLocaleString('en-US')} deleted`] : []),
  ];
  return counts.length === 0 ? 'no documents' : counts.join(', ');
}

/** `id <id> · <time> · Local › shop.orders · <title> · 3 updated`, or `… · Cache local › db0 · … · 2 keys`. */
export function entryText(entry: UndoEntry, readData: boolean): string {
  const where =
    entry.redisDatabase === undefined
      ? `${entry.database ?? '?'}${entry.collection === undefined ? '' : `.${entry.collection}`}`
      : `db${String(entry.redisDatabase)}`;
  return [
    `id ${entry.id}`,
    utcText(entry.at),
    `${entry.connectionName} › ${where}`,
    readData ? entry.title : titleWithoutValues(entry.title),
    countsText(entry),
    ...(entry.undoneAt === undefined ? [] : [`undone ${utcText(entry.undoneAt)}`]),
    ...(entry.undoOf === undefined ? [] : [`undo of ${entry.undoOf}`]),
  ].join(' · ');
}

/** The sentence of the limits of the history (`undo.limits`). */
export function limitsSentence(settings: SettingsState): string {
  const operations = setting(settings, 'datardo.undo.maxOperations');
  const days = setting(settings, 'datardo.undo.maxDays');
  const documents = setting(settings, 'datardo.undo.maxDocumentsPerOperation');
  return `The history keeps up to ${counted(operations, 'write')} from the last ${counted(days, 'day')}, of up to ${counted(documents, 'document')} each: older or larger writes aren't listed.`;
}

/** Why the writes through a connection are not recorded; `undefined` when they are. */
export function notRecordedWhy(connection: ConnectionView): string | undefined {
  if (connection.readOnly) {
    return 'read-only';
  }
  return connection.keepsUndo ? undefined : 'history off';
}

/** The lines after the list: the limits, the history off, the connections whose writes are not recorded. */
export function historyNotes(settings: SettingsState, connections: readonly ConnectionView[]): readonly string[] {
  const off = connections.filter((each) => notRecordedWhy(each) !== undefined);
  return [
    limitsSentence(settings),
    ...(setting(settings, 'datardo.undo.enabled')
      ? []
      : ["The undo history is off (setting datardo.undo.enabled): new writes aren't recorded."]),
    ...(off.length === 0
      ? []
      : [
          `Writes aren't recorded for: ${off.map((each) => `${each.name} (${notRecordedWhy(each) ?? ''})`).join(', ')}.`,
        ]),
  ];
}

/** `- orders:42 · hash · 1.2 KB · expires in 59 m`, `persistent`, or `- cart:7 · did not exist`. */
export function keptKeyLine(kept: KeptKey): string {
  if (!kept.existed) {
    return `- ${kept.key} · did not exist`;
  }
  return [
    `- ${kept.key}`,
    kept.type ?? '?',
    kept.bytes === undefined ? '?' : sizeText(kept.bytes),
    kept.ttlMs === undefined ? 'persistent' : `expires in ${shortDuration(kept.ttlMs / 1000)}`,
  ].join(' · ');
}

/** What one operation kept, as it was before it. */
export function keptText(entry: UndoEntry, reply: UndoWriteReply): string {
  const keys = reply.keys ?? [];
  const documents = reply.documents ?? [];
  const shown = keys.length + documents.length;
  const word = entry.keys === undefined ? 'document' : 'key';
  const lines = [
    entryText(entry, true),
    `${counted(reply.total, word)} recorded${reply.total > shown ? `, the first ${String(shown)} shown` : ''}.`,
  ];
  if (keys.length > 0) {
    lines.push('', 'Keys, as they were before (their values are kept but not returned):', ...keys.map(keptKeyLine));
  }
  const updated = documents.filter((each) => each.before !== null && !each.deleted).map((each) => each.before);
  const deleted = documents.filter((each) => each.before !== null && each.deleted).map((each) => each.before);
  const inserted = documents.filter((each) => each.before === null).map((each) => shellText(each.id));
  if (updated.length > 0) {
    lines.push('', 'Updated, as they were before:', documentsText(updated));
  }
  if (deleted.length > 0) {
    lines.push('', 'Deleted, as they were:', documentsText(deleted));
  }
  if (inserted.length > 0) {
    lines.push('', `Inserted (only their _id is kept): ${inserted.join(', ')}`);
  }
  return lines.join('\n');
}
