/**
 * What the Operations of the profiler share (`monitor.set-profiler`, `monitor.set-log-threshold`,
 * `monitor.clear-profiler`): the database and the numbers they are started with, the profiler's state they read, the
 * step that sets a profiler, and the slow operations read again once they ran.
 */
import type { Json } from '../../../shared/engine-request';
import type { After, Answers, EngineStep } from '../../../shared/feature';
import { featureId } from '../../../shared/ids';
import type { ProfilerState } from '../read-slow-queries';
import type { MonitorConnection } from '../types';
import { int, isRecord, recordOf } from './ejson';
import { valueOfPart, type PartRead } from './failure';
import { databaseCommand, mongoStep, writeTimeLimitMs } from './requests';

/** A level of the profiler: off, slow operations, every operation. */
export type ProfilerLevel = 0 | 1 | 2;

/** The milliseconds typed, rounded to a whole number, 0 at least: `12.6` is 13, `-5` is 0. */
export function wholeMilliseconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined;
}

/** The level of the arguments: 0, 1 or 2; 1 when it is none of them. */
export function levelOf(value: unknown): ProfilerLevel {
  return value === 0 || value === 2 ? value : 1;
}

/** The step that sets the profiler of a database: `db.getSiblingDB("shop").runCommand({ profile: 1, slowms: 100 })`. */
export function setProfilerStep(
  connection: MonitorConnection,
  database: string,
  level: number,
  slowMs?: number,
): EngineStep {
  const command: Json = slowMs === undefined ? { profile: int(level) } : { profile: int(level), slowms: int(slowMs) };
  return mongoStep(connection.id, databaseCommand(database, command, writeTimeLimitMs), true);
}

/** The arguments of the read of the profiler's state of a database (`monitor.read-slow-queries`). */
export function profilerStateArgs(connection: MonitorConnection, database: string): Json {
  return { connection: connection.id, database, source: 'profiler', only: 'profiler' };
}

/** The profiler's state read under `key`, when it was read. */
export function profilerStateRead(answers: Answers, key: string): ProfilerState | undefined {
  const read = answers[key];
  if (!isRecord(read)) {
    return undefined;
  }
  return valueOfPart(recordOf(read)['profiler'] as unknown as PartRead<ProfilerState> | undefined);
}

/** What follows a change of the profiler: the sentence of the section, and the slow operations read again. */
export function afterProfiler(connection: MonitorConnection, sentence: string, args: Json): readonly After[] {
  return [
    { kind: 'notify', level: 'success', text: sentence },
    {
      kind: 'start',
      feature: featureId('monitor.read-slow-queries'),
      target: { kind: 'connection', connection: connection.id },
      args,
    },
  ];
}
