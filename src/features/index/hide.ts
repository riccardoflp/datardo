/**
 * Feature: index.hide
 *
 * Hides an index from the query planner without dropping it, to find out whether it is still needed, or lets queries
 * use it again. Started with `{ connection, database, collection, index, hidden }`; `advice` (the reason of an advice
 * of the Index advisor) when started from one, which adds a notification.
 */
import {
  noDanger,
  refuse,
  run,
  type After,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { text } from './text';
import { mongoRequest, subjectOf, writeStep, type IndexSubject } from './types';

/** The name of the `_id` index, which has no actions. */
export const idIndex = '_id_';

/** `db.runCommand({ collMod: "orders", index: { name: "status_1", hidden: true } })`. */
export function hideStep(subject: IndexSubject, name: string, hidden: boolean): ReturnType<typeof writeStep> {
  const command = { collMod: subject.collection, index: { name, hidden } };
  return writeStep(subject, mongoRequest(subject, 'runCommand', [command], 'database'));
}

function adviceNotice(subject: IndexSubject, name: string, hidden: boolean): After {
  const namespace = `${subject.database}.${subject.collection}`;
  return {
    kind: 'notify',
    level: 'success',
    text: hidden ? text.hide.hiddenFromAdvice(name, namespace) : text.hide.usedAgain(name, namespace),
  };
}

/** Feature: index.hide — `collMod` with `hidden: true` or `false`, with no confirmation. */
export function plan(context: Context, answers: Answers): Outcome {
  const subject = subjectOf(context, answers);
  const name = subject?.args['index'];
  if (subject === undefined || typeof name !== 'string') {
    throw new Error('index.hide needs { connection, database, collection, index }.');
  }
  if (subject.connection.readOnly) {
    return refuse('index.hide/read-only', text.readOnly(subject.connection.name));
  }
  if (subject.view) {
    return refuse('index.hide/view', text.viewReadOnly);
  }
  if (name === idIndex) {
    return refuse('index.hide/id-index', text.idIndex);
  }
  const hidden = subject.args['hidden'] !== false;
  const advice = typeof subject.args['advice'] === 'string';
  return run({
    title: text.hide.plan(name, hidden),
    steps: [hideStep(subject, name, hidden)],
    danger: noDanger,
    undo: { cannot: text.cannotUndo },
    publishes: false,
    after: [
      { kind: 'refresh', connection: subject.connection.id },
      ...(advice ? [adviceNotice(subject, name, hidden)] : []),
    ],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('index.hide'), plan };
