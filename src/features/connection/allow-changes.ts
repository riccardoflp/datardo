/**
 * Feature: connection.allow-changes — turns the read-only safeguard off, after a confirmation.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Answers, Context, Danger, Outcome } from '../../shared/feature';
import { run } from '../../shared/feature';
import { planText } from './text';
import { appStep, nothingToDo, targetConnection } from './types';

/** The confirmation: what can then be modified, for the engine of the connection, and the button **Allow changes**. */
export function allowChangesDanger(connection: ConnectionView): Danger {
  return {
    kind: 'confirm',
    text: connection.engine === 'mongodb' ? planText.allowChangesMongo : planText.allowChangesRedis,
    button: planText.allowChangesButton,
  };
}

/** Feature: connection.allow-changes — `allow changes through <name>`, confirmed, on a read-only connection. */
export function plan(context: Context, _answers: Answers): Outcome {
  const connection = targetConnection(context);
  if (connection === undefined) {
    return nothingToDo('Allow changes', planText.cannotUndoAllowChanges);
  }
  const title = planText.allowChangesQuestion(connection.name);
  if (!connection.readOnly) {
    return nothingToDo(title, planText.cannotUndoAllowChanges);
  }
  return run({
    title,
    steps: [
      appStep(
        'connection.set-read-only',
        { connection: connection.id, readOnly: false },
        planText.allowChanges(connection.name),
      ),
    ],
    danger: allowChangesDanger(connection),
    undo: { cannot: planText.cannotUndoAllowChanges },
    publishes: false,
    after: [],
  });
}
