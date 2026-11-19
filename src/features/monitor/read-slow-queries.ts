/**
 * Feature: monitor.read-slow-queries
 *
 * The slow operations of the profiler of a database, or of the "Slow query" lines of the server log, with the
 * profiler's level and the server's threshold. Started with `{ connection, source, database, since }`: `source` is
 * `profiler` or `log`, `database` is absent for **All databases** of the log, and `since` is the instant of **Since**
 * in milliseconds since 1970, absent for **All** ({@link slowQueriesArgs} makes it from the minutes). With `only:
 * "profiler"` it reads the profiler's level and threshold alone, as the Operations of the profiler need. It changes
 * nothing. Ported from Mongoster's `src/monitor.ts › loadProfile`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import { date, int, listOf, numberField, recordOf, textOf } from './parts/ejson';
import { partOf, type PartRead } from './parts/failure';
import { adminCommand, collectionCall, databaseCommand, engineRead, splitNamespace } from './parts/requests';
import { fromLogLine, fromProfileDocument, isNoise } from './parts/slow-query-records';
import { numberArg, readConnection, textArg, type SlowQuery, type SlowQuerySource } from './types';

/** How many operations of the profiler are kept: one more is asked, which only says that there are more. */
export const mostProfilerOperations = 1000;

/** The threshold a server has when it reports none, in milliseconds. */
export const defaultSlowMs = 100;

/** The level and the threshold of the profiler of a database (glossary, "profiler"). */
export interface ProfilerState {
  /** 0 off, 1 slow operations, 2 every operation: the database's own. */
  readonly level: number;
  /** The threshold, in milliseconds: the server's. */
  readonly slowMs: number;
}

/** The slow operations read, the most recent first. */
export interface SlowQueriesList {
  readonly operations: readonly SlowQuery[];
  /** Whether the profiler has more than the 1,000 kept. */
  readonly more: boolean;
  /** Whether the server log has dropped older lines. */
  readonly olderLinesDropped: boolean;
}

/** What the read gives: the profiler's state and the operations, each read or failed alone. */
export interface SlowQueriesRead {
  readonly source: SlowQuerySource;
  readonly database?: string;
  readonly profiler: PartRead<ProfilerState>;
  /** Absent when only the profiler's state was asked for (`only: "profiler"`). */
  readonly operations?: PartRead<SlowQueriesList>;
}

/** The arguments of the read, with **Since** as minutes before `now` (0 for **All**). */
export function slowQueriesArgs(input: {
  readonly connection: ConnectionId;
  readonly source: SlowQuerySource;
  readonly database?: string;
  readonly sinceMinutes: number;
  readonly now: number;
}): Json {
  return {
    connection: input.connection,
    source: input.source,
    ...(input.database === undefined ? {} : { database: input.database }),
    ...(input.sinceMinutes > 0 ? { since: input.now - input.sinceMinutes * 60_000 } : {}),
  };
}

function sourceOf(args: Json): SlowQuerySource {
  return textArg(args, 'source') === 'log' ? 'log' : 'profiler';
}

/** `db.getSiblingDB("shop").runCommand({ profile: -1 })`: the level and the threshold, changing nothing. */
export function profileStatusRequest(database: string): ReturnType<typeof databaseCommand> {
  return databaseCommand(database, { profile: int(-1) });
}

/** `db.adminCommand({ getLog: "global" })`: the server's recent log, 1,024 lines at most. */
export function getLogRequest(): ReturnType<typeof adminCommand> {
  return adminCommand({ getLog: 'global' });
}

/** Feature: monitor.read-slow-queries — the profiler's state, then its operations or the server log. */
export function request(_context: Context, args: Json): ReadRequest {
  const database = textArg(args, 'database');
  const since = numberArg(args, 'since');
  const status = profileStatusRequest(database ?? 'admin');
  if (textArg(args, 'only') === 'profiler') {
    return engineRead(readConnection(args), [status]);
  }
  if (sourceOf(args) === 'log' || database === undefined) {
    return engineRead(readConnection(args), [status, getLogRequest()]);
  }
  const profile = collectionCall({
    database,
    collection: 'system.profile',
    method: 'find',
    arguments: [
      since === undefined ? {} : { ts: { $gte: date(since) } },
      { sort: { ts: int(-1) }, limit: int(mostProfilerOperations + 1) },
    ],
    limit: mostProfilerOperations + 1,
  });
  return engineRead(readConnection(args), [status, profile]);
}

/** The level and the threshold of a reply of `{ profile: -1 }`; 100 ms when the server reports no threshold. */
export function profilerStateOf(reply: unknown): ProfilerState {
  return { level: numberField(reply, 'was') ?? 0, slowMs: numberField(reply, 'slowms') ?? defaultSlowMs };
}

/** The operations of documents of `system.profile`, without the noise, at most `most` of them. */
export function profilerOperations(reply: unknown, most: number = mostProfilerOperations): SlowQueriesList {
  const documents = listOf(reply);
  const operations = documents.slice(0, most).map(fromProfileDocument);
  return {
    operations: operations.filter((each) => !isNoise(each)),
    more: documents.length > most,
    olderLinesDropped: false,
  };
}

/** Whether an operation of the log is on the database asked for and recent enough. */
function isInScope(operation: SlowQuery, database: string | undefined, since: number | undefined): boolean {
  const onDatabase = database === undefined || splitNamespace(operation.namespace).database === database;
  return onDatabase && (since === undefined || operation.time >= since);
}

/** The operations of a reply of `getLog`, without the noise, the most recent first. */
export function logOperations(reply: unknown): SlowQueriesList {
  const lines = listOf(recordOf(reply)['log']).flatMap((line) => {
    const text = textOf(line);
    return text === undefined ? [] : [text];
  });
  const operations = lines.flatMap((line) => {
    const operation = fromLogLine(line);
    return operation === undefined || isNoise(operation) ? [] : [operation];
  });
  const written = numberField(reply, 'totalLinesWritten') ?? lines.length;
  return {
    operations: [...operations].sort((one, other) => other.time - one.time),
    more: false,
    olderLinesDropped: written > lines.length,
  };
}

/** Feature: monitor.read-slow-queries — the profiler's state and the operations, each read or failed. */
export function parse(replies: readonly unknown[], args: Json = null): SlowQueriesRead {
  const database = textArg(args, 'database');
  const since = numberArg(args, 'since');
  const source = sourceOf(args);
  const [status, operations] = replies;
  const profiler = partOf(status, profilerStateOf);
  if (textArg(args, 'only') === 'profiler') {
    return { source, ...(database === undefined ? {} : { database }), profiler };
  }
  const fromLog = source === 'log' || database === undefined;
  const read = fromLog
    ? partOf(operations, (reply) => {
        const list = logOperations(reply);
        return { ...list, operations: list.operations.filter((each) => isInScope(each, database, since)) };
      })
    : partOf(operations, (reply) => profilerOperations(reply));
  return {
    source,
    ...(database === undefined ? {} : { database }),
    profiler,
    operations: read,
  };
}
