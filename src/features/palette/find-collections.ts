/**
 * Feature: palette.find-collections
 *
 * Reads the names of the databases, collections and views of a connected MongoDB connection, so that Go to finds them
 * without a delay. It is read in two rounds: the databases (`args` without `databases`), then the collections of each
 * database, one database at a time (`args.databases`). The names are kept until the connection is disconnected, and
 * read again when Go to opens more than 5 minutes after the last read.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import type { CollectionName, KnownCollections } from './types';

/** How long the names are used before Go to reads them again, in ms (Datardo's choice). */
export const namesKeptMs = 5 * 60 * 1000;

/** How many names are kept for a connection at most (Datardo's choice). */
export const mostNames = 10_000;

/** How long each request may take, in ms (R9.2). */
export const timeLimitMs = 10_000;

/** What the read is started with. */
export interface FindCollectionsArgs {
  readonly connection: string;
  /** The databases whose collections to list; absent for the first round, which lists the databases. */
  readonly databases?: readonly string[];
}

/** What a round gives: the names of the databases, or the names of the collections, views and buckets. */
export type FoundCollections =
  | { readonly kind: 'databases'; readonly databases: readonly string[] }
  | { readonly kind: 'collections'; readonly names: readonly CollectionName[]; readonly more: boolean };

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The arguments, read from JSON. */
export function readArgs(args: Json): FindCollectionsArgs {
  const object = isObject(args) ? args : {};
  const connection = typeof object['connection'] === 'string' ? object['connection'] : '';
  const databases = object['databases'];
  return Array.isArray(databases)
    ? { connection, databases: databases.filter((each): each is string => typeof each === 'string') }
    : { connection };
}

/** `db.adminCommand({ listDatabases: 1, nameOnly: true })`. */
export function listDatabasesRequest(): MongoRequest {
  return {
    engine: 'mongodb',
    database: 'admin',
    method: 'runCommand',
    arguments: [{ listDatabases: 1, nameOnly: true, authorizedDatabases: true }],
    timeLimitMs,
  };
}

/** `db.getSiblingDB("<name>").getCollectionInfos({}, { nameOnly: true, authorizedCollections: true })`. */
export function listCollectionsRequest(database: string): MongoRequest {
  return {
    engine: 'mongodb',
    database,
    method: 'listCollections',
    arguments: [{}, { nameOnly: true, authorizedCollections: true }],
    limit: mostNames + 1,
    timeLimitMs,
  };
}

/** The databases first, then the collections of the databases named, one request for each, in order. */
export function request(_context: Context, args: Json): ReadRequest {
  const asked = readArgs(args);
  const connection = connectionId(asked.connection);
  const requests =
    asked.databases === undefined
      ? [listDatabasesRequest()]
      : asked.databases.map((database) => listCollectionsRequest(database));
  return { kind: 'engine', requests: requests.map((each) => ({ connection, request: each })) };
}

/** The names of the databases of a `listDatabases` reply, sorted by name. */
function databasesOf(reply: unknown): readonly string[] {
  const list = isObject(reply) ? reply['databases'] : undefined;
  const names = Array.isArray(list)
    ? list.flatMap((each) => (isObject(each) && typeof each['name'] === 'string' ? [each['name']] : []))
    : [];
  return [...names].sort();
}

/** The collections, views and buckets of one database's `listCollections` reply. */
export function namesOf(database: string, reply: unknown): readonly CollectionName[] {
  const infos = Array.isArray(reply) ? reply.filter(isObject) : [];
  const all = infos.flatMap((info) =>
    typeof info['name'] === 'string' ? [{ name: info['name'], type: info['type'] }] : [],
  );
  const names = new Set(all.map((each) => each.name));
  const buckets = [...names]
    .filter((name) => name.endsWith('.files') && names.has(`${name.slice(0, -'.files'.length)}.chunks`))
    .map((name) => name.slice(0, -'.files'.length));
  const inBuckets = new Set(buckets.flatMap((bucket) => [`${bucket}.files`, `${bucket}.chunks`]));
  const others = all
    .filter((each) => !inBuckets.has(each.name))
    .map((each): CollectionName => ({ database, name: each.name, kind: each.type === 'view' ? 'view' : 'collection' }));
  return [...buckets.map((bucket): CollectionName => ({ database, name: bucket, kind: 'bucket' })), ...others];
}

/** What a round's replies give, in the order of the requests. */
export function parse(replies: readonly unknown[], args: Json): FoundCollections {
  const asked = readArgs(args);
  if (asked.databases === undefined) {
    return { kind: 'databases', databases: databasesOf(replies[0]) };
  }
  const names = asked.databases.flatMap((database, index) => namesOf(database, replies[index]));
  return { kind: 'collections', names: names.slice(0, mostNames), more: names.length > mostNames };
}

/** Whether the names known for a connection are to be read again when Go to opens at `now`. */
export function isStale(known: KnownCollections | undefined, now: number): boolean {
  return known === undefined || now - known.at > namesKeptMs;
}
