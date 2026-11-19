/**
 * Feature: document.inline-edit
 *
 * Changes one value of one document from its cell or from the inspector's tree, in mongosh syntax:
 * `db.orders.updateOne({ _id: ObjectId("…"), qty: 3 }, { $set: { qty: 5 } })`. The filter carries the value just read
 * (`document.read`, the top-level field only), so that the write applies only if it is still there; a field that was
 * missing is `{ qty: { $exists: false } }`. A number typed as digits alone keeps the type the value had
 * (`document.keep-numeric-types`).
 *
 * Started with `{ id, path, value }`: the `_id`, the field path with the positions of arrays (`items.2.qty`), and the
 * value as the table showed it, as canonical Extended JSON; `value` is absent, with `missing: true`, for an empty cell.
 * The answer `value` is the text of the editor; a text that does not parse asks again with the reader's message in
 * place of the hint, and nothing is sent.
 */
import type { Json } from '../../shared/engine-request';
import {
  ask,
  needRead,
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
import { makersOf } from '../aggregate/types';
import { editedValueOf, withKeptTypes } from './keep-numeric-types';
import { readArgs, readDocument, topField } from './read';
import { text } from './text';
import {
  isRecord,
  keptCollection,
  refreshAfter,
  requiredArg,
  requiredPlace,
  startArgs,
  textArg,
  type KeptDocuments,
  type ReplyOutcome,
} from './types';
import { refusedWrite } from './write/guard';
import { collectionRequest, oneWriteTimeLimitMs, writeStep } from './write/steps';
import { undoNoteOf, undoOf, type UndoNote } from './write/undo-note';
import { isSameValue, oneLineText, prettyText, replyCount, valueAtPath } from './write/values';

/** The cell edited: the document's `_id`, the field path, and the value the table showed (`undefined` when missing). */
export interface EditedCell {
  readonly id: Json;
  readonly path: string;
  readonly shown: Json | undefined;
}

/** The cell a feature was started on. */
export function editedCell(context: Context, answers: Answers): EditedCell {
  const args = startArgs(answers);
  const path = textArg(args, 'path');
  if (path === undefined) {
    throw new Error('document.inline-edit is started with the path of a field.');
  }
  const shown = args['missing'] === true ? undefined : args['value'];
  return { id: requiredArg(context, answers, 'id'), path, shown };
}

/** Whether a field path is `_id` or inside it, which cannot be changed. */
export function isIdPath(path: string): boolean {
  return path === '_id' || path.startsWith('_id.');
}

/** The editor over the cell: the value in mongosh syntax, and the hint, or the reader's message when it is asked again. */
export function editorQuestion(cell: EditedCell, note: UndoNote, typed?: string, problem?: string): Question {
  const lines = [problem ?? text.inlineEdit.hint, ...(note.recorded ? [] : [note.line])];
  return {
    title: text.inlineEdit.title(cell.path, oneLineText(cell.id)),
    text: lines.join('\n'),
    button: text.inlineEdit.button,
    fields: [
      {
        kind: 'text',
        key: 'value',
        label: cell.path,
        default: typed ?? (cell.shown === undefined ? '' : prettyText(cell.shown)),
      },
    ],
  };
}

/** The filter that applies the write only while the value is still the one just read. */
export function guardedFilter(cell: EditedCell, stored: Json | undefined): Json {
  if (stored === undefined) {
    return { _id: cell.id, [cell.path]: { $exists: false } };
  }
  const isRegex = isRecord(stored) && '$regularExpression' in stored;
  return { _id: cell.id, [cell.path]: isRegex ? { $eq: stored } : stored };
}

/** Confirm when the value in the database is no longer the one the table showed; none otherwise. */
export function editDanger(cell: EditedCell, stored: Json | undefined): Danger {
  if (isSameValue(stored, cell.shown) || (stored === undefined && cell.shown === undefined)) {
    return { kind: 'none' };
  }
  const question =
    stored === undefined ? text.inlineEdit.removed(cell.path) : text.inlineEdit.changed(cell.path, oneLineText(stored));
  return { kind: 'confirm', text: question, button: text.inlineEdit.overwrite };
}

/** Asks the new value, reads the field as it is now, and writes the value with the filter that guards it. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const refused = refusedWrite(place, 'document.inline-edit/read-only', 'document.inline-edit/view');
  if (refused !== undefined) {
    return refused;
  }
  const cell = editedCell(context, answers);
  if (isIdPath(cell.path)) {
    return refuse('document.inline-edit/id', text.inlineEdit.id);
  }
  const kept: KeptDocuments = { kind: 'ids', ...keptCollection(place), ids: [cell.id], count: 1 };
  const note = undoNoteOf(place, context.state.settings, kept);
  const typed = answers['value'];
  if (typeof typed !== 'string') {
    return ask(editorQuestion(cell, note));
  }
  const edited = editedValueOf(typed, makersOf(context));
  if (!edited.ok) {
    return ask(editorQuestion(cell, note, typed, edited.message));
  }
  if (!('current' in answers)) {
    return needRead('current', 'document.read', readArgs(place, cell.id, topField(cell.path)));
  }
  const current = readDocument(answers, 'current');
  if (current === null) {
    return refuse('document.inline-edit/not-found', text.refusals.notFound);
  }
  const stored = valueAtPath(current, cell.path.split('.'));
  const value = withKeptTypes(edited.edited, stored);
  const request = collectionRequest(
    place,
    'updateOne',
    [guardedFilter(cell, stored), { $set: { [cell.path]: value } }],
    oneWriteTimeLimitMs,
  );
  return run({
    title: text.inlineEdit.title(cell.path, oneLineText(cell.id)),
    steps: [writeStep(place, request)],
    danger: editDanger(cell, stored),
    undo: undoOf(note, kept),
    publishes: true,
    after: [refreshAfter(place)],
  });
}

/** What follows, from the reply of `updateOne`: a refusal when the guarded filter matched nothing. */
export function afterReplies(context: Context, answers: Answers, replies: readonly unknown[]): ReplyOutcome {
  const place = requiredPlace(context, answers);
  const cell = editedCell(context, answers);
  if (replyCount(replies[0], 'matchedCount') === 0) {
    return refuse('document.inline-edit/changed-again', text.inlineEdit.changedAgain(cell.path)) as ReplyOutcome;
  }
  return { kind: 'after', after: [refreshAfter(place)] };
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('document.inline-edit'), plan };
