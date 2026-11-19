/**
 * Feature: document.update-many
 *
 * Applies update operators, or an update pipeline, to every document matching the filter of the query bar:
 * `db.orders.updateMany({ status: "new" }, { $set: { status: "archived" } })`. Started with `{ filter }`, the text of
 * **Filter** as written. It counts the matching documents (`query.count`), asks the update in the form **Update many ·
 * orders**, and confirms with the count. With an empty filter whose update will not be recorded in the undo history,
 * the confirmation asks the collection's name (D39).
 *
 * The answer `update` is the text of **Update**; a text the form refuses asks the form again, with the reason.
 */
import type { Json } from '../../shared/engine-request';
import {
  ask,
  refuse,
  run,
  type Answers,
  type Context,
  type Danger,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Question } from '../../shared/question';
import type { Makers } from '../aggregate/mongosh/helpers';
import { valueOf } from '../aggregate/mongosh/parse';
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
import { isDocumentValue, replyCount } from './write/values';

/** The update read from the text of **Update**: operators or a pipeline; or the message the form shows. */
export type ReadUpdate =
  { readonly ok: true; readonly update: Json } | { readonly ok: false; readonly message: string };

function isOperators(value: Json): boolean {
  return (
    isDocumentValue(value) && Object.keys(value).length > 0 && Object.keys(value).every((key) => key.startsWith('$'))
  );
}

/** The update of a text, checked as the form checks it before it goes on. */
export function updateOfText(source: string, makers: Makers): ReadUpdate {
  if (source.trim() === '') {
    return { ok: false, message: text.updateMany.empty };
  }
  const read = valueOf(source, makers);
  if (!read.ok) {
    return { ok: false, message: text.updateMany.problem(read.message) };
  }
  if (Array.isArray(read.value)) {
    const stages = read.value as readonly Json[];
    return stages.length > 0 && stages.every(isOperators)
      ? { ok: true, update: read.value }
      : { ok: false, message: text.updateMany.pipeline };
  }
  return isOperators(read.value) ? { ok: true, update: read.value } : { ok: false, message: text.updateMany.operators };
}

/** What the form and the plan of an update need: the collection, the filter, its count, and the note on undo. */
export interface UpdateInput {
  readonly place: DocumentPlace;
  readonly filter: WrittenFilter;
  readonly count: number;
  readonly note: UndoNote;
  readonly kept: KeptDocuments;
}

/** A text rule that no text keeps: **Continue** stays disabled while nothing matches the filter. */
const nothingMatches = { kind: 'pattern', pattern: '(?!)', message: text.many.match(0) } as const;

/** The form **Update many · orders**: the filter, its count, and **Update**; `problem` says why it is asked again. */
export function updateForm(input: UpdateInput, typed: string, problem?: string): Question {
  const lines = [filterLine(input.filter), text.many.match(input.count), ...(problem === undefined ? [] : [problem])];
  return {
    title: text.updateMany.form(input.place.collection),
    text: lines.join('\n'),
    button: text.updateMany.continue,
    fields: [
      {
        kind: 'text',
        key: 'update',
        label: text.updateMany.field,
        placeholder: text.updateMany.placeholder,
        default: typed,
        rules: input.count === 0 ? [nothingMatches] : [],
      },
    ],
  };
}

/** The danger of the update: the count, or every document of the collection; destructive as D39 says. */
export function updateDanger(input: UpdateInput): Danger {
  if (!input.filter.empty) {
    return { kind: 'confirm', text: text.many.match(input.count), button: text.updateMany.button(input.count) };
  }
  const question = `${text.updateMany.all(input.count, input.place.collection)}\n${text.many.emptyFilterDetail}`;
  return input.note.recorded
    ? { kind: 'confirm', text: question, button: text.updateMany.allButton }
    : { kind: 'destructive', text: question, button: text.updateMany.allButton, name: input.place.collection };
}

/** The form, then the plan of an update of the documents of `filter`, once they are counted. */
export function planUpdate(context: Context, answers: Answers, input: UpdateInput): Outcome {
  const typed = answers['update'];
  if (typeof typed !== 'string') {
    return ask(updateForm(input, ''));
  }
  const read = updateOfText(typed, makersOf(context));
  if (!read.ok) {
    return ask(updateForm(input, typed, read.message));
  }
  if (input.count === 0) {
    return ask(updateForm(input, typed));
  }
  const request = collectionRequest(input.place, 'updateMany', [input.filter.value, read.update], manyWriteTimeLimitMs);
  return run({
    title: cutTitle(text.updateMany.title(oneLine(input.filter.written) || '{}', oneLine(typed))),
    steps: [writeStep(input.place, request)],
    danger: updateDanger(input),
    touches: documentsText(input.count),
    undo: undoOf(input.note, input.kept),
    publishes: true,
    after: [refreshAfter(input.place)],
  });
}

/** The input of an update once the filter is read and counted; `undefined` while the count is not known. */
export function updateInput(
  context: Context,
  answers: Answers,
  place: DocumentPlace,
  filter: WrittenFilter,
): UpdateInput | undefined {
  const count = countOf(answers);
  if (count === undefined) {
    return undefined;
  }
  const kept: KeptDocuments = { kind: 'filter', ...keptCollection(place), filter: filter.value, count };
  return { place, filter, count, kept, note: undoNoteOf(place, context.state.settings, kept) };
}

/** Counts the documents matching the filter of the query bar, asks the update, and updates them. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const refused = refusedWrite(place, 'document.update-many/read-only', 'document.update-many/view');
  if (refused !== undefined) {
    return refused;
  }
  const read = filterOfText(textArg(startArgs(answers), 'filter') ?? '', makersOf(context));
  if (!read.ok) {
    return refuse('document.update-many/invalid-filter', text.many.invalidFilter);
  }
  const input = updateInput(context, answers, place, read.filter);
  return input === undefined ? countNeed(place, read.filter, context.now) : planUpdate(context, answers, input);
}

/** What follows, from the reply of `updateMany`: how many documents matched and how many were modified. */
export function afterReplies(context: Context, answers: Answers, replies: readonly unknown[]): ReplyOutcome {
  const place = requiredPlace(context, answers);
  const [reply] = replies;
  const notice = text.updateMany.updated(
    place.collection,
    replyCount(reply, 'matchedCount'),
    replyCount(reply, 'modifiedCount'),
  );
  return { kind: 'after', after: [{ kind: 'notify', level: 'success', text: notice }, refreshAfter(place)] };
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('document.update-many'), plan };
