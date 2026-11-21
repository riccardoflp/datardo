/**
 * Feature: saved-query.run
 *
 * Puts a saved or recent query back in its collection tab and runs it. Started with `{ connection, database,
 * collection, tab?, query, name? }`, the query as the list holds it; or with `{ …, saved, query? }` (`savedRefOf`),
 * the query read from the list as it is now, as a pin holds only the file of a query in the folder. The step
 * `saved-query.load` puts the query in the tab, opening one when none of the collection is open (`tab.open`); the
 * window then shows it, a find in the query bar and a pipeline in the pipeline editor with the whole pipeline shown,
 * and runs it as its own run button does (`query.run`, `aggregate.run`, which hands a pipeline ending with `$out` or
 * `$merge` to `aggregate.write-output`): a run started by the main process would give its page to no tab.
 */
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId, type TabId } from '../../shared/ids';
import { listAnswer, readList } from './recent';
import { queryLine } from './show';
import { text } from './text';
import {
  appStep,
  argumentsOf,
  findSaved,
  nothingToDo,
  queryJson,
  readQueryText,
  savedRefOf,
  scopeJson,
  scopeOf,
  type CollectionScope,
  type QueryText,
} from './types';

/** The collection tab the query goes to: the one named or active when it shows the collection, else any that does. */
export function tabOfCollection(context: Context, scope: CollectionScope): TabId | undefined {
  const shows = (id: TabId | undefined): boolean => {
    const tab = context.state.tabs.tabs.find((each) => each.id === id);
    return (
      tab?.shows.kind === 'collection' &&
      tab.shows.connection === scope.connection &&
      tab.shows.database === scope.database &&
      tab.shows.collection === scope.collection
    );
  };
  if (shows(scope.tab)) {
    return scope.tab;
  }
  if (shows(context.state.tabs.active)) {
    return context.state.tabs.active;
  }
  return context.state.tabs.tabs.find((each) => shows(each.id))?.id;
}

function queryOf(answers: Answers): { readonly query: QueryText; readonly name?: string } | undefined | 'read' {
  const args = argumentsOf(answers);
  const given = readQueryText(args['query']);
  const name = typeof args['name'] === 'string' ? args['name'] : undefined;
  const ref = savedRefOf(answers);
  if (ref === undefined) {
    return given === undefined ? undefined : { query: given, ...(name === undefined ? {} : { name }) };
  }
  const list = listAnswer(answers);
  if (list === undefined) {
    return 'read';
  }
  // The saved query as it is now; the query a pin of one for me holds when it is no longer listed.
  const saved = findSaved(list.saved, ref);
  if (saved !== undefined) {
    return { query: saved.query, name: saved.name };
  }
  return given === undefined ? undefined : { query: given, name: ref.name };
}

/** Feature: saved-query.run — `set the query of orders to "Paid this month"`, then runs it. */
export function plan(context: Context, answers: Answers): Outcome {
  const scope = scopeOf(context, answers);
  const found = scope === undefined ? undefined : queryOf(answers);
  if (scope === undefined || found === undefined) {
    return nothingToDo(text.run.title, text.run.cannotUndo);
  }
  if (found === 'read') {
    return readList(scope);
  }
  const tab = tabOfCollection(context, scope);
  const what = found.name === undefined ? queryLine(found.query) : `"${found.name}"`;
  const args = { ...scopeJson(scope), ...(tab === undefined ? {} : { tab }), query: queryJson(found.query) };
  return run({
    title: text.run.title,
    steps: [appStep('saved-query.load', args, text.run.step(scope.collection, what))],
    danger: noDanger,
    undo: { cannot: text.run.cannotUndo },
    publishes: false,
    after: [],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('saved-query.run'), plan };
