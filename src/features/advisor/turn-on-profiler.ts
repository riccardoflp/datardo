/**
 * Feature: advisor.turn-on-profiler
 *
 * Makes a database record its slow operations, so that the advisor has more than the last lines of the server log
 * to work on: reads the threshold with `{ profile: -1 }` (`advisor.read-slow-operations` with `log: false`), then one
 * step, `db.getSiblingDB("shop").runCommand({ profile: 1, slowms: 100 })` with the threshold just read, after a
 * confirmation. Started with `{ connection, database }`. Ported from Mongoster's `src/advisor.ts › enableProfiler`.
 */
import type { Answers, Context, OperationFeature, Outcome } from '../../shared/feature';
import { needRead, refuse, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { int, isRecord } from '../monitor/parts/ejson';
import { databaseCommand, mongoStep } from '../monitor/parts/requests';
import { defaultSlowMs } from '../monitor/read-slow-queries';
import type { ScopeSlowOperations } from './read-slow-operations';
import { text } from './text';
import { advisorConnection, startArgs, textArg } from './types';

/** The threshold the read under `profile` gave; 100 ms when the server reports none or the read failed. */
function thresholdOf(answers: Answers): number {
  const read = answers['profile'];
  return isRecord(read) ? ((read as unknown as ScopeSlowOperations).threshold ?? defaultSlowMs) : defaultSlowMs;
}

/** Feature: advisor.turn-on-profiler — reads the threshold, then the plan that turns the profiler on. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const connection = advisorConnection(context, args);
  const database =
    textArg(args, 'database') ?? (context.target.kind === 'database' ? context.target.database : undefined);
  if (connection === undefined || database === undefined) {
    throw new Error('advisor.turn-on-profiler is started on a database of a connection.');
  }
  if (connection.readOnly) {
    return refuse('advisor.turn-on-profiler/read-only', text.turnOn.readOnly(connection.name));
  }
  if (!('profile' in answers)) {
    return needRead('profile', 'advisor.read-slow-operations', {
      connection: connection.id,
      databases: [database],
      profiled: [],
      collections: [],
      log: false,
    });
  }
  const threshold = Math.max(0, Math.round(thresholdOf(answers)));
  const request = databaseCommand(database, { profile: int(1), slowms: int(threshold) });
  return run({
    title: text.turnOn.title(database),
    steps: [mongoStep(connection.id, request, true)],
    danger: {
      kind: 'confirm',
      text: `${text.turnOn.question(database)} ${text.turnOn.says(database, threshold)}`,
      button: text.turnOn.button,
    },
    undo: { cannot: text.turnOn.cannotUndo },
    publishes: false,
    after: [
      { kind: 'notify', level: 'success', text: text.turnOn.done(database, threshold) },
      { kind: 'refresh', connection: connection.id },
    ],
  });
}

/** What the section says when the step failed: *Profiler not changed: <the server's message>*. */
export function failureText(message: string): string {
  return text.turnOn.failed(message);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('advisor.turn-on-profiler'), plan };
