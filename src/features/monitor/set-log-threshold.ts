/**
 * Feature: monitor.set-log-threshold
 *
 * Changes the time over which the server writes an operation to its log as a slow query, without turning a profiler
 * on: `db.adminCommand({ profile: -1, slowms: 50 })`; the level `-1` leaves every profiler as it is. Started with `{
 * connection, slowMs }`, the value of the section's control. It runs at once. Ported from Mongoster's
 * `src/monitor.ts › setProfile` (level `-1`).
 */
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { int } from './parts/ejson';
import { afterProfiler, wholeMilliseconds } from './parts/profiler-steps';
import { adminCommand, mongoStep, writeTimeLimitMs } from './parts/requests';
import { defaultSlowMs } from './read-slow-queries';
import { text } from './text';
import { requiredConnection, startArgs } from './types';

/** Feature: monitor.set-log-threshold — refused on a read-only connection; otherwise the one step. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const connection = requiredConnection(context, args);
  if (connection.readOnly) {
    return refuse('monitor.set-log-threshold/read-only', text.slow.profile.readOnly(connection.name));
  }
  const slowMs = wholeMilliseconds(args['slowMs']) ?? defaultSlowMs;
  const shown = String(slowMs);
  return run({
    title: text.slow.logThreshold.title(shown),
    steps: [mongoStep(connection.id, adminCommand({ profile: int(-1), slowms: int(slowMs) }, writeTimeLimitMs), true)],
    danger: { kind: 'none' },
    undo: { cannot: text.slow.logThreshold.cannotUndo },
    publishes: false,
    after: afterProfiler(connection, text.slow.logThreshold.done(shown), { connection: connection.id, source: 'log' }),
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('monitor.set-log-threshold'), plan };
