/**
 * Feature: monitor.set-profiler
 *
 * Turns the profiler of one database on or off, and sets the time over which it records an operation:
 * `db.getSiblingDB("shop").runCommand({ profile: 1, slowms: 100 })`. Started with `{ connection, database, level,
 * slowMs }`, the values of the section's controls (`level` 0 **Off**, 1 **Slow operations**, 2 **All operations**).
 * It runs at once: it is a server setting, and `slowms` is the threshold of the whole server. Ported from
 * Mongoster's `src/monitor.ts › setProfile`.
 */
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { afterProfiler, levelOf, setProfilerStep, wholeMilliseconds, type ProfilerLevel } from './parts/profiler-steps';
import { defaultSlowMs } from './read-slow-queries';
import { text } from './text';
import { requiredConnection, startArgs, textArg } from './types';

/** What the section says once the profiler of a database is set. */
export function profilerSentence(database: string, level: ProfilerLevel, slowMs: number): string {
  switch (level) {
    case 0:
      return text.slow.profile.isOff(database);
    case 1:
      return text.slow.profile.recordsSlower(database, String(slowMs));
    case 2:
      return text.slow.profile.recordsEvery(database);
  }
}

/** What a failure says: *Profiler not changed: <the server's message>*. */
export function failureText(message: string): string {
  return text.slow.profile.notChanged(message);
}

/** Feature: monitor.set-profiler — refused on a read-only connection and through a mongos; otherwise one step. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const connection = requiredConnection(context, args);
  if (connection.readOnly) {
    return refuse('monitor.set-profiler/read-only', text.slow.profile.readOnly(connection.name));
  }
  if (connection.mongos) {
    return refuse('monitor.set-profiler/unsupported', text.slow.mongos);
  }
  const database = textArg(args, 'database');
  if (database === undefined) {
    throw new Error('monitor.set-profiler is started on a database.');
  }
  const level = levelOf(args['level']);
  const slowMs = wholeMilliseconds(args['slowMs']) ?? defaultSlowMs;
  return run({
    title: text.slow.profile.title(database),
    steps: [setProfilerStep(connection, database, level, slowMs)],
    danger: { kind: 'none' },
    undo: { cannot: text.slow.profile.cannotUndo },
    publishes: false,
    after: afterProfiler(connection, profilerSentence(database, level, slowMs), {
      connection: connection.id,
      source: 'profiler',
      database,
    }),
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('monitor.set-profiler'), plan };
