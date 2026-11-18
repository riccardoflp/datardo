/**
 * Feature: connection.read-only — turns on the safeguard that makes Datardo refuse every write through the connection.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { planText } from './text';
import { appStep, nothingToDo, targetConnection } from './types';

/** Feature: connection.read-only — `make <name> read-only`, with no confirmation: it only takes rights away. */
export function plan(context: Context, _answers: Answers): Outcome {
  const connection = targetConnection(context);
  if (connection === undefined) {
    return nothingToDo('Make read-only', planText.cannotUndoReadOnly);
  }
  const title = `Make ${connection.name} read-only`;
  if (connection.readOnly) {
    return nothingToDo(title, planText.cannotUndoReadOnly);
  }
  return run({
    title,
    steps: [
      appStep(
        'connection.set-read-only',
        { connection: connection.id, readOnly: true },
        planText.makeReadOnly(connection.name),
      ),
    ],
    danger: noDanger,
    undo: { cannot: planText.cannotUndoReadOnly },
    publishes: false,
    after: [],
  });
}
