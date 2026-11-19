/**
 * Feature: saved-query.recent
 *
 * Remembers each query or pipeline that ran without an error for its collection, so that the last ones can be run
 * again without having been saved: at most 50, newest first, each once. It is started by `query.run`,
 * `aggregate.run` and `aggregate.write-output` once a find or a pipeline has ended without an error, with
 * `{ connection, database, collection, query }`, the query as `saved-query` writes it (`readQueryText`).
 *
 * Two queries are the same when their texts parse to the same values (`query.parse`, here the mongosh reader of the
 * pipeline editor), so that spaces, quotes and line breaks do not count; a text that does not parse is compared as
 * text. A find and a pipeline are never the same.
 */
import {
  needRead,
  noDanger,
  run,
  type AppStep,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { noMakers } from '../aggregate/mongosh/helpers';
import { valueOf } from '../aggregate/mongosh/parse';
import { recentKept, type CollectionQueries } from './list';
import { text } from './text';
import {
  appStep,
  argumentsOf,
  isEmptyFind,
  keptQuery,
  nothingToDo,
  readQueryText,
  recentJson,
  scopeJson,
  scopeOf,
  scopePath,
  type CollectionScope,
  type QueryText,
  type RecentQuery,
  type Stage,
} from './types';

/** The text of a query part as it is compared: its value when it parses, else its text without the spaces around. */
function comparable(source: string): string {
  const trimmed = source.trim();
  if (trimmed === '') {
    return '';
  }
  try {
    const parsed = valueOf(trimmed, noMakers);
    return parsed.ok ? `value ${JSON.stringify(parsed.value)}` : `text ${trimmed}`;
  } catch {
    // A helper that needs what a context gives (the time of `ISODate()`) cannot be read without it: the text is then
    // compared as it is, which is what a text that does not parse gets.
    return `text ${trimmed}`;
  }
}

function sameStage(first: Stage, second: Stage): boolean {
  return (
    first.name.trim() === second.name.trim() &&
    first.enabled === second.enabled &&
    comparable(first.body) === comparable(second.body)
  );
}

/** Whether two queries are the same query, whatever their spaces, quotes and line breaks. */
export function sameQuery(first: QueryText, second: QueryText): boolean {
  if (first.kind === 'find' && second.kind === 'find') {
    return (
      comparable(first.filter) === comparable(second.filter) &&
      comparable(first.sort) === comparable(second.sort) &&
      comparable(first.projection) === comparable(second.projection)
    );
  }
  if (first.kind === 'pipeline' && second.kind === 'pipeline') {
    return (
      first.stages.length === second.stages.length &&
      first.stages.every((stage, index) => {
        const other = second.stages[index];
        return other !== undefined && sameStage(stage, other);
      })
    );
  }
  return false;
}

/** Whether a query is kept among the recent ones: a find with something typed, a pipeline with an enabled stage. */
export function isRemembered(query: QueryText): boolean {
  return query.kind === 'find' ? !isEmptyFind(query) : query.stages.some((stage) => stage.enabled);
}

/** The recent queries with one more first: the same one older is removed, and the oldest beyond 50 dropped. */
export function withRecent(recent: readonly RecentQuery[], added: RecentQuery): readonly RecentQuery[] {
  return [added, ...recent.filter((each) => !sameQuery(each.query, added.query))].slice(0, recentKept);
}

/** The app step that sets the recent queries of a collection. */
export function recentStep(scope: CollectionScope, recent: readonly RecentQuery[], stepText: string): AppStep {
  return appStep('saved-query.set-recent', { ...scopeJson(scope), recent: recent.map(recentJson) }, stepText);
}

/** The queries of the collection, from `saved-query.list`, once read. */
export function listAnswer(answers: Answers): CollectionQueries | undefined {
  return answers['list'] as CollectionQueries | undefined;
}

/** Reads the queries of the collection (`saved-query.list`), under the key `list`. */
export function readList(scope: CollectionScope): Outcome {
  return needRead('list', 'saved-query.list', scopeJson(scope));
}

/** Feature: saved-query.recent — `add the query to the recent queries of Local / shop / orders`. */
export function plan(context: Context, answers: Answers): Outcome {
  const scope = scopeOf(context, answers);
  const query = readQueryText(argumentsOf(answers)['query']);
  if (scope === undefined || query === undefined || !isRemembered(query)) {
    return nothingToDo(text.recent.title, text.recent.cannotUndo);
  }
  const list = listAnswer(answers);
  if (list === undefined) {
    return readList(scope);
  }
  const recent = withRecent(list.recent, { query: keptQuery(query), at: context.now });
  return run({
    title: text.recent.title,
    steps: [recentStep(scope, recent, text.recent.add(scopePath(scope)))],
    danger: noDanger,
    undo: { cannot: text.recent.cannotUndo },
    publishes: false,
    after: [],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('saved-query.recent'), plan };
