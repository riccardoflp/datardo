/**
 * Feature: document.delete-selected
 *
 * Deletes the documents of the rows selected in the table after one confirmation:
 * `db.people.deleteMany({ _id: { $in: [1, 2, 3] } })`. Started with `{ ids }`, the `_id` of each selected row as
 * canonical Extended JSON; two sub-rows of one document name it once. A selection of one row is `document.delete`.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { afterReplies as deleteOneAfterReplies, plan as deleteOne } from './delete';
import { documentsText, text } from './text';
import {
  keptCollection,
  refreshAfter,
  requiredArg,
  requiredPlace,
  startArgs,
  type KeptDocuments,
  type ReplyOutcome,
} from './types';
import { refusedWrite } from './write/guard';
import { cutTitle } from './write/many';
import { collectionRequest, distinctIds, idsFilter, manyWriteTimeLimitMs, writeStep } from './write/steps';
import { undoNoteOf, undoOf } from './write/undo-note';
import { oneLineText, replyCount } from './write/values';
import type { Json } from '../../shared/engine-request';

/** The `_id`s of the selected rows, each once. */
export function selectedIds(context: Context, answers: Answers): readonly Json[] {
  const ids = requiredArg(context, answers, 'ids');
  return distinctIds(Array.isArray(ids) ? (ids as readonly Json[]) : []);
}

/** Deletes the selected documents after their confirmation. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const refused = refusedWrite(place, 'document.delete-selected/read-only', 'document.delete-selected/view');
  if (refused !== undefined) {
    return refused;
  }
  const ids = selectedIds(context, answers);
  const [only] = ids;
  if (ids.length === 1 && only !== undefined) {
    return deleteOne(context, { ...answers, args: { ...startArgs(answers), id: only } });
  }
  const kept: KeptDocuments = { kind: 'ids', ...keptCollection(place), ids, count: ids.length };
  const question = text.deleteSelected.question(ids.length, place.collection);
  return run({
    title: cutTitle(text.deleteSelected.title(ids.length, ids.map(oneLineText).join(', '))),
    steps: [writeStep(place, collectionRequest(place, 'deleteMany', [idsFilter(ids)], manyWriteTimeLimitMs))],
    danger: {
      kind: 'confirm',
      text: `${question}\n${text.deleteSelected.selected(ids.length)}`,
      button: text.delete.button,
    },
    touches: documentsText(ids.length),
    undo: undoOf(undoNoteOf(place, context.state.settings, kept), kept),
    publishes: true,
    after: [
      { kind: 'notify', level: 'success', text: text.deleteSelected.deleted(ids.length, place.collection) },
      refreshAfter(place),
    ],
  });
}

/** What follows, from the reply of `deleteMany`: how many were deleted, and that the others were already gone. */
export function afterReplies(context: Context, answers: Answers, replies: readonly unknown[]): ReplyOutcome {
  const place = requiredPlace(context, answers);
  const ids = selectedIds(context, answers);
  const [only] = ids;
  if (ids.length === 1 && only !== undefined) {
    return deleteOneAfterReplies(context, { ...answers, args: { ...startArgs(answers), id: only } }, replies);
  }
  const count = ids.length;
  const deleted = replyCount(replies[0], 'deletedCount');
  const notice =
    deleted === count
      ? text.deleteSelected.deleted(count, place.collection)
      : text.deleteSelected.deletedSome(deleted, count, place.collection);
  return { kind: 'after', after: [{ kind: 'notify', level: 'success', text: notice }, refreshAfter(place)] };
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('document.delete-selected'), plan };
