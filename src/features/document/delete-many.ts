/**
 * Feature: document.delete-many
 *
 * Deletes every document matching the filter of the query bar: `db.orders.deleteMany({ status: "draft" })`. Started
 * with `{ filter }`, the text of **Filter** as written. It counts the matching documents (`query.count`) and confirms
 * with the count; with an empty filter whose delete will not be recorded in the undo history, the confirmation asks
 * the collection's name (D39).
 */
import {
  refuse,
  run,
  type Answers,
  type Context,
  type Danger,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { makersOf } from '../aggregate/types';
import { documentsText, text } from './text';
import {
  keptCollection,
  refreshAfter,
  requiredPlace,
  startArgs,
  textArg,
  type DocumentPlace,
  type KeptDocuments,
  type ReplyOutcome,
} from './types';
import { refusedWrite } from './write/guard';
import { countNeed, countOf, cutTitle, filterLine, filterOfText, oneLine, type WrittenFilter } from './write/many';
import { collectionRequest, manyWriteTimeLimitMs, writeStep } from './write/steps';
import { undoNoteOf, undoOf, type UndoNote } from './write/undo-note';
import { replyCount } from './write/values';

/** The danger of the delete: the form with the count, or every document of the collection; destructive as D39 says. */
export function deleteDanger(place: DocumentPlace, filter: WrittenFilter, count: number, note: UndoNote): Danger {
  if (!filter.empty) {
    const lines = [text.deleteMany.form(place.collection), filterLine(filter), text.many.match(count)];
    return { kind: 'confirm', text: lines.join('\n'), button: text.deleteMany.button(count) };
  }
  const question = `${text.deleteMany.all(count, place.collection)}\n${text.many.emptyFilterDetail}`;
  return note.recorded
    ? { kind: 'confirm', text: question, button: text.deleteMany.allButton }
    : { kind: 'destructive', text: question, button: text.deleteMany.allButton, name: place.collection };
}

/** Counts the documents matching the filter of the query bar and deletes them after the confirmation. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const refused = refusedWrite(place, 'document.delete-many/read-only', 'document.delete-many/view');
  if (refused !== undefined) {
    return refused;
  }
  const read = filterOfText(textArg(startArgs(answers), 'filter') ?? '', makersOf(context));
  if (!read.ok) {
    return refuse('document.delete-many/invalid-filter', text.many.invalidFilter);
  }
  const count = countOf(answers);
  if (count === undefined) {
    return countNeed(place, read.filter, context.now);
  }
  if (count === 0) {
    return refuse('document.delete-many/no-match', text.many.match(0));
  }
  const kept: KeptDocuments = { kind: 'filter', ...keptCollection(place), filter: read.filter.value, count };
  const note = undoNoteOf(place, context.state.settings, kept);
  const request = collectionRequest(place, 'deleteMany', [read.filter.value], manyWriteTimeLimitMs);
  return run({
    title: cutTitle(text.deleteMany.title(oneLine(read.filter.written) || '{}')),
    steps: [writeStep(place, request)],
    danger: deleteDanger(place, read.filter, count, note),
    touches: documentsText(count),
    undo: undoOf(note, kept),
    publishes: true,
    after: [
      { kind: 'notify', level: 'success', text: text.deleteMany.deleted(count, place.collection) },
      refreshAfter(place),
    ],
  });
}

/** What follows, from the reply of `deleteMany`: how many documents were deleted. */
export function afterReplies(context: Context, answers: Answers, replies: readonly unknown[]): ReplyOutcome {
  const place = requiredPlace(context, answers);
  const notice = text.deleteMany.deleted(replyCount(replies[0], 'deletedCount'), place.collection);
  return { kind: 'after', after: [{ kind: 'notify', level: 'success', text: notice }, refreshAfter(place)] };
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('document.delete-many'), plan };
