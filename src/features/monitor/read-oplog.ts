/**
 * Feature: monitor.read-oplog
 *
 * The most recent replicated operations, newest first, narrowed to a database or a collection and to a kind of
 * operation: `db.getSiblingDB("local").oplog.rs.find(<filter>).sort({ $natural: -1 }).limit(51).maxTimeMS(10000)`, one
 * entry more than **Last**, which only says that there are more. Started with `{ connection, text, operation, last }`.
 * Ported from Mongoster's `src/monitor.ts › loadOplog`; `src/replication.ts › oplogFilter`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { int, listOf } from './parts/ejson';
import { failureOf, type PartRead } from './parts/failure';
import { collectionCall, engineRead, escapeRegularExpression } from './parts/requests';
import { oplogRow, type OplogRow } from './oplog-summary';
import { text } from './text';
import { numberArg, readConnection, textArg } from './types';

/** How long the read may take on the server, in milliseconds. */
export const oplogTimeLimitMs = 10_000;

/** The choices of **Last**. */
export const oplogLimits = [50, 200, 1000] as const;

/** The choices of **Operation**: all but no-ops (to start with), one kind, or everything. */
export type OplogOperation = 'all-but-noops' | 'insert' | 'update' | 'delete' | 'command' | 'noop' | 'everything';

/** The choices of **Operation** in the order of the list. */
export const oplogOperations: readonly OplogOperation[] = [
  'all-but-noops',
  'insert',
  'update',
  'delete',
  'command',
  'noop',
  'everything',
];

const opOf: Readonly<Partial<Record<OplogOperation, string>>> = {
  insert: 'i',
  update: 'u',
  delete: 'd',
  command: 'c',
  noop: 'n',
};

/** What the read gives: the rows, newest first, and whether there are more. */
export interface OplogEntries {
  readonly rows: readonly OplogRow[];
  readonly more: boolean;
}

function operationOf(args: Json): OplogOperation {
  const asked = textArg(args, 'operation');
  return oplogOperations.find((each) => each === asked) ?? 'all-but-noops';
}

/** The filter of the text and of **Operation**; the second branch of `$or` finds the operations of transactions. */
export function oplogFilter(typed: string, operation: OplogOperation): Json {
  const op = opOf[operation];
  const kind = operation === 'all-but-noops' ? { op: { $ne: 'n' } } : op === undefined ? {} : { op };
  const name = typed.trim();
  if (name === '') {
    return kind;
  }
  const match = name.includes('.') ? name : { $regex: `^${escapeRegularExpression(name)}\\.` };
  return { ...kind, $or: [{ ns: match }, { 'o.applyOps.ns': match }] };
}

/** The **Last** asked for: 50, 200 or 1,000. */
export function lastOf(args: Json): number {
  const asked = numberArg(args, 'last');
  return oplogLimits.find((each) => each === asked) ?? 50;
}

/** Feature: monitor.read-oplog — the one `find`, with one entry more than **Last**. */
export function request(_context: Context, args: Json): ReadRequest {
  const last = lastOf(args);
  return engineRead(readConnection(args), [
    collectionCall({
      database: 'local',
      collection: 'oplog.rs',
      method: 'find',
      arguments: [
        oplogFilter(textArg(args, 'text') ?? '', operationOf(args)),
        { sort: { $natural: int(-1) }, limit: int(last + 1) },
      ],
      limit: last + 1,
      timeLimitMs: oplogTimeLimitMs,
    }),
  ]);
}

/** Whether a failure is the time limit: `MaxTimeMSExpired` (code 50), or a message that says so. */
function isTimeLimit(code: number | undefined, message: string): boolean {
  return code === 50 || /MaxTimeMSExpired|time limit|timed out/iu.test(message);
}

/** Feature: monitor.read-oplog — the rows, or the error of the read. */
export function parse(replies: readonly unknown[], args: Json = null): PartRead<OplogEntries> {
  const reply = replies[0];
  const failure = failureOf(reply);
  if (failure !== undefined) {
    const message = isTimeLimit(failure.code, failure.message)
      ? text.replication.oplogTooSlow(failure.message)
      : failure.message;
    return { kind: 'failed', failure: { ...failure, message } };
  }
  const last = lastOf(args);
  const entries = listOf(reply);
  return { kind: 'read', value: { rows: entries.slice(0, last).map(oplogRow), more: entries.length > last } };
}
