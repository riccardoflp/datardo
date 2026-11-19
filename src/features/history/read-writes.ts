/**
 * Feature: history.read-writes
 *
 * Reads a document's writes from the oplog backwards from the newest oplog entry, in windows of time that grow, until
 * it has 100 writes, its 8 seconds are up or the oplog's first oplog entry is reached, so that a large oplog is never
 * read whole. Each *read* takes up where the one before stopped (**Load older**).
 *
 * One window is one Read: `request` sends the query of the window, `parse` gives the writes of the document it found.
 * What drives the windows (the main process) starts a read with {@link firstWindow}, sends each window, and asks
 * {@link afterWindow} whether the read goes on with the next window or stops, and where; an error of a window goes to
 * {@link windowFailed}. Every value is kept as stored: the `_id` and the timestamps are canonical Extended JSON.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import { refuse, type Context, type ReadFeature, type ReadRequest } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { documentWrites, idKey, timestampOf } from './document-writes';
import { errorFacts, isNotAuthorized, type OplogPoint, type Refusal } from './oplog-window';
import { oplogText } from './text';
import { objectOf, type DocumentWrite } from './types';

/** The most writes of the document one read returns, give or take those of the oplog entry that completes them. */
export const mostWrites = 100;

/** How long one read may take, in milliseconds. */
export const readTimeMs = 8000;

/** The seconds of oplog the first window of the first read covers; each next window of a read is 4 times longer. */
export const firstSpanSeconds = 3600;

/** How much longer each next window of a read is. */
export const spanGrowth = 4;

/** The least time a query is given on the server, in milliseconds. */
export const leastQueryMs = 500;

/** The oplog entries the server sends in one batch. */
export const batchSize = 200;

/** A place in the oplog: an oplog timestamp. */
export interface OplogTime {
  readonly t: number;
  readonly i: number;
}

/** The document a history is of: its collection on a connection, and its `_id` as canonical Extended JSON. */
export interface HistoryDocument {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
  readonly id: Json;
}

/** One window of a read: what `request` sends and `parse` reads, as JSON. */
export interface WindowArgs {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
  /** The `_id` of the document, as canonical Extended JSON. */
  readonly id: Json;
  /** The seconds the window starts at (`$gte`). */
  readonly from: number;
  /** The timestamp the window ends before (`$lt`). */
  readonly to: OplogTime;
  /** The window's length in seconds. */
  readonly span: number;
  /** The seconds of the oplog's first oplog entry: no window starts before it. */
  readonly oplogStart: number;
  /** How many writes the read still wants. */
  readonly needed: number;
  /** When the read started, in milliseconds since 1970. */
  readonly startedAt: number;
  /** Whether this is the first window of the read. */
  readonly first: boolean;
}

/** What one window found: the writes of the document, the oldest oplog entry returned, and whether it was enough. */
export interface WindowWrites {
  readonly writes: readonly DocumentWrite[];
  readonly oldest?: OplogTime;
  readonly enough: boolean;
}

/** Where a read stopped. */
export interface ReadStop {
  /** The oplog was read back to this timestamp: everything from it on was read. */
  readonly readBackTo: OplogTime;
  /** The oplog's first oplog entry was reached: there is nothing older to load. */
  readonly complete: boolean;
  /** A query ran out of time. */
  readonly timedOut: boolean;
}

/** What follows a window: the next window of the read, or the end of the read. */
export type ReadStep =
  { readonly kind: 'next'; readonly args: WindowArgs } | { readonly kind: 'stop'; readonly stop: ReadStop };

function timestamp(time: OplogTime): Json {
  return { $timestamp: { t: time.t, i: time.i } };
}

/**
 * The first window of a read: from one second after the newest oplog entry, or from where the read before stopped,
 * 3,600 seconds back; `undefined` when there is nothing to read (an empty oplog, or the read before reached its start).
 */
export function firstWindow(
  document: HistoryDocument,
  oplog: { readonly first?: OplogPoint; readonly last?: OplogPoint },
  readBackTo: OplogTime | undefined,
  startedAt: number,
): WindowArgs | undefined {
  const { first, last } = oplog;
  if (first === undefined || last === undefined) {
    return undefined;
  }
  if (readBackTo !== undefined && (readBackTo.t < first.t || (readBackTo.t === first.t && readBackTo.i <= first.i))) {
    return undefined;
  }
  const to = readBackTo ?? { t: last.t + 1, i: 0 };
  const from = Math.max(first.t, to.t - firstSpanSeconds);
  return {
    ...document,
    from,
    to,
    span: firstSpanSeconds,
    oplogStart: first.t,
    needed: mostWrites,
    startedAt,
    first: true,
  };
}

/** The window as given to a feature: `undefined` when it is not one. */
export function windowOf(args: Json): WindowArgs | undefined {
  const fields = objectOf(args);
  const to = objectOf(fields['to']);
  const numbers = [fields['from'], fields['span'], fields['oplogStart'], fields['needed'], fields['startedAt']];
  const valid =
    typeof fields['connection'] === 'string' &&
    typeof fields['database'] === 'string' &&
    typeof fields['collection'] === 'string' &&
    fields['id'] !== undefined &&
    numbers.every((value) => typeof value === 'number') &&
    typeof to['t'] === 'number' &&
    typeof to['i'] === 'number';
  return valid ? (fields as unknown as WindowArgs) : undefined;
}

