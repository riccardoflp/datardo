/**
 * Feature: connection.reconnect — connects again a connection that was lost, by itself at growing intervals, or at
 * once when the user asks.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { connectRefusal, connectStep } from './connect';
import { disconnectStep } from './disconnect';
import { planText } from './text';
import { nothingToDo, targetConnection } from './types';

/** The waits before the attempts after a drop, then the last one again (Datardo's choice). */
export const reconnectDelaysMs: readonly number[] = [1000, 2000, 5000, 10_000, 30_000];

/** How long after the drop the attempts stop, and the connection is **failed** (Datardo's choice). */
export const giveUpAfterMs = 5 * 60_000;

/** How long a read started while reconnecting waits for the connection (connection.reconnect). */
export const readWaitsMs = 10_000;

/**
 * The wait before the next attempt, given how many were made since the drop and how long ago the drop was; `give-up`
 * when the next attempt would come after the 5 minutes.
 */
export function nextAttempt(attemptsMade: number, sinceDropMs: number): number | 'give-up' {
  const wait = reconnectDelaysMs[Math.min(attemptsMade, reconnectDelaysMs.length - 1)] ?? 30_000;
  return sinceDropMs + wait > giveUpAfterMs ? 'give-up' : wait;
}

/** Feature: connection.reconnect — `disconnect <name>`, then `connect <name>`; what connecting refuses ends it. */
export function plan(context: Context, _answers: Answers): Outcome {
  const connection = targetConnection(context);
  if (connection === undefined) {
    return nothingToDo('Reconnect', planText.nothingToUndo);
  }
  const refusal = connectRefusal(context, connection);
  if (refusal !== undefined) {
    return refusal;
  }
  return run({
    title: `Reconnect ${connection.name}`,
    steps: [disconnectStep(connection), connectStep(connection)],
    danger: noDanger,
    undo: { cannot: planText.nothingToUndo },
    publishes: false,
    after: [],
  });
}
