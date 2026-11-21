/**
 * Feature: server.read-memory
 *
 * Where the server's memory goes, by its own account (`MEMORY STATS`, at every refresh), and what it advises (`MEMORY
 * DOCTOR`, when the section is chosen and with **Refresh**). The statistics are pairs of a name and a value, a map on
 * RESP3 and a flat array on RESP2; both give the same result. A name the server does not give is missing, not 0.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { partOf } from './unavailable';
import { argsOf, numberOfReply, pairsOf, serverCommand, textArg, textOf, type PartRead } from './types';

/** A value of `MEMORY STATS`: a number (bytes, a count, a percentage, a ratio), a text, or pairs of its own. */
export type MemoryValue = number | string | readonly (readonly [string, MemoryValue])[];

/** The tables of one database: `db.0` with `overhead.hashtable.main` and `overhead.hashtable.expires`. */
export interface DatabaseTables {
  readonly database: number;
  readonly main?: number;
  readonly expires?: number;
}

/** The statistics of the server, in the order it gave them. */
export interface MemoryStats {
  readonly values: readonly (readonly [string, MemoryValue])[];
  readonly databases: readonly DatabaseTables[];
}

/** What a read of the memory gives: the statistics, and the advice when it was asked for. */
export interface MemoryRead {
  readonly stats: PartRead<MemoryStats>;
  readonly doctor?: PartRead<string>;
}

/** Feature: server.read-memory — `MEMORY STATS`, and `MEMORY DOCTOR` with `{ connection, doctor: true }`. */
export function request(_context: Context, args: Json): ReadRequest {
  const connection = connectionId(textArg(args, 'connection'));
  const requests = [
    serverCommand('MEMORY', 'STATS'),
    ...(argsOf(args)['doctor'] === true ? [serverCommand('MEMORY', 'DOCTOR')] : []),
  ];
  return {
    kind: 'engine',
    requests: requests.map((each) => ({ connection, request: each })),
    failedRequests: 'are-replies',
  };
}

function memoryValue(reply: unknown): MemoryValue {
  const number = numberOfReply(reply);
  if (number !== undefined) {
    return number;
  }
  if (Array.isArray(reply) || (typeof reply === 'object' && reply !== null && !(reply instanceof Uint8Array))) {
    return pairsOf(reply).map(([name, value]) => [name, memoryValue(value)] as const);
  }
  return textOf(reply);
}

function pairNumber(value: MemoryValue | undefined, name: string): number | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const found = (value as readonly (readonly [string, MemoryValue])[]).find(([each]) => each === name)?.[1];
  return typeof found === 'number' ? found : undefined;
}

/** The statistics of a reply of `MEMORY STATS`. */
export function memoryStats(reply: unknown): MemoryStats {
  const values = pairsOf(reply).map(([name, value]) => [name, memoryValue(value)] as const);
  const databases = values.flatMap(([name, value]): DatabaseTables[] => {
    const match = /^db\.(\d+)$/u.exec(name);
    if (match === null) {
      return [];
    }
    const main = pairNumber(value, 'overhead.hashtable.main');
    const expires = pairNumber(value, 'overhead.hashtable.expires');
    return [
      {
        database: Number(match[1]),
        ...(main === undefined ? {} : { main }),
        ...(expires === undefined ? {} : { expires }),
      },
    ];
  });
  return { values, databases };
}

/** A number of the statistics; `undefined` when the server does not give it. */
export function statNumber(stats: MemoryStats, name: string): number | undefined {
  const value = stats.values.find(([each]) => each === name)?.[1];
  return typeof value === 'number' ? value : undefined;
}

/** The bytes the tables of a database take: its two values added. */
export function tablesBytes(tables: DatabaseTables): number {
  return (tables.main ?? 0) + (tables.expires ?? 0);
}

/** Feature: server.read-memory — the statistics and the advice, each with its own sentence when refused. */
export function parse(replies: readonly unknown[], args: Json = null): MemoryRead {
  const [stats, doctor] = replies;
  return {
    stats: partOf('MEMORY STATS', stats, memoryStats),
    ...(argsOf(args)['doctor'] === true ? { doctor: partOf('MEMORY DOCTOR', doctor, textOf) } : {}),
  };
}
