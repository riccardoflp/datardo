/**
 * Feature: saved-query.run
 *
 * Puts a saved or recent query back in its collection tab and runs it. Started with `{ connection, database,
 * collection, tab?, query, name? }`, the query as the list holds it; or with `{ …, saved }` (`savedRefOf`), the query
 * read from the list, as a pin of a query in the folder holds only its file. A find fills the filter, the sort and the
 * projection and runs (`query.run`); a pipeline shows the pipeline editor with its stages, the whole pipeline shown,
 * and runs (`aggregate.run`, which hands a pipeline ending with `$out` or `$merge` to `aggregate.write-output`). With
 * no tab of the collection open, the main process opens one (`tab.open`) when it carries out `saved-query.load`.
 */
import type { Json } from '../../shared/engine-request';
import {
  noDanger,
  run,
  type After,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId, type TabId } from '../../shared/ids';
import { editorJson } from '../aggregate/types';
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

/** What runs the query once it is in the tab: `query.run` for a find, `aggregate.run` for a pipeline. */
export function runAfter(scope: CollectionScope, tab: TabId | undefined, query: QueryText): After {
  const target = {
    kind: 'collection' as const,
    connection: scope.connection,
    database: scope.database,
    collection: scope.collection,
  };
  const where: { [key: string]: Json } = tab === undefined ? {} : { tab };
  if (query.kind === 'find') {
    const find = { filter: query.filter, sort: query.sort, projection: query.projection };
    return { kind: 'start', feature: featureId('query.run'), target, args: { ...where, query: find, page: 1 } };
  }
  const pipeline = editorJson({ stages: query.stages });
  return {
    kind: 'start',
    feature: featureId('aggregate.run'),
    target,
    args: { ...where, pipeline, page: 1, whole: true },
  };
}

function queryOf(answers: Answers): { readonly query: QueryText; readonly name?: string } | undefined | 'read' {
  const args = argumentsOf(answers);
  const query = readQueryText(args['query']);
  const name = typeof args['name'] === 'string' ? args['name'] : undefined;
  if (query !== undefined) {
    return { query, ...(name === undefined ? {} : { name }) };
  }
  const ref = savedRefOf(answers);
  if (ref === undefined) {
    return undefined;
  }
  const list = listAnswer(answers);
  if (list === undefined) {
    return 'read';
  }
  const saved = findSaved(list.saved, ref);
  return saved === undefined ? undefined : { query: saved.query, name: saved.name };
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
    after: [runAfter(scope, tab, found.query)],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('saved-query.run'), plan };
