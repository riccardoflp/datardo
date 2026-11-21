/**
 * Feature: compare.copy-document
 *
 * On a row of the list, makes the two sides agree on one `_id`: the document is inserted or replaced on the other
 * side, whole as it is on its side (its BSON types, its field order, ignored fields included), or deleted from the
 * side where the other side lacks it. The source document is read by `_id` before the confirmation, so that the plan
 * shown is the plan run (Q36). Nothing is published for redis-oplog.
 *
 * Started with `{ left, right, to, difference, comparing }`: the two sides, the side written (`to`), the row's
 * difference `{ id, kind }` as the page's last comparison has it (absent when it no longer has it, as after **⇄**),
 * and whether a comparison runs.
 */
import type { Json } from '../../shared/engine-request';
import {
  needRead,
  refuse,
  run,
  type Answers,
  type Context,
  type EngineStep,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { undoNoteOf, undoOf } from '../document/write/undo-note';
import { documentsArgs } from './read-details';
import { documentsText, text } from './text';
import { onlyOn, otherSide, readDifference, sideText, type Difference, type Side } from './types';
import {
  copySteps,
  deleteSteps,
  documentsInOrder,
  keptOf,
  plannedAfter,
  refusedTarget,
  targetPlace,
  writeSides,
  writeStart,
  type WriteStart,
} from './writes/steps';

/** What making the side written agree on one `_id` takes. */
export type CopyAction = 'insert' | 'replace' | 'delete';

/** The action for a difference when `to` is written; `undefined` when the difference is not one. */
export function copyAction(difference: Difference, to: Side): CopyAction | undefined {
  if (difference.kind === 'different') {
    return 'replace';
  }
  return difference.kind === onlyOn(otherSide(to)) ? 'insert' : 'delete';
}

/** The step of the action, once the source document is read; or the read it needs, or the refusal when it is gone. */
function stepsOf(start: WriteStart, action: CopyAction, id: Json, answers: Answers): readonly EngineStep[] | Outcome {
  const target = start.to === 'left' ? start.left : start.right;
  if (action === 'delete') {
    return deleteSteps(target, [id]);
  }
  if (!('source' in answers)) {
    return needRead(
      'source',
      'compare.read-details',
      documentsArgs(start.left, start.right, otherSide(start.to), [id]),
    );
  }
  const documents = documentsInOrder(answers['source'], [id]);
  return documents.length === 0
    ? refuse('compare.copy-document/stale', text.refusals.stale)
    : copySteps(target, documents);
}

/** Feature: compare.copy-document — the guard, the read of the source document, then the plan of one step. */
export function plan(context: Context, answers: Answers): Outcome {
  const start = writeStart(context, answers);
  const { target, source } = writeSides(context, start);
  const refused = refusedTarget(target, 'compare.copy-document/read-only', 'compare.copy-document/view');
  if (refused !== undefined) {
    return refused;
  }
  if (start.comparing) {
    return refuse('compare.copy-document/comparing', text.refusals.comparing);
  }
  const difference = readDifference(start.args['difference']);
  const action = difference === undefined ? undefined : copyAction(difference, start.to);
  if (difference === undefined || action === undefined) {
    return refuse('compare.copy-document/stale', text.refusals.stale);
  }
  const steps = stepsOf(start, action, difference.id, answers);
  if ('kind' in steps) {
    return steps;
  }
  const kept = keptOf(target, [difference.id]);
  const question = text.writes.oneQuestion(start.to, action, 1, sideText(target));
  return run({
    title: text.writes.title(sideText(source)),
    steps,
    danger: { kind: 'confirm', text: `${question}\n${text.writes.asWritten}`, button: text.writes.apply },
    touches: documentsText(1),
    undo: undoOf(undoNoteOf(targetPlace(context, target), context.state.settings, kept), kept),
    publishes: false,
    after: plannedAfter(target, action === 'delete' ? 0 : 1, action === 'delete' ? 1 : 0),
  });
}

export { afterReplies } from './writes/steps';

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('compare.copy-document'), plan };
