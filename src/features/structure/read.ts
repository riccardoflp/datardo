/**
 * Feature: structure.read
 *
 * Reads what a database is made of, without reading any document: its collections and views with their options,
 * their indexes, their search indexes and their shard keys, reduced to what `structure.steps` compares. Started with
 * `{ connection, database }`, for each side of a comparison, both sides at the same time.
 *
 * The read goes in phases, each knowing what the one before answered. The runner (or a worker) carries it out as a
 * loop over pure functions, the replies kept in the order their requests were sent:
 *
 * 1. `request` gives the first two requests: `listCollections` of the database and `hello` on `admin`;
 * 2. `nextRequests(args, replies)` gives what to send next, given every reply so far, and nothing once the read is
 *    complete: through a mongos, the shard keys from `config.collections` with the first indexes; the indexes of the
 *    collections that are not views, `indexesAtOnce` (8) at a time; then the search indexes of the collections that
 *    are neither views nor time series, one after the other, stopping at the first that fails;
 * 3. `readProgress(replies)` says how many collections have their indexes read, for *left 3 of 12 collections*;
 * 4. `parse(replies)` turns every reply into the structure, or the message of the read that failed it.
 *
 * The replies are laid out as they were asked: `listCollections`, `hello`, `config.collections` (only through a
 * mongos), the indexes in order of name, then the search indexes in order of name.
 */
