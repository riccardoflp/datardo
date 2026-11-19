/**
 * Feature: monitor.read-database-stats
 *
 * The collections, views, documents and sizes of every database: `db.adminCommand({ listDatabases: 1, nameOnly: true
 * })`, then `db.getSiblingDB("shop").runCommand({ dbStats: 1 })` for each database, 8 at a time. Started with `{
 * connection, step }`: the step `list` sends `listDatabases`; the step `stats`, with `databases` (at most 8 names, as
 * {@link databaseBatches} cuts them), sends their `dbStats`. A failure of `listDatabases` fails the read; a database
 * whose `dbStats` fails keeps its name and the server's message. Ported from Mongoster's `src/monitor.ts ›
 * loadDatabases`, `inBatches`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { int, listOf, numberOf, recordOf, textOf } from './parts/ejson';
import { failureOf, partOf, type Failure, type PartRead } from './parts/failure';
import { adminCommand, databaseCommand, engineRead } from './parts/requests';
import { readConnection, textArg } from './types';

/** How many `dbStats` are in flight at once. */
export const statsAtOnce = 8;

/** The numbers of one database. */
export interface DatabaseNumbers {
  readonly collections: number;
  readonly views: number;
  /** The documents. */
  readonly objects: number;
  readonly dataSize: number;
  readonly storageSize: number;
  readonly indexes: number;
  readonly indexSize: number;
}

/** One database: its numbers, or the failure of its `dbStats`. */
export interface DatabaseStats {
  readonly name: string;
  readonly numbers?: DatabaseNumbers;
  readonly failure?: Failure;
}

/** What a step gives: the names of the databases, or their statistics. */
export type DatabaseStatsRead =
  | { readonly step: 'list'; readonly databases: PartRead<readonly string[]> }
  | { readonly step: 'stats'; readonly stats: readonly DatabaseStats[] };

/** The names cut into the batches of the step `stats`, 8 at a time. */
export function databaseBatches(names: readonly string[]): readonly (readonly string[])[] {
  const batches: (readonly string[])[] = [];
  for (let start = 0; start < names.length; start += statsAtOnce) {
    batches.push(names.slice(start, start + statsAtOnce));
  }
  return batches;
}

function namesArg(args: Json): readonly string[] {
  return listOf(recordOf(args)['databases']).flatMap((each) => (typeof each === 'string' ? [each] : []));
}

/** Feature: monitor.read-database-stats — `listDatabases`, or the `dbStats` of a batch of databases. */
export function request(_context: Context, args: Json): ReadRequest {
  const connection = readConnection(args);
  if (textArg(args, 'step') !== 'stats') {
    return engineRead(connection, [adminCommand({ listDatabases: int(1), nameOnly: true })]);
  }
  return engineRead(
    connection,
    namesArg(args).map((name) => databaseCommand(name, { dbStats: int(1) })),
  );
}

/** The names of the databases of a reply of `listDatabases`, sorted. */
export function databaseNames(reply: unknown): readonly string[] {
  return listOf(recordOf(reply)['databases'])
    .flatMap((each) => {
      const name = textOf(recordOf(each)['name']);
      return name === undefined ? [] : [name];
    })
    .sort((one, other) => one.localeCompare(other));
}

function numbersOf(reply: unknown): DatabaseNumbers {
  const fields = recordOf(reply);
  const read = (name: string): number => numberOf(fields[name]) ?? 0;
  return {
    collections: read('collections'),
    views: read('views'),
    objects: read('objects'),
    dataSize: read('dataSize'),
    storageSize: read('storageSize'),
    indexes: read('indexes'),
    indexSize: read('indexSize'),
  };
}

/** Feature: monitor.read-database-stats — the names, or the statistics of each database of the batch. */
export function parse(replies: readonly unknown[], args: Json = null): DatabaseStatsRead {
  if (textArg(args, 'step') !== 'stats') {
    return { step: 'list', databases: partOf(replies[0], databaseNames) };
  }
  const stats = namesArg(args).map((name, index): DatabaseStats => {
    const reply = replies[index];
    const failure = failureOf(reply);
    return failure === undefined ? { name, numbers: numbersOf(reply) } : { name, failure };
  });
  return { step: 'stats', stats };
}
