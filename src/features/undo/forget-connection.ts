/**
 * Feature: undo.forget-connection — when a connection is removed, its recorded operations are deleted with it, since
 * they could no longer be undone.
 */
import type { AppStep, Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { savedConnection } from '../../shared/state/connections';
import { targetConnection } from '../../shared/target';
import { undoOf } from './state/history';
import { removeText } from './text';
import { appStep } from './types';

/** How many operations of the undo history are on the connection: what `connection.remove` counts. */
export function operationCount(state: AppState, connection: ConnectionId): number {
  return undoOf(state).entries.filter((each) => each.connection === connection).length;
}

/**
 * The step `connection.remove` puts in its own plan: `delete the 12 operations of Local from the undo history`; none
 * when the connection has no operation.
 */
export function forgetStep(state: AppState, connection: ConnectionId, name: string): AppStep | undefined {
  const count = operationCount(state, connection);
  return count === 0
    ? undefined
    : appStep('undo.forget-connection', { connection }, removeText.forgetStep(count, name));
}

/** Feature: undo.forget-connection — on the connection of the target; no step when it has no operation. */
export function plan(context: Context, _answers: Answers): Outcome {
  const id = targetConnection(context.target);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const name = connection?.name ?? '';
  const step = id === undefined ? undefined : forgetStep(context.state, id, name);
  return run({
    title: removeText.forgetTitle(name),
    steps: step === undefined ? [] : [step],
    danger: noDanger,
    undo: { cannot: removeText.cannotUndoClear },
    publishes: false,
    after: [],
  });
}
