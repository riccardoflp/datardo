/**
 * Feature: saved-query.remove-recent
 *
 * Forgets one recent query of the collection, at once and without a question: **Remove from history** on an item of
 * **Recent**, started with `{ connection, database, collection, query }`. The others keep their order; the saved
 * queries and the query of the tab are not touched.
 */
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { listAnswer, readList, recentStep, sameQuery } from './recent';
import { text } from './text';
import { argumentsOf, nothingToDo, readQueryText, scopeOf, scopePath } from './types';

/** Feature: saved-query.remove-recent — `remove a query from the recent queries of Local / shop / orders`. */
export function plan(context: Context, answers: Answers): Outcome {
  const scope = scopeOf(context, answers);
  const query = readQueryText(argumentsOf(answers)['query']);
  if (scope === undefined || query === undefined) {
    return nothingToDo(text.recent.removeTitle, text.recent.removeCannotUndo);
  }
  const list = listAnswer(answers);
  if (list === undefined) {
    return readList(scope);
  }
  const kept = list.recent.filter((each) => !sameQuery(each.query, query));
  if (kept.length === list.recent.length) {
    return nothingToDo(text.recent.removeTitle, text.recent.removeCannotUndo);
  }
  return run({
    title: text.recent.removeTitle,
    steps: [recentStep(scope, kept, text.recent.remove(scopePath(scope)))],
    danger: noDanger,
    undo: { cannot: text.recent.removeCannotUndo },
    publishes: false,
    after: [],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('saved-query.remove-recent'), plan };
