/**
 * Feature: monitor.read-operations
 *
 * What `currentOp` reports, as rows of the Operations section: `db.adminCommand({ currentOp: 1, $all: false })`, with
 * `$all: true` when idle connections are asked for. Started with `{ connection, idle }`. The `currentOp` that produced
 * the list is left out; the active operations come first, then the longest running. It changes nothing. Ported from
 * Mongoster's `src/monitor.ts › loadOps`, `toOp`, `summarize`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { int, isRecord, listOf, numberOf, recordOf, textOf, type JsonRecord } from './parts/ejson';
import { partOf, type PartRead } from './parts/failure';
import { adminCommand, engineRead } from './parts/requests';
import { commandLine, operationNoise, usersText } from './parts/slow-query-records';
import { isOn, readConnection } from './types';

/** An operation in progress on the server (glossary, "server operation"). */
export interface ServerOperation {
  /** A number; through a mongos, the text it gives, such as `shard01:4721`. */
  readonly opid?: number | string;
  readonly type: string;
  readonly namespace: string;
  /** How long it has run, in microseconds; absent for an idle connection that says nothing. */
  readonly microseconds?: number;
  readonly active: boolean;
  readonly client?: string;
  readonly application?: string;
  readonly description?: string;
  /** The users, as `name@database` joined by `, `. */
  readonly users?: string;
  readonly plan?: string;
  readonly waitingForLock: boolean;
  /** The command on one line, at most 300 characters then `…`; the operation's `msg` when it has no command. */
  readonly command: string;
  /** An operation without a client's address. */
  readonly system: boolean;
  /** The whole `currentOp` document, for the inspector island. */
  readonly record: Json;
}

/** Feature: monitor.read-operations — `currentOp`, with `$all: true` when `args.idle` is on. */
export function request(_context: Context, args: Json): ReadRequest {
  return engineRead(readConnection(args), [adminCommand({ currentOp: int(1), $all: isOn(args, 'idle') })]);
}

function opidOf(value: Json | undefined): number | string | undefined {
  return typeof value === 'string' ? value : numberOf(value);
}

function microsecondsOf(document: JsonRecord): number | undefined {
  const micro = numberOf(document['microsecs_running']);
  if (micro !== undefined) {
    return micro;
  }
  const seconds = numberOf(document['secs_running']);
  return seconds === undefined ? undefined : seconds * 1_000_000;
}

function optional(name: string, value: unknown): object {
  return value === undefined ? {} : { [name]: value };
}

const noise = new Set(operationNoise);

/** One document of `inprog` as an operation. */
export function serverOperationOf(document: JsonRecord): ServerOperation {
  const command = document['command'] ?? document['query'];
  const client = textOf(document['client']) ?? textOf(document['client_s']);
  const line = commandLine(command, noise);
  return {
    ...optional('opid', opidOf(document['opid'])),
    type: textOf(document['op']) ?? textOf(document['type']) ?? '',
    namespace: textOf(document['ns']) ?? '',
    ...optional('microseconds', microsecondsOf(document)),
    active: document['active'] === true,
    ...optional('client', client),
    ...optional('application', textOf(document['appName'])),
    ...optional('description', textOf(document['desc'])),
    ...optional('users', usersText(document['effectiveUsers'])),
    ...optional('plan', textOf(document['planSummary'])),
    waitingForLock: document['waitingForLock'] === true,
    command: line === '' || line === '{}' ? (textOf(document['msg']) ?? '') : line,
    system: client === undefined,
    record: document,
  };
}

/** Whether a document is the `currentOp` that listed the others. */
function isOwnCurrentOp(document: JsonRecord): boolean {
  return 'currentOp' in recordOf(document['command']);
}

/** The active first, then the longest running first. */
function compareOperations(one: ServerOperation, other: ServerOperation): number {
  if (one.active !== other.active) {
    return one.active ? -1 : 1;
  }
  return (other.microseconds ?? -1) - (one.microseconds ?? -1);
}

/** The operations of a reply of `currentOp`, without its own, in the order of the section. */
export function operationsOf(reply: unknown): readonly ServerOperation[] {
  return listOf(recordOf(reply)['inprog'])
    .filter((document): document is JsonRecord => isRecord(document) && !isOwnCurrentOp(document))
    .map(serverOperationOf)
    .sort(compareOperations);
}

/** Feature: monitor.read-operations — the operations, or the failure the section shows in its error line. */
export function parse(replies: readonly unknown[]): PartRead<readonly ServerOperation[]> {
  return partOf(replies[0], operationsOf);
}
