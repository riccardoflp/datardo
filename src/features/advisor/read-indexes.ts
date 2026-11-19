/**
 * Feature: advisor.read-indexes
 *
 * The collections of a scope, each with its indexes, their sizes, how often each was used and since when. Read in
 * three calls, each one read named by `args.step`: `databases` (for the scope of a connection only), `collections`
 * (for the databases), then `indexes` for at most eight collections at a time ({@link collectionBatches});
 * {@link scopeIndexes} puts the replies together. It changes nothing. Ported from Mongoster's `src/advisor.ts`
 * (`databases`, `collections`).
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { int, isRecord, listOf, recordOf, textOf } from '../monitor/parts/ejson';
import { failureOf } from '../monitor/parts/failure';
import { adminCommand, collectionCall, engineRead } from '../monitor/parts/requests';
import { readIndexesOf } from './parts/index-replies';
import {
  collectionNamespace,
  skippedDatabases,
  textArg,
  textsArg,
  type AdvisorCollection,
  type FailedCollection,
} from './types';

/** How many collections are read at a time. */
export const collectionsAtATime = 8;

/** The requests of each collection, in this order, four per collection. */
export const requestsPerCollection = 4;

/** A collection to read, by its database and its name. */
export interface CollectionName {
  readonly database: string;
  readonly collection: string;
}

/** What one call gave, by its step. */
export type IndexesReply =
  | { readonly step: 'databases'; readonly databases: readonly string[] }
  | {
      readonly step: 'collections';
      readonly collections: readonly CollectionName[];
      readonly profiled: readonly string[];
      /** The server's message when the collections of a database could not be listed. */
      readonly error?: string;
    }
  | {
      readonly step: 'indexes';
      readonly collections: readonly AdvisorCollection[];
      readonly failed: readonly FailedCollection[];
    };

/** What the read returns once every call has answered. */
export interface ScopeIndexes {
  readonly databases: readonly string[];
  /** The databases that have a `system.profile` collection. */
  readonly profiled: readonly string[];
  /** The collections that have at least one index. */
  readonly collections: readonly AdvisorCollection[];
  readonly failed: readonly FailedCollection[];
}

function listDatabasesRequest(): MongoRequest {
  return adminCommand({ listDatabases: int(1), nameOnly: true, authorizedDatabases: true });
}

function listCollectionsRequest(database: string, filter: Json): MongoRequest {
  return collectionlessCall(database, 'listCollections', [filter, { authorizedCollections: true }]);
}

function collectionlessCall(database: string, method: string, args: readonly Json[]): MongoRequest {
  return { engine: 'mongodb', database, method, arguments: args, timeLimitMs: 10_000 };
}

/** The four requests of one collection: its indexes, their uses, their sizes, its number of documents. */
export function collectionRequests(name: CollectionName): readonly MongoRequest[] {
  const on = { database: name.database, collection: name.collection };
  return [
    collectionCall({ ...on, method: 'listIndexes', arguments: [] }),
    collectionCall({ ...on, method: 'aggregate', arguments: [[{ $indexStats: {} }]] }),
    collectionCall({ ...on, method: 'aggregate', arguments: [[{ $collStats: { storageStats: {} } }]] }),
    collectionCall({ ...on, method: 'estimatedDocumentCount', arguments: [] }),
  ];
}

function collectionsArg(args: Json): readonly CollectionName[] {
  return listOf(recordOf(args)['collections']).flatMap((each) => {
    const database = textOf(recordOf(each)['database']);
    const collection = textOf(recordOf(each)['collection']);
    return database === undefined || collection === undefined ? [] : [{ database, collection }];
  });
}

/**
 * Feature: advisor.read-indexes — one call: `{ connection, step: 'databases', fallback }`, `{ connection, step:
 * 'collections', databases, collection? }` (with `collection` for the scope of a collection), or `{ connection, step:
 * 'indexes', collections: [{ database, collection }] }`.
 */
