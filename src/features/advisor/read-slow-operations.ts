/**
 * Feature: advisor.read-slow-operations
 *
 * The slow operations the server still remembers on the collections of a scope: from the profiler of each database
 * that has one, from the server log for the others. Started with `{ connection, databases, profiled, collections }`
 * from `advisor.read-indexes` (`collections` as namespaces), and `log: false` to read the profilers' state alone, as
 * `advisor.turn-on-profiler` does. An error of one profiler or of the log is kept in the result and does not fail the
 * read. It changes nothing. Ported from Mongoster's `src/advisor.ts › slowOps`; the reading of a profiler document and
 * of a log line is the Monitor page's (`monitor.read-slow-queries`).
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { int, listOf, recordOf, textOf } from '../monitor/parts/ejson';
import { failureOf } from '../monitor/parts/failure';
import { collectionCall, engineRead, splitNamespace } from '../monitor/parts/requests';
import { fromLogLine, fromProfileDocument, isNoise } from '../monitor/parts/slow-query-records';
import { getLogRequest, profileStatusRequest, profilerStateOf } from '../monitor/read-slow-queries';
import type { SlowQuery } from '../monitor/types';
import { textArg, textsArg } from './types';

/** How many of the most recent operations of a profiler are read. */
export const mostProfilerOperations = 5000;

/** What the profiler of one database gave. */
export interface ProfilerSource {
  readonly database: string;
  /** Its level, when `{ profile: -1 }` answered. */
  readonly level?: number;
  /** The operations it gave on the collections of the scope. */
  readonly operations: number;
  /** The server's message, when its state or its operations could not be read. */
  readonly error?: string;
}

/** What the server log gave: its operations on the scope, or the server's message. */
export type LogSource =
  | { readonly kind: 'read'; readonly operations: number }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'not-read' };

/** The slow operations of a scope and where they came from. */
export interface ScopeSlowOperations {
  readonly operations: readonly SlowQuery[];
  readonly profilers: readonly ProfilerSource[];
  readonly log: LogSource;
  /** The threshold, in milliseconds: the first one returned. */
  readonly threshold?: number;
  /** The time of the oldest operation returned, in milliseconds since 1970. */
  readonly oldest?: number;
}

/** The profiled databases among the databases, in their order. */
function profiledOf(args: Json): readonly string[] {
  const profiled = new Set(textsArg(args, 'profiled'));
  return textsArg(args, 'databases').filter((database) => profiled.has(database));
}

function readsLog(args: Json): boolean {
  return recordOf(args)['log'] !== false;
}

/** `db.getSiblingDB("shop").system.profile.find({}).sort({ ts: -1 }).limit(5000)`. */
function profilerRequest(database: string): MongoRequest {
  return collectionCall({
    database,
    collection: 'system.profile',
    method: 'find',
    arguments: [{}, { sort: { ts: int(-1) }, limit: int(mostProfilerOperations) }],
    limit: mostProfilerOperations,
  });
}

/** Feature: advisor.read-slow-operations — the state of each profiler, the profiled ones' operations, the log. */
export function request(_context: Context, args: Json): ReadRequest {
  const connection = connectionId(textArg(args, 'connection') ?? '');
  const databases = textsArg(args, 'databases');
  return engineRead(connection, [
    ...databases.map(profileStatusRequest),
    ...profiledOf(args).map(profilerRequest),
    ...(readsLog(args) ? [getLogRequest()] : []),
  ]);
}

/** The operations of a profiler's reply on the collections of the scope, without the noise. */
function profilerOperationsOf(reply: unknown, inScope: ReadonlySet<string>): readonly SlowQuery[] {
  return listOf(reply)
    .map(fromProfileDocument)
    .filter((each) => !isNoise(each) && inScope.has(each.namespace));
}

/** The operations of a reply of `getLog` on the scope, but not on a database whose profiler gave some (rule 3). */
function logOperationsOf(reply: unknown, inScope: ReadonlySet<string>, profiled: ReadonlySet<string>): SlowQuery[] {
  return listOf(recordOf(reply)['log']).flatMap((line) => {
    const operation = fromLogLine(textOf(line) ?? '');
    const kept =
      operation !== undefined &&
      !isNoise(operation) &&
      inScope.has(operation.namespace) &&
      !profiled.has(splitNamespace(operation.namespace).database);
    return kept ? [operation] : [];
  });
}

interface ProfilersRead {
  readonly sources: readonly ProfilerSource[];
  readonly operations: readonly SlowQuery[];
  readonly threshold?: number;
}

function profilersOf(replies: readonly unknown[], args: Json, inScope: ReadonlySet<string>): ProfilersRead {
  const databases = textsArg(args, 'databases');
  const profiled = profiledOf(args);
  let threshold: number | undefined;
  const operations: SlowQuery[] = [];
  const sources = databases.map((database, index): ProfilerSource => {
    const status = replies[index];
    const statusFailure = failureOf(status);
    const state = statusFailure === undefined ? profilerStateOf(status) : undefined;
    threshold ??= state?.slowMs;
    const at = profiled.indexOf(database);
    const documents = at < 0 ? [] : [replies[databases.length + at]];
    const failure = statusFailure ?? documents.map(failureOf).find((each) => each !== undefined);
    const found = documents.flatMap((reply) => profilerOperationsOf(reply, inScope));
    operations.push(...found);
    return {
      database,
      ...(state === undefined ? {} : { level: state.level }),
      operations: found.length,
      ...(failure === undefined ? {} : { error: failure.message }),
    };
  });
  return { sources, operations, ...(threshold === undefined ? {} : { threshold }) };
}

/** Feature: advisor.read-slow-operations — the operations, per profiler what it gave, and the log's part. */
export function parse(replies: readonly unknown[], args: Json = null): ScopeSlowOperations {
  const inScope = new Set(textsArg(args, 'collections'));
  const profilers = profilersOf(replies, args, inScope);
  const fromProfiler = new Set(profilers.sources.filter((each) => each.operations > 0).map((each) => each.database));
  const logReply = readsLog(args) ? replies[textsArg(args, 'databases').length + profiledOf(args).length] : undefined;
  const logFailure = failureOf(logReply);
  const fromLog =
    logReply === undefined || logFailure !== undefined ? [] : logOperationsOf(logReply, inScope, fromProfiler);
  const log: LogSource =
    logReply === undefined
      ? { kind: 'not-read' }
      : logFailure === undefined
        ? { kind: 'read', operations: fromLog.length }
        : { kind: 'failed', message: logFailure.message };
  const operations = [...profilers.operations, ...fromLog];
  const oldest = operations.length === 0 ? undefined : Math.min(...operations.map((each) => each.time));
  return {
    operations,
    profilers: profilers.sources,
    log,
    ...(profilers.threshold === undefined ? {} : { threshold: profilers.threshold }),
    ...(oldest === undefined ? {} : { oldest }),
  };
}
