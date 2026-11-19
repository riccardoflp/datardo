/**
 * Feature: saved-query.clear-recent
 *
 * Forgets every recent query of the collection, after the confirmation *Clear the recent queries of orders?* The
 * saved queries stay, and so do the recent queries of the other collections and of the other connections.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { recentStep } from './recent';
import { text } from './text';
import { nothingToDo, scopeOf, scopePath } from './types';

/** Feature: saved-query.clear-recent — `clear the recent queries of Local / shop / orders`, confirmed. */
export function plan(context: Context, answers: Answers): Outcome {
  const scope = scopeOf(context, answers);
  if (scope === undefined) {
    return nothingToDo(text.commands.clearRecent, text.recent.clearCannotUndo);
  }
  return run({
    title: text.recent.clearQuestion(scope.collection),
    steps: [recentStep(scope, [], text.recent.clear(scopePath(scope)))],
    danger: { kind: 'confirm', text: text.recent.clearText, button: text.recent.clearButton },
    undo: { cannot: text.recent.clearCannotUndo },
    publishes: false,
    after: [],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('saved-query.clear-recent'), plan };
