/**
 * Feature: index.drop-search
 *
 * Drops a search index after a confirmation; the server removes it in the background. Started with `{ connection,
 * database, collection, index }`.
 */
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { text } from './text';
import { mongoRequest, subjectOf, writeStep } from './types';

/** Feature: index.drop-search — `db.movies.dropSearchIndex("titles")`, after typing the index's name. */
export function plan(context: Context, answers: Answers): Outcome {
  const subject = subjectOf(context, answers);
  const name = subject?.args['index'];
  if (subject === undefined || typeof name !== 'string') {
    throw new Error('index.drop-search needs { connection, database, collection, index }.');
  }
  if (subject.connection.readOnly) {
    return refuse('index.drop-search/read-only', text.readOnly(subject.connection.name));
  }
  if (subject.view) {
    return refuse('index.drop-search/view', text.viewNoSearchIndexes);
  }
  return run({
    title: text.search.dropTitle(name, subject.collection),
    steps: [writeStep(subject, mongoRequest(subject, 'dropSearchIndex', [name]))],
    danger: { kind: 'destructive', text: text.search.dropText, button: text.search.drop, name },
    undo: { cannot: text.cannotUndo },
    publishes: false,
    after: [{ kind: 'refresh', connection: subject.connection.id }],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('index.drop-search'), plan };