/** The three conditions of the oplog entries of a document: its writes, those inside `applyOps`, its collection's. */
export function writesFilter(database: string, collection: string, id: Json): Json {
  const namespace = `${database}.${collection}`;
  const ofDocument = { op: { $in: ['i', 'u', 'd'] }, ns: namespace, $or: [{ 'o._id': id }, { 'o2._id': id }] };
  return {
    $or: [
      ofDocument,
      { op: 'c', 'o.applyOps': { $elemMatch: ofDocument } },
      {
        op: 'c',
        ns: `${database}.$cmd`,
        $or: [
          { 'o.drop': collection },
          { 'o.renameCollection': namespace },
          { 'o.to': namespace },
          { 'o.dropDatabase': { $exists: true } },
        ],
      },
    ],
  };
}

/** How long the query of a window may take: what is left of the read's 8 seconds, at least 500 milliseconds. */
export function queryTimeMs(window: WindowArgs, now: number): number {
  return Math.max(leastQueryMs, readTimeMs - (now - window.startedAt));
}

/** The query of one window, newest first. */
export function windowRequest(window: WindowArgs, now: number): MongoRequest {
  const filter = objectOf(writesFilter(window.database, window.collection, window.id));
  const limitMs = queryTimeMs(window, now);
  return {
    engine: 'mongodb',
    database: 'local',
    collection: 'oplog.rs',
    method: 'find',
    arguments: [
      { ts: { $gte: timestamp({ t: window.from, i: 0 }), $lt: timestamp(window.to) }, ...filter },
      {
        sort: { $natural: { $numberInt: '-1' } },
        maxTimeMS: { $numberInt: String(limitMs) },
        batchSize: { $numberInt: String(batchSize) },
      },
    ],
    limit: Math.max(1, window.needed),
    timeLimitMs: limitMs,
  };
}

/** Feature: history.read-writes — the query of one window. */
export function request(context: Context, args: Json): ReadRequest {
  const window = windowOf(args);
  if (window === undefined) {
    throw new Error('history.read-writes needs a window of the oplog.');
  }
  return {
    kind: 'engine',
    requests: [{ connection: connectionId(window.connection), request: windowRequest(window, context.now) }],
  };
}

/**
 * Feature: history.read-writes — the writes of the document in the oplog entries of one window, newest first, up to
 * the oplog entry that completes the writes the read still wants.
 */
export function parse(replies: readonly unknown[], args: Json): WindowWrites {
  const window = windowOf(args);
  const entries = Array.isArray(replies[0]) ? (replies[0] as readonly Json[]) : [];
  if (window === undefined) {
    return { writes: [], enough: false };
  }
  const namespace = `${window.database}.${window.collection}`;
  const key = idKey(window.id);
  const writes: DocumentWrite[] = [];
  let oldest: OplogTime | undefined;
  for (const entry of entries) {
    writes.push(...documentWrites(entry, namespace, key));
    oldest = timestampOf(objectOf(entry)['ts']);
    if (writes.length >= window.needed) {
      break;
    }
  }
  const enough = writes.length >= window.needed || entries.length >= Math.max(1, window.needed);
  return { writes, ...(oldest === undefined ? {} : { oldest }), enough };
}

/** What follows a window that answered, at the time `now`. */
export function afterWindow(window: WindowArgs, found: WindowWrites, now: number): ReadStep {
  if (found.enough && found.oldest !== undefined) {
    return { kind: 'stop', stop: { readBackTo: found.oldest, complete: false, timedOut: false } };
  }
  const start = { t: window.from, i: 0 };
  if (window.from <= window.oplogStart) {
    return { kind: 'stop', stop: { readBackTo: start, complete: true, timedOut: false } };
  }
  if (now - window.startedAt >= readTimeMs) {
    return { kind: 'stop', stop: { readBackTo: start, complete: false, timedOut: false } };
  }
  const span = window.span * spanGrowth;
  return {
    kind: 'next',
    args: {
      ...window,
      to: start,
      from: Math.max(window.oplogStart, window.from - span),
      span,
      needed: window.needed - found.writes.length,
      first: false,
    },
  };
}

/** Whether an error says a query ran out of time: error 50, `MaxTimeMSExpired`. */
export function isTimeLimit(error: unknown): boolean {
  const facts = errorFacts(error);
  return facts.code === 50 || /MaxTimeMSExpired|time limit/iu.test(facts.text);
}

/**
 * What follows a window that failed: the card's refusal when the oplog cannot be read or the first window ran out of
 * time, the end of the read when a later one did, and `undefined` for any other error, which is shown as it is.
 */
export function windowFailed(window: WindowArgs, error: unknown): ReadStep | Refusal | undefined {
  if (isNotAuthorized(error)) {
    return refuse('history.read-writes/not-authorized', oplogText.notAuthorized) as Refusal;
  }
  if (!isTimeLimit(error)) {
    return undefined;
  }
  if (window.first) {
    return refuse('history.read-writes/too-slow', oplogText.tooSlow(readTimeMs / 1000)) as Refusal;
  }
  return { kind: 'stop', stop: { readBackTo: window.to, complete: false, timedOut: true } };
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('history.read-writes'), request, parse };
