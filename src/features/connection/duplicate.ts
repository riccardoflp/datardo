/**
 * Feature: connection.duplicate — saves a copy of a connection, with everything it has, under a new name. The main
 * process copies the secrets inside the secret storage: the window never receives them.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { newConnectionId } from './save';
import { organizeText, planText } from './text';
import { appStep, connectionsOf, nothingToDo, numberedName, targetOrCurrent } from './types';

/** Feature: connection.duplicate — `save the connection <name> (2)`, then a notification with **Edit connection…**. */
export function plan(context: Context, _answers: Answers): Outcome {
  const connection = targetOrCurrent(context);
  if (connection === undefined) {
    return nothingToDo('Duplicate connection', organizeText.cannotUndoDuplicate);
  }
  const saved = connectionsOf(context.state).saved;
  const name = numberedName(connection.name, new Set(saved.map((each) => each.name)));
  const id = newConnectionId(
    context.now,
    saved.map((each) => each.id),
  );
  return run({
    title: organizeText.duplicateTitle(connection.name),
    steps: [
      appStep('connection.duplicate', { connection: connection.id, copy: id, name }, planText.saveConnection(name)),
    ],
    danger: noDanger,
    undo: { cannot: organizeText.cannotUndoDuplicate },
    publishes: false,
    after: [
      {
        kind: 'notify',
        level: 'success',
        text: organizeText.added(name),
        actions: [
          {
            label: organizeText.edit,
            feature: featureId('connection.edit'),
            target: { kind: 'connection', connection: id },
          },
        ],
      },
    ],
  });
}
