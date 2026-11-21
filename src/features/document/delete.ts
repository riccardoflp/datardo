/**
 * Feature: document.delete
 *
 * Deletes one document after a confirmation: `db.people.deleteOne({ _id: 7 })`. The document is read first
 * (`document.read`), to know that it is still there; the undo history keeps it by its `_id`. Started with `{ id }`, the
 * `_id` as canonical Extended JSON, on the collection of the row or of the inspector.
 */
import {
  needRead,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { readArgs, readDocument } from './read';
import { documentsText, text } from './text';
import {
  keptCollection,
  refreshAfter,
  requiredArg,
  requiredPlace,
  type KeptDocuments,
  type ReplyOutcome,
} from './types';
import { refusedWrite } from './write/guard';
import { collectionRequest, idFilter, oneWriteTimeLimitMs, writeStep } from './write/steps';
import { undoNoteOf, undoOf } from './write/undo-note';
import { oneLineText, replyCount } from './write/values';

/** Deletes the document after its confirmation. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const refused = refusedWrite(place, 'document.delete/read-only', 'document.delete/view');
  if (refused !== undefined) {
    return refused;
  }
  const id = requiredArg(context, answers, 'id');
  if (!('document' in answers)) {
    return needRead('document', 'document.read', readArgs(place, id));
  }
  if (readDocument(answers, 'document') === null) {
    return refuse('document.delete/not-found', text.refusals.notFoundAlready);
  }
  const kept: KeptDocuments = { kind: 'ids', ...keptCollection(place), ids: [id], count: 1 };
  const shown = oneLineText(id);
  return run({
    title: text.delete.title(shown),
    steps: [writeStep(place, collectionRequest(place, 'deleteOne', [idFilter(id)], oneWriteTimeLimitMs))],
    danger: { kind: 'confirm', text: text.delete.question(shown, place.collection), button: text.delete.button },
    touches: documentsText(1),
    undo: undoOf(undoNoteOf(place, context.state.settings, kept), kept),
    publishes: true,
    after: [
      { kind: 'notify', level: 'success', text: text.delete.deleted(shown, place.collection) },
      refreshAfter(place),
    ],
  });
}

/** What follows the delete, from the reply of `deleteOne`: the notification, or the warning when nothing was gone. */
export function afterReplies(context: Context, answers: Answers, replies: readonly unknown[]): ReplyOutcome {
  const place = requiredPlace(context, answers);
  const shown = oneLineText(requiredArg(context, answers, 'id'));
  const deleted = replyCount(replies[0], 'deletedCount');
  const notice =
    deleted === 0
      ? ({ kind: 'notify', level: 'warning', text: text.refusals.notFoundAlready } as const)
      : ({ kind: 'notify', level: 'success', text: text.delete.deleted(shown, place.collection) } as const);
  return { kind: 'after', after: [notice, refreshAfter(place)] };
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('document.delete'), plan };
