/**
 * Feature: monitor.clear-profiler
 *
 * Empties `system.profile` of one database and leaves the profiler recording as before: the server drops it only
 * while the profiler is off, so the plan turns it off, drops the collection and sets it back. Started with `{
 * connection, database }`. It reads the profiler's level and threshold (`monitor.read-slow-queries`, `only:
 * "profiler"`) and the collections of the database (`tree.list-collections`) first. Ported from Mongoster's
 * `src/monitor.ts › clearProfile`.
 */
import {
  needRead,
  refuse,
  run,
  type Answers,
  type Context,
  type EngineStep,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { listOf, recordOf, textOf } from './parts/ejson';
import { afterProfiler, profilerStateArgs, profilerStateRead, setProfilerStep } from './parts/profiler-steps';
import { collectionCall, mongoStep, writeTimeLimitMs } from './parts/requests';
import type { ProfilerState } from './read-slow-queries';
import { text } from './text';
import { requiredConnection, startArgs, textArg, type MonitorConnection } from './types';

/** Whether the collections read under `collections` hold `system.profile`. */
function hasProfileCollection(answers: Answers): boolean {
  return listOf(recordOf(answers['collections'])['entries']).some(
    (entry) => textOf(recordOf(entry)['name']) === 'system.profile',
  );
}

/** The steps: off, drop, back on; the first and the last left out when it is off, the drop when there is nothing. */
export function clearSteps(
  connection: MonitorConnection,
  database: string,
  state: ProfilerState,
  hasCollection: boolean,
): readonly EngineStep[] {
  const drop = mongoStep(
    connection.id,
    collectionCall({
      database,
      collection: 'system.profile',
      method: 'drop',
      arguments: [],
      timeLimitMs: writeTimeLimitMs,
    }),
    true,
  );
  const dropping = hasCollection ? [drop] : [];
  if (state.level === 0) {
    return dropping;
  }
  return [
    setProfilerStep(connection, database, 0),
    ...dropping,
    setProfilerStep(connection, database, state.level, state.slowMs),
  ];
}

/** Feature: monitor.clear-profiler — refused on a read-only connection and through a mongos; otherwise confirmed. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const connection = requiredConnection(context, args);
  if (connection.readOnly) {
    return refuse('monitor.clear-profiler/read-only', text.readOnly(connection.name));
  }
  if (connection.mongos) {
    return refuse('monitor.clear-profiler/unsupported', text.slow.mongos);
  }
  const database = textArg(args, 'database');
  if (database === undefined) {
    throw new Error('monitor.clear-profiler is started on a database.');
  }
  if (!('profiler' in answers)) {
    return needRead('profiler', 'monitor.read-slow-queries', profilerStateArgs(connection, database));
  }
  const state = profilerStateRead(answers, 'profiler');
  if (state === undefined) {
    return refuse('monitor.clear-profiler/not-read', text.slow.clear.notRead(database));
  }
  if (!('collections' in answers)) {
    return needRead('collections', 'tree.list-collections', { connection: connection.id, database });
  }
  const words = text.slow.clear;
  return run({
    title: words.title(database),
    steps: clearSteps(connection, database, state, hasProfileCollection(answers)),
    danger: { kind: 'confirm', text: `${words.question(database)}\n${words.warning}`, button: words.button },
    undo: { cannot: words.cannotUndo },
    publishes: false,
    after: afterProfiler(connection, words.done(database), { connection: connection.id, source: 'profiler', database }),
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('monitor.clear-profiler'), plan };
