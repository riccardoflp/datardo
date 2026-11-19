/**
 * Feature: connection.unlink-redis — stops publishing the writes of a MongoDB connection for redis-oplog, keeping both
 * connections and what the form says about what is published.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { organizeText, planText } from './text';
import { appStep, connectionById, nothingToDo, targetOrCurrent } from './types';

/** Feature: connection.unlink-redis — `unlink <name> from <Redis connection>`, with no confirmation. */
export function plan(context: Context, _answers: Answers): Outcome {
  const connection = targetOrCurrent(context);
  const linked = connection?.publishesTo === undefined ? undefined : connectionById(context, connection.publishesTo);
  if (connection === undefined || connection.publishesTo === undefined) {
    return nothingToDo('Unlink the Redis connection', organizeText.cannotUndoUnlink);
  }
  return run({
    title: organizeText.unlinkTitle(linked?.name ?? connection.publishesTo),
    steps: [
      appStep(
        'connection.unlink',
        { connection: connection.id },
        planText.unlink(connection.name, linked?.name ?? connection.publishesTo),
      ),
    ],
    danger: noDanger,
    undo: { cannot: organizeText.cannotUndoUnlink },
    publishes: false,
    after: [{ kind: 'notify', level: 'info', text: organizeText.unlinked(connection.name) }],
  });
}
