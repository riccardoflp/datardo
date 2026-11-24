/**
 * Feature: search.collections
 *
 * The collections a search reads, in the order they are read and shown, each with its estimated number of documents.
 * Started with `{ connection, database?, collections?, views, fallback, exclusions? }` (`collectionsArgs` builds them
 * from the page): **In** (absent for **Every database**), the collections ticked, **Views**, the database the
 * connection string names, searched alone when the user may not list the databases, and the keys the connection
 * excludes from searches when the search starts (`tree.excluded`).
 *
 * The read goes in steps, each knowing what the one before answered. The runner (or the worker of the search) carries
 * it out as a loop over pure functions, the replies kept in the order their requests were sent:
 *
 * 1. `request` gives the first request: `listDatabases` on `admin` for **Every database**, otherwise the
 *    `listCollections` of the database;
 * 2. `nextRequests(args, replies)` gives what to send next and nothing once the read is complete or has failed: the
 *    `listCollections` of every database searched, then the `estimatedDocumentCount` of every collection that is not a
 *    view;
 * 3. `parse(replies, args)` gives the collections and how many were left out because they are excluded from searches,
 *    or the server's message when a database could not be listed.
 *
 * A request that fails reaches the read as an entry of `replies` (`{ kind: 'error', message }` or an `Error`), not as
 * the end of the read: a refused `listDatabases` and a failed count are part of the rules.
 */
