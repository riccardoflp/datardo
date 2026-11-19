/**
 * How `slow_queries` reads the slow operations (`mcp.performance-tools`): the profiler of a database (`profile: -1`,
 * which only reads its level, then `system.profile`), or the `Slow query` lines of the server log (`getLog`). The
 * profiler's level is never changed: when it is off, the text says how the user can turn it on.
 */
import type { ConnectionView } from '../../../shared/connection';
import { isFailed } from '../types';
import { notAuthorized } from './deployment';
import { listOf, mongoCall, numberIn, recordOf, type MongoPlace } from './mongo';
import { ToolProblem, type ToolSession } from './program';
import { fromLogLine, fromProfileDocument, isNoise, type SlowOp } from './slow-ops';

/** The profiler documents read per database, the most recent. */
export const PROFILE_LIMIT = 5000;

/** Where the operations were read. */
export interface SlowRead {
  readonly ops: readonly SlowOp[];
  readonly used: 'profiler' | 'log';
  readonly level?: number;
  readonly slowms?: number;
  readonly notes: readonly string[];
}

/** `Not authorized to <action>: the user needs the <role> role (…).`, or `Could not <action>: …`. */
export function refusedSentence(reply: unknown, action: string, role: string): string {
  const message = isFailed(reply) ? reply.message : String(reply);
  return notAuthorized(reply)
    ? `Not authorized to ${action}: the user needs the ${role} role (${message}).`
    : `Could not ${action}: ${message}`;
}

const turnOn = (database: string): string =>
  `it can be turned on in Datardo's Monitor page (Profiler) or with db.setProfilingLevel(1, { slowms: 100 }) on ${database}`;

interface Profiler {
  readonly status: unknown;
  readonly entry: unknown;
  readonly level?: number;
  readonly slowms?: number;
}

function profilerOf(session: ToolSession, place: MongoPlace): Profiler {
  const profile = { ...place, collection: 'system.profile' };
  const [status, entry] = session.send([
    mongoCall(place, 'runCommand', [{ profile: -1 }]),
    mongoCall(profile, 'findOne', [{}, { projection: { _id: 1 } }]),
  ]);
  const record = recordOf(status);
  const level = isFailed(status) ? undefined : numberIn(record['was']);
  const slowms = isFailed(status) ? undefined : numberIn(record['slowms']);
  return { status, entry, ...(level === undefined ? {} : { level }), ...(slowms === undefined ? {} : { slowms }) };
}

function fromProfiler(session: ToolSession, place: MongoPlace, profiler: Profiler, since?: number): SlowRead {
  const database = place.database;
  const filter = since === undefined ? {} : { ts: { $gte: { $date: { $numberLong: String(since) } } } };
  const [found] = session.send([
    mongoCall({ ...place, collection: 'system.profile' }, 'find', [filter, { sort: { ts: -1 } }], PROFILE_LIMIT + 1),
  ]);
  if (isFailed(found)) {
    throw new ToolProblem(refusedSentence(found, `read ${database}.system.profile`, 'dbAdmin'));
  }
  const documents = listOf(found);
  const entries = profiler.entry !== null && !isFailed(profiler.entry);
  const notes = [
    ...(profiler.level === 0
      ? [
          entries
            ? `The profiler of ${database} is off now: these are the operations it recorded before; ${turnOn(database)}.`
            : `The profiler of ${database} is off (level 0), so it records nothing: ${turnOn(database)}. Without it, source "log" reads the slow operations of the server log.`,
        ]
      : []),
    ...(documents.length > PROFILE_LIMIT
      ? [`Only the ${PROFILE_LIMIT.toLocaleString('en-US')} most recent profiler entries were read.`]
      : []),
  ];
  return {
    ops: documents
      .slice(0, PROFILE_LIMIT)
      .map(fromProfileDocument)
      .filter((op) => !isNoise(op)),
    used: 'profiler',
    ...(profiler.level === undefined ? {} : { level: profiler.level }),
    ...(profiler.slowms === undefined ? {} : { slowms: profiler.slowms }),
    notes,
  };
}

function fromLog(
  session: ToolSession,
  connection: ConnectionView,
  database: string | undefined,
  since?: number,
): Omit<SlowRead, 'notes' | 'slowms'> & { readonly limited: boolean; readonly slowms?: number } {
  const [log, status] = session.send([
    mongoCall({ connection: connection.id, database: 'admin' }, 'runCommand', [{ getLog: 'global' }]),
    mongoCall({ connection: connection.id, database: database ?? 'admin' }, 'runCommand', [{ profile: -1 }]),
  ]);
  if (isFailed(log)) {
    throw new ToolProblem(refusedSentence(log, 'read the server log (getLog)', 'clusterMonitor'));
  }
  const lines = listOf(recordOf(log)['log']).filter((each): each is string => typeof each === 'string');
  const ops = lines
    .map(fromLogLine)
    .filter((op): op is SlowOp => op !== undefined && (since === undefined || op.at >= since))
    .filter((op) => !isNoise(op) && (database === undefined || op.ns.startsWith(`${database}.`)))
    .reverse();
  const slowms = isFailed(status) ? undefined : numberIn(recordOf(status)['slowms']);
  return {
    ops,
    used: 'log',
    limited: (numberIn(recordOf(log)['totalLinesWritten']) ?? 0) > lines.length,
    ...(slowms === undefined ? {} : { slowms }),
  };
}

/** The slow operations from the profiler of `database` or the server log, as `source` asks. */
export function readSlowOps(
  session: ToolSession,
  connection: ConnectionView,
  asked: { readonly source: 'auto' | 'profiler' | 'log'; readonly database?: string; readonly since?: number },
): SlowRead {
  const { source, database, since } = asked;
  const notes: string[] = [];
  if (source !== 'log' && database !== undefined) {
    const place = { connection: connection.id, database };
    const profiler = profilerOf(session, place);
    if (source === 'profiler' && isFailed(profiler.status)) {
      throw new ToolProblem(refusedSentence(profiler.status, `read the profiler status of ${database}`, 'dbAdmin'));
    }
    const readError = isFailed(profiler.entry);
    if (source === 'profiler' && readError) {
      throw new ToolProblem(refusedSentence(profiler.entry, `read ${database}.system.profile`, 'dbAdmin'));
    }
    const entries = !readError && profiler.entry !== null;
    if (!readError && (source === 'profiler' || (profiler.level ?? 0) > 0 || entries)) {
      return fromProfiler(session, place, profiler, since);
    }
    notes.push(
      isFailed(profiler.status) || readError
        ? `The profiler of ${database} couldn't be read (it needs the dbAdmin role): showing the slow operations of the server log.`
        : `The profiler of ${database} is off (level 0) and has recorded nothing: showing the slow operations of the server log; ${turnOn(database)}.`,
    );
  }
  const log = fromLog(session, connection, database, since);
  if (log.limited) {
    notes.push(
      'The server keeps only its most recent 1,024 log lines in memory: older slow operations are not in them.',
    );
  }
  return { ops: log.ops, used: 'log', ...(log.slowms === undefined ? {} : { slowms: log.slowms }), notes };
}
