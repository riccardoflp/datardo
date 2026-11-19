/**
 * Feature: tree.list-collections
 *
 * Reads the collections, views and time series collections of one database, with their names and kinds only
 * (`nameOnly`, which keeps the command from locking the collections), and finds its GridFS buckets.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import {
  compareNames,
  failureOf,
  isObject,
  textArg,
  type CollectionEntry,
  type CollectionKind,
  type DatabaseContents,
} from './types';

/** How long the server may take, in ms (R9.2; Datardo's choice). */
export const listTimeLimitMs = 10_000;

/** How many entries of a database are read at most (R9.2; Datardo's choice). */
export const mostEntries = 10_000;

/** `db.getSiblingDB("<database>").getCollectionInfos({}, { nameOnly: true, authorizedCollections: true })`. */
export function listCollectionsRequest(database: string): MongoRequest {
  return {
    engine: 'mongodb',
    database,
    method: 'listCollections',
    arguments: [{}, { nameOnly: true, authorizedCollections: true }],
    limit: mostEntries,
    timeLimitMs: listTimeLimitMs,
  };
}

/** Feature: tree.list-collections — the request for `args.database` (`{ connection, database }`). */
export function request(_context: Context, args: Json): ReadRequest {
  return {
    kind: 'engine',
    requests: [
      {
        connection: connectionId(textArg(args, 'connection')),
        request: listCollectionsRequest(textArg(args, 'database')),
      },
    ],
  };
}

/** The buckets of a database: the names `X` for which both `X.files` and `X.chunks` are listed, sorted by name. */
export function bucketNames(names: readonly string[]): readonly string[] {
  const all = new Set(names);
  return names
    .filter((name) => name.endsWith('.files') && all.has(`${name.slice(0, -'.files'.length)}.chunks`))
    .map((name) => name.slice(0, -'.files'.length))
    .sort(compareNames);
}

function kindOf(type: unknown): CollectionKind {
  return type === 'view' || type === 'timeseries' ? type : 'collection';
}

/** The order of the tree: names that do not start with `system.` by name, then those that do, by name. */
export function compareEntries(one: CollectionEntry, other: CollectionEntry): number {
  return Number(one.system) - Number(other.system) || compareNames(one.name, other.name);
}

/** What one database's `listCollections` reply gives. */
export function contentsOf(reply: unknown): DatabaseContents {
  const infos = Array.isArray(reply) ? reply.filter(isObject) : [];
  const entries = infos.flatMap((info): CollectionEntry[] => {
    const name = info['name'];
    return typeof name === 'string' ? [{ name, kind: kindOf(info['type']), system: name.startsWith('system.') }] : [];
  });
  return {
    buckets: bucketNames(entries.map((entry) => entry.name)),
    entries: [...entries].sort(compareEntries),
  };
}

/**
 * Feature: tree.list-collections — the buckets and the entries of the database, in the order of the tree. A request
 * that failed fails the read with the server's message, which the tree shows under the database.
 */
export function parse(replies: readonly unknown[]): DatabaseContents {
  const [reply] = replies;
  const failure = failureOf(reply);
  if (failure !== undefined) {
    throw new Error(failure);
  }
  return contentsOf(reply);
}
