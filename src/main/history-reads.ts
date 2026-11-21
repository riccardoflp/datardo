/**
 * The read of a document history the page starts (`history.read-writes`, the app action `history.read`): whether there
 * is an oplog and how far back it goes (`history.oplog-window`), then the windows of the oplog one after the other as
 * the rules of `history.read-writes` say, the document as it is now (`document.read`), and the operations of the undo
 * history that wrote it (`undo.writes-of`, for `history.own-writes`). Nothing is read but the oplog, the document and
 * Datardo's own files of the undo history; nothing is written.
 *
 * A refusal (a standalone server, a view, the oplog not readable, the first window too slow) is given back as data,
 * for the page to show in place of its list; an error of the server is given back with its message.
 */
import type { EngineService } from '../engines';
import type { Json } from '../shared/engine-request';
import type { Context, Outcome, Platform, ReadRequest } from '../shared/feature';
import { connectionId, featureId, type ConnectionId } from '../shared/ids';
import type { AppState } from '../shared/state';
import type { StateHolder } from '../runner/ports';
import {
  oplogReadRefusal,
  parse as parseOplog,
  request as oplogRequest,
  type Refusal,
} from '../features/history/oplog-window';
import {
  afterWindow,
  firstWindow,
  parse as parseWindow,
  windowFailed,
  windowRequest,
  type HistoryRead,
  type OplogTime,
  type ReadStop,
  type WindowArgs,
} from '../features/history/read-writes';
import { recordedSpan, type RecordedOperation } from '../features/history/own-writes';
import { documentHistory } from '../features/history/versions';
import { objectOf, type DocumentWrite, type JsonObject } from '../features/history/types';
import { parse as parseDocument, request as documentRequest } from '../features/document/read';
import { writesOf, type RecordsByOperation } from '../features/undo/writes-of';
import type { DocumentRecord, UndoEntry } from '../features/undo/types';
import { readOperationFile } from '../storage/undo';

/** What the read needs of the main process. */
export interface HistoryReadPorts {
  readonly engines: () => EngineService;
  readonly state: Pick<StateHolder, 'get'>;
  readonly dataFolder: string;
  readonly now: () => number;
  readonly platform: Platform;
}

/** The document the page reads the history of, and where the read before stopped. */
interface Asked {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
  readonly id: Json;
  readonly readBackTo?: OplogTime;
}

function askedOf(args: Json): Asked {
  const fields = objectOf(args);
  const { connection, database, collection, id } = fields;
  if (typeof connection !== 'string' || typeof database !== 'string' || typeof collection !== 'string') {
    throw new Error('history.read-writes needs a connection, a database, a collection and an _id.');
  }
  const back = objectOf(fields['readBackTo']);
  const readBackTo =
    typeof back['t'] === 'number' && typeof back['i'] === 'number' ? { t: back['t'], i: back['i'] } : undefined;
  return { connection, database, collection, id: id ?? null, ...(readBackTo === undefined ? {} : { readBackTo }) };
}

