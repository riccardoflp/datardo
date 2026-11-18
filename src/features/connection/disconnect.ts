/**
 * Feature: connection.disconnect — closes the client of a connection, and its SSH tunnel.
 */
import type { ConnectionStateName, ConnectionView } from '../../shared/connection';
import type { AppStep, Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { connectionState } from '../../shared/state/connections';
import { planText } from './text';
import { appStep, connectionsOf, nothingToDo, targetConnection } from './types';

/** Whether a connection in this state has a client, or is getting one: what disconnecting closes. */
export function hasClient(state: ConnectionStateName): boolean {
  return state === 'connected' || state === 'connecting' || state === 'reconnecting';
}

/** The step that disconnects: `disconnect <name>`. */
export function disconnectStep(connection: ConnectionView): AppStep {
  return appStep('engine.disconnect', { connection: connection.id }, planText.disconnect(connection.name));
}

/** Feature: connection.disconnect — `disconnect <name>`, when the connection has a client. */
export function plan(context: Context, _answers: Answers): Outcome {
  const connection = targetConnection(context);
  if (connection === undefined) {
    return nothingToDo('Disconnect', planText.nothingToUndo);
  }
  const title = `Disconnect ${connection.name}`;
  if (!hasClient(connectionState(connectionsOf(context.state), connection.id))) {
    return nothingToDo(title, planText.nothingToUndo);
  }
  return run({
    title,
    steps: [disconnectStep(connection)],
    danger: noDanger,
    undo: { cannot: planText.nothingToUndo },
    publishes: false,
    after: [],
  });
}
