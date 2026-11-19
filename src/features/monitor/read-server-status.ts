/**
 * Feature: monitor.read-server-status
 *
 * Version, uptime, connections, operation counters, memory and network of the server the connection reaches:
 * `db.adminCommand({ serverStatus: 1, repl: 0, metrics: 0, locks: 0 })`. Started with `{ connection, at }`, `at` the
 * time of the read in milliseconds since 1970, which the rates are computed from (`monitor.rates`); without it, the
 * time the server reports (`localTime`). Through a mongos the reply is the mongos's own. Ported from Mongoster's
 * `src/monitor.ts › loadServer`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { dateOf, int, isRecord, numberOf, recordOf, textOf } from './parts/ejson';
import { partOf, type PartRead } from './parts/failure';
import { adminCommand, engineRead } from './parts/requests';
import { numberArg, readConnection } from './types';

/** The counters of `opcounters`, in the order the tile writes them. */
export const operationCounters = ['query', 'insert', 'update', 'delete', 'getmore', 'command'] as const;

/** One counter of `opcounters`. */
export type OperationCounter = (typeof operationCounters)[number];

/** What the Stats section shows of the server. */
export interface ServerStatus {
  readonly host: string;
  readonly version: string;
  /** Seconds since the server started. */
  readonly uptime: number;
  readonly connections: { readonly current: number; readonly available: number; readonly totalCreated: number };
  readonly counters: Readonly<Record<OperationCounter, number>>;
  /** Resident and virtual megabytes, when the server reports `mem`. */
  readonly memory?: { readonly resident: number; readonly virtual: number };
  /** Bytes in and out and requests, when the server reports `network`. */
  readonly network?: { readonly bytesIn: number; readonly bytesOut: number; readonly requests: number };
  /** When it was read, in milliseconds since 1970. */
  readonly at: number;
}

/** `db.adminCommand({ serverStatus: 1, repl: 0, metrics: 0, locks: 0 })`. */
export function serverStatusRequest(): ReturnType<typeof adminCommand> {
  return adminCommand({ serverStatus: int(1), repl: int(0), metrics: int(0), locks: int(0) });
}

/** Feature: monitor.read-server-status — the one command. */
export function request(_context: Context, args: Json): ReadRequest {
  return engineRead(readConnection(args), [serverStatusRequest()]);
}

function numberIn(value: unknown, name: string): number {
  return numberOf(recordOf(value)[name]) ?? 0;
}

/** The server's status from a reply of `serverStatus`; a missing number is 0. */
export function serverStatusOf(reply: unknown, at?: number): ServerStatus {
  const fields = recordOf(reply);
  const connections = fields['connections'];
  const counters = fields['opcounters'];
  const memory = fields['mem'];
  const network = fields['network'];
  return {
    host: textOf(fields['host']) ?? '',
    version: textOf(fields['version']) ?? '',
    uptime: numberIn(fields, 'uptime'),
    connections: {
      current: numberIn(connections, 'current'),
      available: numberIn(connections, 'available'),
      totalCreated: numberIn(connections, 'totalCreated'),
    },
    counters: Object.fromEntries(operationCounters.map((name) => [name, numberIn(counters, name)])) as Record<
      OperationCounter,
      number
    >,
    ...(isRecord(memory)
      ? { memory: { resident: numberIn(memory, 'resident'), virtual: numberIn(memory, 'virtual') } }
      : {}),
    ...(isRecord(network)
      ? {
          network: {
            bytesIn: numberIn(network, 'bytesIn'),
            bytesOut: numberIn(network, 'bytesOut'),
            requests: numberIn(network, 'numRequests'),
          },
        }
      : {}),
    at: at ?? dateOf(fields['localTime']) ?? 0,
  };
}

/** Feature: monitor.read-server-status — the status, or the failure of the command. */
export function parse(replies: readonly unknown[], args: Json = null): PartRead<ServerStatus> {
  return partOf(replies[0], (reply) => serverStatusOf(reply, numberArg(args, 'at')));
}