import type { ConnectionRequest, Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { savedConnection } from '../../shared/state/connections';
import { bucketNames } from '../tree/list-collections';
import { databaseOfAddress } from '../tree/list-databases';
import { compareNames, failureOf, isObject, numberOf } from '../tree/types';
import { exclusionsOf } from '../../shared/exclusion';
import type { SearchCollection, SearchInput } from './types';

/** How long listing the databases, the collections and counting may take, in milliseconds (Datardo's choice, R9.2). */
export const listTimeLimitMs = 20_000;

/** The most databases and collections a listing returns (Datardo's choice, R9.2). */
export const mostListed = 10_000;

/** The databases a search of **Every database** leaves out. */
export const skippedDatabases: readonly string[] = ['admin', 'local', 'config'];

/** What the read is started with. */
export interface CollectionsArgs {
  readonly connection: string;
  /** **In**; absent for **Every database**. */
  readonly database?: string;
  /** The collections ticked: always read, whatever they are. */
  readonly collections: readonly string[];
  readonly views: boolean;
  /** The database searched alone when the user may not list the databases. */
  readonly fallback: string;
  /** The keys the connection excludes from searches (`tree.excluded`), as they were when the search started. */
  readonly exclusions: readonly string[];
}

/**
 * What the read gives: the collections and the number of databases and collections left out because they are excluded
 * from searches (rule 7), or the server's message when the collections could not be listed.
 */
export type CollectionsRead =
  | { readonly kind: 'collections'; readonly collections: readonly SearchCollection[]; readonly excluded: number }
  | { readonly kind: 'error'; readonly message: string };

/** The arguments of the read for a search of `connection` with what the page shows. */
export function collectionsArgs(state: AppState, connection: ConnectionId, input: SearchInput): Json {
  const saved = savedConnection(state.connections, connection);
  const scope = input.database === undefined ? {} : { database: input.database, collections: [...input.collections] };
  const fallback = databaseOfAddress(saved?.address ?? '') ?? 'test';
  return { connection, ...scope, views: input.views, fallback, exclusions: [...(saved?.exclusions ?? [])] };
}

function argsOf(args: Json): CollectionsArgs {
  const fields = isObject(args) ? args : {};
  const text = (name: string): string | undefined => {
    const value = fields[name];
    return typeof value === 'string' ? value : undefined;
  };
  const ticked = fields['collections'];
  const database = text('database');
  return {
    connection: text('connection') ?? '',
    ...(database === undefined ? {} : { database }),
    collections: Array.isArray(ticked) ? ticked.filter((name): name is string => typeof name === 'string') : [],
    views: fields['views'] === true,
    fallback: text('fallback') ?? 'test',
    exclusions: exclusionsOf(fields['exclusions']) ?? [],
  };
}

function on(args: CollectionsArgs, request: Omit<MongoRequest, 'engine' | 'timeLimitMs'>): ConnectionRequest {
  return {
    connection: connectionId(args.connection),
    request: { engine: 'mongodb', ...request, timeLimitMs: listTimeLimitMs },
  };
}

/** `db.adminCommand({ listDatabases: 1, nameOnly: true, authorizedDatabases: true })`. */
function databasesRequest(args: CollectionsArgs): ConnectionRequest {
  const command = { listDatabases: { $numberInt: '1' }, nameOnly: true, authorizedDatabases: true };
  return on(args, { database: 'admin', method: 'runCommand', arguments: [command] });
}

/** `listCollections` with `nameOnly: false` and `authorizedCollections: true`, read to its end. */
function collectionsRequest(args: CollectionsArgs, database: string): ConnectionRequest {
  const options = { nameOnly: false, authorizedCollections: true };
  return on(args, { database, method: 'listCollections', arguments: [{}, options], limit: mostListed });
}

/** `db.orders.estimatedDocumentCount()`. */
function countRequest(args: CollectionsArgs, each: SearchCollection): ConnectionRequest {
  return on(args, {
    database: each.database,
    collection: each.collection,
    method: 'estimatedDocumentCount',
    arguments: [],
  });
}

/** The first request of the read: `listDatabases` for **Every database**, the `listCollections` of **In** otherwise. */
export function firstRequest(args: Json): ConnectionRequest {
  const asked = argsOf(args);
  return asked.database === undefined ? databasesRequest(asked) : collectionsRequest(asked, asked.database);
}

/** Feature: search.collections — the first request. */
export function request(_context: Context, args: Json): ReadRequest {
  return { kind: 'engine', requests: [firstRequest(args)] };
}

/** The databases `listDatabases` answered without the three of the server; the fallback when it could not answer. */
function listedDatabases(args: CollectionsArgs, replies: readonly unknown[]): readonly string[] {
  const [reply] = replies;
  const list = isObject(reply) && failureOf(reply) === undefined ? reply['databases'] : undefined;
  if (!Array.isArray(list)) {
    return [args.fallback];
  }
  return list
    .flatMap((each): string[] => (isObject(each) && typeof each['name'] === 'string' ? [each['name']] : []))
    .filter((name) => !skippedDatabases.includes(name))
    .sort(compareNames);
}

/**
 * The databases searched: **In**, even when it is excluded; or those listed, without those excluded from searches
 * (rule 6).
 */
function databasesOf(args: CollectionsArgs, replies: readonly unknown[]): readonly string[] {
  if (args.database !== undefined) {
    return [args.database];
  }
  return listedDatabases(args, replies).filter((name) => !args.exclusions.includes(name));
}

/** The databases rule 6 left out: those listed that are excluded, with **Every database**. */
function excludedDatabases(args: CollectionsArgs, replies: readonly unknown[]): number {
  return args.database === undefined
    ? listedDatabases(args, replies).filter((name) => args.exclusions.includes(name)).length
    : 0;
}

interface Listed {
  readonly name: string;
  readonly view: boolean;
}

function listedOf(reply: unknown): readonly Listed[] {
  const documents = Array.isArray(reply) ? (reply as readonly unknown[]) : [];
  return documents.flatMap((each): Listed[] =>
    isObject(each) && typeof each['name'] === 'string' ? [{ name: each['name'], view: each['type'] === 'view' }] : [],
  );
}

/** The collections of one database a search reads, and how many rule 6 left out. */
interface Kept {
  readonly collections: readonly SearchCollection[];
  readonly excluded: number;
}

/** Rules 1 to 3 and 6: the collections of one database a search reads, sorted by name. */
function keptOf(args: CollectionsArgs, database: string, reply: unknown): Kept {
  const listed = listedOf(reply);
  const chunks = new Set(bucketNames(listed.map((each) => each.name)).map((bucket) => `${bucket}.chunks`));
  const ticked = args.collections.length > 0;
  const searchable = ticked
    ? listed.filter((each) => args.collections.includes(each.name))
    : listed.filter((each) => !each.name.startsWith('system.') && !chunks.has(each.name) && (args.views || !each.view));
  const kept = ticked ? searchable : searchable.filter((each) => !args.exclusions.includes(`${database}.${each.name}`));
  const collections = [...kept]
    .sort((one, other) => compareNames(one.name, other.name))
    .map((each) => ({ database, collection: each.name, view: each.view }));
  return { collections, excluded: searchable.length - kept.length };
}

/** Where the replies of each step start, from the replies so far. */
interface Layout {
  readonly databases: readonly string[];
  readonly listedAt: number;
  readonly countsAt: number;
}

function layoutOf(args: CollectionsArgs, replies: readonly unknown[]): Layout {
  const listedAt = args.database === undefined ? 1 : 0;
  const databases = databasesOf(args, replies);
  return { databases, listedAt, countsAt: listedAt + databases.length };
}

/** The collections listed, in order, once every database was listed, with how many were left out; or a failure's message. */
function listedCollections(args: CollectionsArgs, replies: readonly unknown[]): Kept | string {
  const layout = layoutOf(args, replies);
  const listings = replies.slice(layout.listedAt, layout.countsAt);
  const failed = listings.map(failureOf).find((message) => message !== undefined);
  if (failed !== undefined) {
    return failed;
  }
  const kept = layout.databases.map((database, index) => keptOf(args, database, listings[index]));
  return {
    collections: kept.flatMap((each) => each.collections),
    excluded: excludedDatabases(args, replies) + kept.reduce((sum, each) => sum + each.excluded, 0),
  };
}

/** Feature: search.collections — what to send next, given every reply so far; nothing once the read is complete. */
export function nextRequests(args: Json, replies: readonly unknown[]): readonly ConnectionRequest[] {
  const asked = argsOf(args);
  const layout = layoutOf(asked, replies);
  if (replies.length < layout.listedAt) {
    return [];
  }
  if (replies.length === layout.listedAt && asked.database === undefined) {
    return layout.databases.map((database) => collectionsRequest(asked, database));
  }
  const listed = replies.length === layout.countsAt ? listedCollections(asked, replies) : undefined;
  return listed === undefined || typeof listed === 'string'
    ? []
    : listed.collections.filter((each) => !each.view).map((each) => countRequest(asked, each));
}

/**
 * Feature: search.collections — the collections with their estimated counts and how many were left out because they
 * are excluded from searches, or the message of a listing that failed.
 */
export function parse(replies: readonly unknown[], args: Json = null): CollectionsRead {
  const asked = argsOf(args);
  const layout = layoutOf(asked, replies);
  const listed = listedCollections(asked, replies);
  if (typeof listed === 'string') {
    return { kind: 'error', message: listed };
  }
  const { collections, excluded } = listed;
  const counts = replies.slice(layout.countsAt);
  let next = 0;
  const counted = collections.map((each): SearchCollection => {
    if (each.view) {
      return each;
    }
    const count = failureOf(counts[next]) === undefined ? numberOf(counts[next]) : undefined;
    next += 1;
    return count === undefined ? each : { ...each, estimate: count };
  });
  return { kind: 'collections', collections: counted, excluded };
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('search.collections'), request, parse };