import type { ConnectionRequest, Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { textArg } from '../nav/types';
import type { CollectionStructure, CollectionType, DatabaseStructure, ShardKey, StructureSide } from './types';
import { indexDefinition, normalizedCollectionOptions, searchIndexDefinition } from './model/normalize';
import { documentsOf, failureOf, isMongos, isSearchUnsupported } from './model/replies';
import { int, isDocument } from './model/values';

/** How many collections have their indexes read at the same time (Mongoster's). */
export const indexesAtOnce = 8;

/** How long each request may take on the server, in milliseconds (Datardo's choice, R9.2). */
export const readTimeLimitMs = 30_000;

/** The most collections and indexes a cursor of the read returns (Datardo's choice, R9.2). */
export const mostListed = 10_000;

/** What the read gives: the structure, or the server's message of the read that failed it. */
export type StructureRead =
  | { readonly kind: 'structure'; readonly structure: DatabaseStructure }
  | { readonly kind: 'error'; readonly message: string };

/** One collection as `listCollections` lists it. */
interface Listed {
  readonly name: string;
  readonly type: CollectionType;
  readonly options: Json;
}

function sideOf(args: Json): StructureSide {
  return { connection: textArg(args, 'connection') ?? '', database: textArg(args, 'database') ?? '' };
}

function mongoRequest(side: StructureSide, request: Omit<MongoRequest, 'engine' | 'timeLimitMs'>): ConnectionRequest {
  return {
    connection: connectionId(side.connection),
    request: { engine: 'mongodb', ...request, timeLimitMs: readTimeLimitMs },
  };
}

function escapedPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** `db.getSiblingDB("config").collections.find({ _id: /^shop\./, dropped: { $ne: true } })`. */
export function shardKeysRequest(side: StructureSide): ConnectionRequest {
  const pattern = { $regularExpression: { pattern: `^${escapedPattern(side.database)}\\.`, options: '' } };
  return mongoRequest(side, {
    database: 'config',
    collection: 'collections',
    method: 'find',
    arguments: [{ _id: pattern, dropped: { $ne: true } }],
    limit: mostListed,
  });
}

/** `db.getCollection("orders").getIndexes()`, as the cursor of `listIndexes`. */
export function indexesRequest(side: StructureSide, collection: string): ConnectionRequest {
  return mongoRequest(side, {
    database: side.database,
    collection,
    method: 'listIndexes',
    arguments: [],
    limit: mostListed,
  });
}

/** `db.getCollection("orders").getSearchIndexes()`, as the stage `$listSearchIndexes`. */
export function searchIndexesRequest(side: StructureSide, collection: string): ConnectionRequest {
  return mongoRequest(side, {
    database: side.database,
    collection,
    method: 'aggregate',
    arguments: [[{ $listSearchIndexes: {} }]],
    limit: mostListed,
  });
}

/** Feature: structure.read — the first requests: `listCollections` of the database and `hello`. */
export function request(_context: Context, args: Json): ReadRequest {
  const side = sideOf(args);
  return {
    kind: 'engine',
    requests: [
      mongoRequest(side, {
        database: side.database,
        method: 'listCollections',
        arguments: [{}, { nameOnly: false }],
        limit: mostListed,
      }),
      mongoRequest(side, { database: 'admin', method: 'runCommand', arguments: [{ hello: int(1) }] }),
    ],
  };
}

function typeOf(raw: Json | undefined): CollectionType {
  return raw === 'view' ? 'view' : raw === 'timeseries' ? 'timeseries' : 'collection';
}

/** The collections `listCollections` answered, without `system.` ones, sorted by name. */
function listed(reply: unknown): readonly Listed[] {
  return documentsOf(reply)
    .flatMap((each): readonly Listed[] => {
      const name = each['name'];
      return typeof name === 'string' && !name.startsWith('system.')
        ? [{ name, type: typeOf(each['type']), options: each['options'] ?? {} }]
        : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Where the replies of each phase start, from the first two replies. */
interface Layout {
  readonly collections: readonly Listed[];
  readonly mongos: boolean;
  readonly indexed: readonly Listed[];
  readonly indexesAt: number;
  readonly searchable: readonly Listed[];
  readonly searchAt: number;
}

function layoutOf(replies: readonly unknown[]): Layout {
  const collections = listed(replies[0]);
  const mongos = isMongos(replies[1]);
  const indexed = collections.filter((each) => each.type !== 'view');
  const indexesAt = mongos ? 3 : 2;
  const searchable = collections.filter((each) => each.type === 'collection');
  return { collections, mongos, indexed, indexesAt, searchable, searchAt: indexesAt + indexed.length };
}

function searchStopped(replies: readonly unknown[], layout: Layout): boolean {
  const last = replies[replies.length - 1];
  return replies.length > layout.searchAt && failureOf(last) !== undefined;
}

/**
 * Feature: structure.read — what to send next, given every reply so far in the order they were asked; nothing once
 * the read is complete (or has failed).
 */
export function nextRequests(args: Json, replies: readonly unknown[]): readonly ConnectionRequest[] {
  if (replies.length < 2 || failureOf(replies[0]) !== undefined) {
    return [];
  }
  const side = sideOf(args);
  const layout = layoutOf(replies);
  const indexBatch = (from: number): readonly ConnectionRequest[] =>
    layout.indexed.slice(from, from + indexesAtOnce).map((each) => indexesRequest(side, each.name));
  if (layout.mongos && replies.length === 2) {
    return [shardKeysRequest(side), ...indexBatch(0)];
  }
  const indexesSent = Math.max(0, replies.length - layout.indexesAt);
  if (indexesSent < layout.indexed.length) {
    const failed = replies.slice(layout.indexesAt).some((reply) => failureOf(reply) !== undefined);
    return failed ? [] : indexBatch(indexesSent);
  }
  const searchSent = replies.length - layout.searchAt;
  const next = layout.searchable[searchSent];
  return next === undefined || searchStopped(replies, layout) ? [] : [searchIndexesRequest(side, next.name)];
}

/** Feature: structure.read — the collections whose indexes are read, over the collections of the database. */
export function readProgress(
  replies: readonly unknown[],
): { readonly done: number; readonly total: number } | undefined {
  if (replies.length < 2) {
    return undefined;
  }
  const layout = layoutOf(replies);
  const indexesRead = Math.min(layout.indexed.length, Math.max(0, replies.length - layout.indexesAt));
  const views = layout.collections.length - layout.indexed.length;
  return { done: views + indexesRead, total: layout.collections.length };
}

function shardKeysOf(reply: unknown, database: string): ReadonlyMap<string, ShardKey> | undefined {
  if (failureOf(reply) !== undefined) {
    return undefined;
  }
  const prefix = `${database}.`;
  const keys = new Map<string, ShardKey>();
  for (const each of documentsOf(reply)) {
    const id = each['_id'];
    const key = each['key'];
    if (typeof id === 'string' && id.startsWith(prefix) && isDocument(key)) {
      keys.set(id.slice(prefix.length), { key, ...(each['unique'] === true ? { unique: true } : {}) });
    }
  }
  return keys;
}

function collectionOf(each: Listed, indexes: unknown, shardKey: ShardKey | undefined): CollectionStructure {
  const definitions = documentsOf(indexes)
    .flatMap((raw) => {
      const index = indexDefinition(raw);
      return index === undefined ? [] : [index];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const options = normalizedCollectionOptions(each.type, isDocument(each.options) ? each.options : {});
  return {
    name: each.name,
    type: each.type,
    options,
    indexes: definitions,
    ...(shardKey === undefined ? {} : { shardKey }),
  };
}

function withSearch(
  collections: readonly CollectionStructure[],
  layout: Layout,
  replies: readonly unknown[],
): Pick<DatabaseStructure, 'collections' | 'search' | 'searchError'> {
  const found = new Map<string, CollectionStructure['searchIndexes']>();
  for (const [at, each] of layout.searchable.entries()) {
    const reply = replies[layout.searchAt + at];
    const failure = failureOf(reply);
    if (failure !== undefined) {
      return isSearchUnsupported(failure)
        ? { collections, search: 'unsupported' }
        : { collections, search: 'error', searchError: failure.message };
    }
    const indexes = documentsOf(reply).flatMap((raw) => {
      const index = searchIndexDefinition(raw);
      return index === undefined ? [] : [index];
    });
    found.set(
      each.name,
      [...indexes].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }
  const searched = collections.map((each) => {
    const searchIndexes = found.get(each.name);
    return searchIndexes === undefined ? each : { ...each, searchIndexes };
  });
  return { collections: searched, search: 'ok' };
}

/** Feature: structure.read — the structure of the database from every reply, or the message of the read that failed. */
export function parse(replies: readonly unknown[], args: Json): StructureRead {
  const listing = failureOf(replies[0]);
  if (listing !== undefined) {
    return { kind: 'error', message: listing.message };
  }
  const layout = layoutOf(replies);
  const indexReplies = layout.indexed.map((_each, at) => replies[layout.indexesAt + at]);
  const failed = indexReplies.map(failureOf).find((failure) => failure !== undefined);
  if (failed !== undefined) {
    return { kind: 'error', message: failed.message };
  }
  const keys = layout.mongos ? shardKeysOf(replies[2], sideOf(args).database) : undefined;
  const collections = layout.collections.map((each) => {
    const at = layout.indexed.indexOf(each);
    return collectionOf(each, at < 0 ? [] : indexReplies[at], keys?.get(each.name));
  });
  return { kind: 'structure', structure: { ...withSearch(collections, layout, replies), sharded: keys !== undefined } };
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = {
  kind: 'read',
  id: featureId('structure.read'),
  request,
  parse: (replies, args) => parse(replies, args),
};
