/**
 * Feature: history.oplog-window
 *
 * Checks that the writes of a document can be read from an oplog, and reads the oplog's first and last oplog entry:
 * `db.adminCommand({ hello: 1 })`, `db.getSiblingDB("shop").getCollectionInfos({ name: "orders" })`, and the first
 * and the last entry of `local.oplog.rs` in natural order, with their timestamp and wall clock time only.
 *
 * Started with `{ connection, database, collection }`. A connection whose server is already known as a standalone or
 * a mongos is refused before anything is sent; otherwise `parse` says it, from `hello`. A user who cannot read the
 * `local` database gets an error from the server, which {@link oplogReadRefusal} turns into the card's refusal.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import { refuse, type Context, type Outcome, type ReadFeature, type ReadRequest } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { dateOf, timestampOf } from './document-writes';
import { oplogText } from './text';
import { isRecord, objectOf, type JsonObject } from './types';

/** How long each request may take on the server (Datardo's choice). */
export const oplogWindowTimeLimitMs = 10_000;

/** The collection the history is of. */
export interface HistoryPlace {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
}

/** One oplog entry's place in time: its timestamp, and its wall clock time (or the seconds of its timestamp). */
export interface OplogPoint {
  readonly t: number;
  readonly i: number;
  /** In milliseconds since 1970. */
  readonly time: number;
}

/** A refusal, as a Read gives it back in its result. */
export type Refusal = Extract<Outcome, { kind: 'refuse' }>;

/** What `parse` gives: the first and the last oplog entry (neither for an empty oplog), or a refusal. */
export type OplogWindow =
  | { readonly kind: 'window'; readonly first?: OplogPoint; readonly last?: OplogPoint }
  | { readonly kind: 'refused'; readonly refusal: Refusal };

/** The place a read of the history is started on, from its arguments; `undefined` when they do not name one. */
export function placeOf(args: Json): HistoryPlace | undefined {
  const fields = objectOf(args);
  const { connection, database, collection } = fields;
  return typeof connection === 'string' && typeof database === 'string' && typeof collection === 'string'
    ? { connection, database, collection }
    : undefined;
}

function refusalOf(outcome: Outcome): Refusal {
  return outcome as Refusal;
}

function standalone(): Refusal {
  return refusalOf(refuse('history.oplog-window/standalone', oplogText.standalone));
}

function sharded(): Refusal {
  return refusalOf(refuse('history.oplog-window/sharded', oplogText.sharded));
}

/** The query of the first (`1`) or the last (`-1`) oplog entry. */
export function oplogEndRequest(order: 1 | -1): MongoRequest {
  return {
    engine: 'mongodb',
    database: 'local',
    collection: 'oplog.rs',
    method: 'find',
    arguments: [
      {},
      {
        projection: { ts: { $numberInt: '1' }, wall: { $numberInt: '1' } },
        sort: { $natural: { $numberInt: String(order) } },
      },
    ],
    limit: 1,
    timeLimitMs: oplogWindowTimeLimitMs,
  };
}

/** The four requests, in the order `parse` reads their replies. */
export function oplogWindowRequests(place: HistoryPlace): readonly MongoRequest[] {
  return [
    {
      engine: 'mongodb',
      database: 'admin',
      method: 'runCommand',
      arguments: [{ hello: { $numberInt: '1' } }],
      timeLimitMs: oplogWindowTimeLimitMs,
    },
    {
      engine: 'mongodb',
      database: place.database,
      method: 'listCollections',
      arguments: [{ name: place.collection }, { nameOnly: false }],
      timeLimitMs: oplogWindowTimeLimitMs,
    },
    oplogEndRequest(1),
    oplogEndRequest(-1),
  ];
}

/** Feature: history.oplog-window — the four requests; a refusal when the server is known to have no oplog. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const place = placeOf(args);
  if (place === undefined) {
    throw new Error('history.oplog-window needs a connection, a database and a collection.');
  }
  const server = context.state.connections.live[place.connection]?.server;
  if (server?.engine === 'mongodb' && server.topology.kind === 'standalone') {
    return standalone();
  }
  if (server?.engine === 'mongodb' && server.topology.kind === 'sharded') {
    return sharded();
  }
  const connection = connectionId(place.connection);
  return { kind: 'engine', requests: oplogWindowRequests(place).map((each) => ({ connection, request: each })) };
}

/** The place in time of an oplog entry as the oplog gives it. */
export function oplogPoint(entry: Json | undefined): OplogPoint | undefined {
  if (!isRecord(entry) || entry['ts'] === undefined) {
    return undefined;
  }
  const { t, i } = timestampOf(entry['ts']);
  return { t, i, time: dateOf(entry['wall']) ?? t * 1000 };
}

function firstOf(reply: unknown): Json | undefined {
  return Array.isArray(reply) ? (reply[0] as Json | undefined) : undefined;
}

function isView(reply: unknown): boolean {
  const info = firstOf(reply);
  return isRecord(info) && info['type'] === 'view';
}

/** Feature: history.oplog-window — the oplog's first and last oplog entry, or why there is no oplog to read. */
export function parse(replies: readonly unknown[], args: Json = null): OplogWindow {
  const [hello, infos, first, last] = replies;
  const said: JsonObject = isRecord(hello as Json) ? (hello as JsonObject) : {};
  if (said['msg'] === 'isdbgrid') {
    return { kind: 'refused', refusal: sharded() };
  }
  if (typeof said['setName'] !== 'string') {
    return { kind: 'refused', refusal: standalone() };
  }
  if (isView(infos)) {
    const collection = placeOf(args)?.collection ?? '';
    return { kind: 'refused', refusal: refusalOf(refuse('history.oplog-window/view', oplogText.view(collection))) };
  }
  const oldest = oplogPoint(firstOf(first));
  const newest = oplogPoint(firstOf(last));
  return {
    kind: 'window',
    ...(oldest === undefined ? {} : { first: oldest }),
    ...(newest === undefined ? {} : { last: newest }),
  };
}

/** The code and the text of an error, whatever threw it. */
export function errorFacts(error: unknown): { readonly code?: number; readonly text: string } {
  if (typeof error !== 'object' || error === null) {
    return { text: String(error) };
  }
  const record = error as Record<string, unknown>;
  const text = typeof record['message'] === 'string' ? record['message'] : '';
  return typeof record['code'] === 'number' ? { code: record['code'], text } : { text };
}

/** Whether an error says the user may not read what was asked: code 13, or *not authorized*. */
export function isNotAuthorized(error: unknown): boolean {
  const facts = errorFacts(error);
  return facts.code === 13 || /not authorized|unauthorized/iu.test(facts.text);
}

/** The refusal of an error of reading the oplog, when it is that the user may not; `undefined` otherwise. */
export function oplogReadRefusal(error: unknown): Refusal | undefined {
  return isNotAuthorized(error)
    ? refusalOf(refuse('history.oplog-window/not-authorized', oplogText.notAuthorized))
    : undefined;
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('history.oplog-window'), request, parse };