function refused(refusal: Refusal): HistoryRead {
  return { kind: 'refused', code: refusal.code, message: refusal.message };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function contextOf(ports: HistoryReadPorts, state: AppState, asked: Asked): Context {
  return {
    feature: featureId('history.read-writes'),
    now: ports.now(),
    platform: ports.platform,
    startedBy: 'user',
    target: {
      kind: 'collection',
      connection: connectionId(asked.connection),
      database: asked.database,
      collection: asked.collection,
    },
    state,
  };
}

async function sendAll(
  ports: HistoryReadPorts,
  asked: ReadRequest | Outcome,
  signal: AbortSignal,
): Promise<readonly unknown[] | Refusal> {
  if (asked.kind === 'refuse') {
    return asked;
  }
  if (asked.kind !== 'engine') {
    throw new Error('The read of the history asked for something it cannot send.');
  }
  const replies: unknown[] = [];
  for (const each of asked.requests) {
    replies.push(await ports.engines().send(each, signal));
  }
  return replies;
}

function isRefusal(value: unknown): value is Refusal {
  return !Array.isArray(value);
}

/** The windows of one read, as `history.read-writes` drives them: the writes found and where the read stopped. */
async function readWindows(
  ports: HistoryReadPorts,
  first: WindowArgs | undefined,
  start: OplogTime,
  signal: AbortSignal,
): Promise<{ readonly writes: readonly DocumentWrite[]; readonly stop: ReadStop } | Refusal> {
  const writes: DocumentWrite[] = [];
  let window = first;
  while (window !== undefined) {
    signal.throwIfAborted();
    const connection: ConnectionId = connectionId(window.connection);
    let reply: unknown;
    try {
      reply = await ports.engines().send({ connection, request: windowRequest(window, ports.now()) }, signal);
    } catch (error: unknown) {
      const failed = windowFailed(window, error);
      if (failed === undefined) {
        throw error;
      }
      if (failed.kind === 'refuse') {
        return failed;
      }
      return {
        writes,
        stop: failed.kind === 'stop' ? failed.stop : { readBackTo: window.to, complete: false, timedOut: true },
      };
    }
    const found = parseWindow([reply], window as unknown as Json);
    writes.push(...found.writes);
    const step = afterWindow(window, found, ports.now());
    if (step.kind === 'stop') {
      return { writes, stop: step.stop };
    }
    window = step.args;
  }
  return { writes, stop: { readBackTo: start, complete: true, timedOut: false } };
}

/** The undo operations on the collection, with those that undid them, whose files are worth reading. */
function entriesAround(
  entries: readonly UndoEntry[],
  asked: Asked,
  span: { from: number; to: number },
): readonly UndoEntry[] {
  const near = entries.filter(
    (entry) =>
      entry.engine === 'mongodb' &&
      entry.connection === asked.connection &&
      entry.database === asked.database &&
      entry.collection === asked.collection &&
      entry.time >= span.from &&
      entry.time <= span.to,
  );
  const ids = new Set(near.map((entry) => entry.id));
  return [...near, ...entries.filter((entry) => entry.undoOf !== undefined && ids.has(entry.undoOf))];
}

/** The operations of the undo history that wrote the document between the times of the writes found. */
async function recordedOf(
  ports: HistoryReadPorts,
  asked: Asked,
  writes: readonly DocumentWrite[],
  current: JsonObject | null,
): Promise<readonly RecordedOperation[]> {
  const span = recordedSpan(documentHistory(writes, current ?? undefined).versions);
  if (span === undefined) {
    return [];
  }
  const operations = ports.state.get().undo.entries;
  const records: Record<string, RecordsByOperation[string]> = {};
  for (const entry of entriesAround(operations, asked, span)) {
    const file = await readOperationFile(ports.dataFolder, entry.id).catch(() => undefined);
    const docs = file?.kind === 'read' ? file.content['docs'] : undefined;
    if (Array.isArray(docs)) {
      records[entry.id] = { kind: 'documents', docs: docs as unknown as readonly DocumentRecord[] };
    }
  }
  const place = {
    connection: connectionId(asked.connection),
    database: asked.database,
    collection: asked.collection,
  };
  return writesOf({ operations, records }, place, asked.id, span).map((write) => ({
    title: write.title,
    time: write.time,
    did: write.kind,
  }));
}

/** `history.read` `{ connection, database, collection, id, readBackTo? }`: one read of the history of a document. */
export async function readHistory(ports: HistoryReadPorts, args: Json, signal: AbortSignal): Promise<HistoryRead> {
  const asked = askedOf(args);
  const startedAt = ports.now();
  const context = contextOf(ports, ports.state.get(), asked);
  const place = { connection: asked.connection, database: asked.database, collection: asked.collection };
  try {
    let replies: readonly unknown[] | Refusal;
    try {
      replies = await sendAll(ports, oplogRequest(context, place), signal);
    } catch (error: unknown) {
      const refusal = oplogReadRefusal(error);
      if (refusal === undefined) {
        throw error;
      }
      return refused(refusal);
    }
    if (isRefusal(replies)) {
      return refused(replies);
    }
    const oplog = parseOplog(replies, place);
    if (oplog.kind === 'refused') {
      return refused(oplog.refusal);
    }
    const window = firstWindow({ ...place, id: asked.id }, oplog, asked.readBackTo, startedAt);
    // With no window to read, the read before reached the oplog's first oplog entry, or the oplog is empty.
    const start = asked.readBackTo ?? { t: oplog.first?.t ?? 0, i: 0 };
    const found = await readWindows(ports, window, start, signal);
    if ('kind' in found) {
      return refused(found);
    }
    const document = await sendAll(ports, documentRequest(context, { ...place, id: asked.id }), signal);
    const current = isRefusal(document) ? null : parseDocument(document);
    const recorded = await recordedOf(ports, asked, found.writes, current);
    return {
      kind: 'read',
      oplog: {
        ...(oplog.first === undefined ? {} : { first: oplog.first }),
        ...(oplog.last === undefined ? {} : { last: oplog.last }),
      },
      writes: found.writes,
      stop: found.stop,
      durationMs: ports.now() - startedAt,
      current,
      recorded,
    };
  } catch (error: unknown) {
    if (signal.aborted) {
      throw error;
    }
    return { kind: 'error', message: messageOf(error) };
  }
}
