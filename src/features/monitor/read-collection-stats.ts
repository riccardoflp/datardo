/**
 * Feature: monitor.read-collection-stats
 *
 * The documents and sizes of each collection of one database. Started with `{ connection, database, step }`: the step
 * `list` sends `db.getSiblingDB("shop").getCollectionInfos()` (as `listCollections`); the step `stats`, with
 * `collections` (at most 8 `{ name, type }`, from {@link collectionBatches}), sends
 * `db.getSiblingDB("shop").orders.aggregate([{ $collStats: { storageStats: {} } }])` for each that is not a view. The
 * collections whose name starts with `system.` are left out; a view has no numbers. Through a mongos the numbers are
 * those of the first document `$collStats` returns (one shard's). Ported from Mongoster's `src/monitor.ts ›
 * loadCollections`, `collectionStats`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { listOf, numberOf, recordOf, textOf } from './parts/ejson';
import { failureOf, partOf, type Failure, type PartRead } from './parts/failure';
import { collectionCall, engineRead } from './parts/requests';
import { readConnection, textArg } from './types';
import { statsAtOnce } from './read-database-stats';

/** The kinds of the entries of a database. */
export type CollectionType = 'collection' | 'timeseries' | 'view';

/** An entry of a database, as `listCollections` gives it. */
export interface CollectionEntry {
  readonly name: string;
  readonly type: CollectionType;
}

/** The numbers of a collection, from `storageStats`. */
export interface CollectionNumbers {
  readonly count: number;
  readonly size: number;
  readonly avgObjSize: number;
  readonly storageSize: number;
  readonly nindexes: number;
  readonly totalIndexSize: number;
  readonly capped: boolean;
}

/** One collection: its numbers, the failure of its `$collStats`, or neither for a view. */
export interface CollectionStats extends CollectionEntry {
  readonly numbers?: CollectionNumbers;
  readonly failure?: Failure;
}

/** What a step gives: the entries of the database, or the statistics of a batch. */
export type CollectionStatsRead =
  | { readonly step: 'list'; readonly collections: PartRead<readonly CollectionEntry[]> }
  | { readonly step: 'stats'; readonly stats: readonly CollectionStats[] };

function typeOf(value: unknown): CollectionType {
  return value === 'view' || value === 'timeseries' ? value : 'collection';
}

function entriesArg(args: Json): readonly CollectionEntry[] {
  return listOf(recordOf(args)['collections']).flatMap((each) => {
    const name = textOf(recordOf(each)['name']);
    return name === undefined ? [] : [{ name, type: typeOf(recordOf(each)['type']) }];
  });
}

/** The entries cut into batches of 8 for the step `stats`. */
export function collectionBatches(entries: readonly CollectionEntry[]): readonly (readonly CollectionEntry[])[] {
  const batches: (readonly CollectionEntry[])[] = [];
  for (let start = 0; start < entries.length; start += statsAtOnce) {
    batches.push(entries.slice(start, start + statsAtOnce));
  }
  return batches;
}

/** Feature: monitor.read-collection-stats — the entries of the database, or the `$collStats` of a batch. */
export function request(_context: Context, args: Json): ReadRequest {
  const database = textArg(args, 'database') ?? '';
  const connection = readConnection(args);
  if (textArg(args, 'step') !== 'stats') {
    return engineRead(connection, [
      { engine: 'mongodb', database, method: 'listCollections', arguments: [{}], timeLimitMs: 10_000 },
    ]);
  }
  const asked = entriesArg(args).filter((entry) => entry.type !== 'view');
  return engineRead(
    connection,
    asked.map((entry) =>
      collectionCall({
        database,
        collection: entry.name,
        method: 'aggregate',
        arguments: [[{ $collStats: { storageStats: {} } }]],
      }),
    ),
  );
}

/** The entries of a reply of `listCollections`, without the `system.` collections. */
export function collectionEntries(reply: unknown): readonly CollectionEntry[] {
  return listOf(reply).flatMap((each) => {
    const name = textOf(recordOf(each)['name']);
    return name === undefined || name.startsWith('system.') ? [] : [{ name, type: typeOf(recordOf(each)['type']) }];
  });
}

function numbersOf(reply: unknown): CollectionNumbers {
  const stats = recordOf(recordOf(listOf(reply)[0])['storageStats']);
  const read = (name: string): number => numberOf(stats[name]) ?? 0;
  return {
    count: read('count'),
    size: read('size'),
    avgObjSize: read('avgObjSize'),
    storageSize: read('storageSize'),
    nindexes: read('nindexes'),
    totalIndexSize: read('totalIndexSize'),
    capped: stats['capped'] === true,
  };
}

/** The collections by size, the largest first, those without a size (views, failures) last in their order. */
export function sortCollections(stats: readonly CollectionStats[]): readonly CollectionStats[] {
  const sized = stats.filter((each) => each.numbers !== undefined);
  const others = stats.filter((each) => each.numbers === undefined);
  return [...sized].sort((one, other) => (other.numbers?.size ?? 0) - (one.numbers?.size ?? 0)).concat(others);
}

/** Feature: monitor.read-collection-stats — the entries, or the statistics of the batch, the largest first. */
export function parse(replies: readonly unknown[], args: Json = null): CollectionStatsRead {
  if (textArg(args, 'step') !== 'stats') {
    return { step: 'list', collections: partOf(replies[0], collectionEntries) };
  }
  let next = 0;
  const stats = entriesArg(args).map((entry): CollectionStats => {
    if (entry.type === 'view') {
      return entry;
    }
    const reply = replies[next];
    next += 1;
    const failure = failureOf(reply);
    return failure === undefined ? { ...entry, numbers: numbersOf(reply) } : { ...entry, failure };
  });
  return { step: 'stats', stats: sortCollections(stats) };
}
