/**
 * Feature: index.drop
 *
 * Drops an index after a confirmation that suggests hiding it first. Started with `{ connection, database, collection,
 * index }`; `advice`, the reason of an advice of the Index advisor, begins the text when started from one.
 */
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { idIndex } from './hide';
import { text } from './text';
import { mongoRequest, subjectOf, writeStep } from './types';

/** Feature: index.drop — `db.orders.dropIndex("status_1")`, after typing the index's name. */
export function plan(context: Context, answers: Answers): Outcome {
  const subject = subjectOf(context, answers);
  const name = subject?.args['index'];
  if (subject === undefined || typeof name !== 'string') {
    throw new Error('index.drop needs { connection, database, collection, index }.');
  }
  if (subject.connection.readOnly) {
    return refuse('index.drop/read-only', text.readOnly(subject.connection.name));
  }
  if (subject.view) {
    return refuse('index.drop/view', text.viewReadOnly);
  }
  if (name === idIndex) {
    return refuse('index.drop/id-index', text.idIndex);
  }
  const advice = subject.args['advice'];
  const reason = typeof advice === 'string' && advice !== '' ? `${advice}\n` : '';
  return run({
    title: text.drop.title(name, subject.collection),
    steps: [writeStep(subject, mongoRequest(subject, 'dropIndex', [name]))],
    danger: { kind: 'destructive', text: `${reason}${text.drop.text}`, button: text.drop.button, name },
    undo: { cannot: text.cannotUndo },
    publishes: false,
    after: [
      { kind: 'refresh', connection: subject.connection.id },
      {
        kind: 'notify',
        level: 'success',
        text: text.drop.dropped(name, `${subject.database}.${subject.collection}`),
      },
    ],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('index.drop'), plan };