export function request(_context: Context, args: Json): ReadRequest {
  const connection = connectionId(textArg(args, 'connection') ?? '');
  switch (textArg(args, 'step') ?? 'indexes') {
    case 'databases':
      return engineRead(connection, [listDatabasesRequest()]);
    case 'collections': {
      const collection = textArg(args, 'collection');
      const databases = textsArg(args, 'databases');
      const listings = databases.map((database) =>
        listCollectionsRequest(database, collection === undefined ? {} : { name: collection }),
      );
      const profiles =
        collection === undefined
          ? []
          : databases.map((each) => listCollectionsRequest(each, { name: 'system.profile' }));
      return engineRead(connection, [...listings, ...profiles]);
    }
    default:
      return engineRead(connection, collectionsArg(args).flatMap(collectionRequests));
  }
}

/** The databases of a reply of `listDatabases`, without `admin`, `local` and `config`, sorted by name. */
export function databasesOf(reply: unknown, fallback: string): readonly string[] {
  if (failureOf(reply) !== undefined) {
    return [fallback];
  }
  return listOf(recordOf(reply)['databases'])
    .flatMap((each) => {
      const name = textOf(recordOf(each)['name']);
      return name === undefined || skippedDatabases.includes(name) ? [] : [name];
    })
    .sort((one, other) => (one < other ? -1 : one > other ? 1 : 0));
}

function namesOf(reply: unknown): readonly { readonly name: string; readonly view: boolean }[] {
  return listOf(reply).flatMap((each) => {
    const name = textOf(recordOf(each)['name']);
    return name === undefined ? [] : [{ name, view: recordOf(each)['type'] === 'view' }];
  });
}

function collectionsOf(replies: readonly unknown[], args: Json): IndexesReply {
  const databases = textsArg(args, 'databases');
  const scoped = textArg(args, 'collection') !== undefined;
  const failure = databases.map((_, index) => failureOf(replies[index])).find((each) => each !== undefined);
  const profiled = databases.filter((_, index) =>
    namesOf(replies[scoped ? databases.length + index : index]).some((each) => each.name === 'system.profile'),
  );
  const collections = databases.flatMap((database, index) =>
    namesOf(replies[index])
      .filter((each) => !each.view && !each.name.startsWith('system.'))
      .map((each) => ({ database, collection: each.name })),
  );
  return { step: 'collections', collections, profiled, ...(failure === undefined ? {} : { error: failure.message }) };
}

function indexesOf(replies: readonly unknown[], args: Json): IndexesReply {
  const collections: AdvisorCollection[] = [];
  const failed: FailedCollection[] = [];
  collectionsArg(args).forEach((name, index) => {
    const own = replies.slice(index * requestsPerCollection, (index + 1) * requestsPerCollection);
    const failure = failureOf(own[0]);
    if (failure !== undefined) {
      failed.push({ namespace: collectionNamespace(name), message: failure.message });
      return;
    }
    const read = readIndexesOf(name, own);
    if (read.indexes.length > 0) {
      collections.push(read);
    }
  });
  return { step: 'indexes', collections, failed };
}

/** Feature: advisor.read-indexes — what one call gave. */
export function parse(replies: readonly unknown[], args: Json = null): IndexesReply {
  switch (textArg(args, 'step') ?? 'indexes') {
    case 'databases':
      return { step: 'databases', databases: databasesOf(replies[0], textArg(args, 'fallback') ?? 'test') };
    case 'collections':
      return collectionsOf(replies, args);
    default:
      return indexesOf(replies, args);
  }
}

/** The collections in batches of eight, as the calls of the step `indexes` read them. */
export function collectionBatches(collections: readonly CollectionName[]): readonly (readonly CollectionName[])[] {
  const batches: CollectionName[][] = [];
  for (let start = 0; start < collections.length; start += collectionsAtATime) {
    batches.push(collections.slice(start, start + collectionsAtATime));
  }
  return batches;
}

/** The result of the read, from the databases, the reply of the step `collections` and those of the step `indexes`. */
export function scopeIndexes(
  databases: readonly string[],
  listed: Extract<IndexesReply, { step: 'collections' }>,
  indexes: readonly Extract<IndexesReply, { step: 'indexes' }>[],
): ScopeIndexes {
  return {
    databases,
    profiled: listed.profiled,
    collections: indexes.flatMap((each) => each.collections),
    failed: indexes.flatMap((each) => each.failed),
  };
}

/** Whether a value is a result of the read. */
export function isScopeIndexes(value: unknown): value is ScopeIndexes {
  return isRecord(value) && Array.isArray(value['collections']) && Array.isArray(value['databases']);
}
