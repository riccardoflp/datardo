/**
 * Feature: document.insert-from-tab
 *
 * Inserts the document written in the document tab of a new document: `db.people.insertOne({ name: "Ada" })`. A
 * document tab inserts one document: an array is refused as *A document must be an object { … }*. The connection is
 * read as it is when the insert is asked (D14).
 *
 * Started on the new document's tab (`args.tab`, or the active tab), whose collection and draft it reads; the window
 * may send `{ connection, database, collection, text }` instead.
 */
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { makersOf } from '../aggregate/types';
import { insertedId, insertedKept } from './insert';
import { editedValueOf } from './keep-numeric-types';
import { text } from './text';
import { refreshAfter, requiredPlace, startArgs, tabOf, textArg, type JsonRecord, type ReplyOutcome } from './types';
import { refusedWrite } from './write/guard';
import { collectionRequest, oneWriteTimeLimitMs, writeStep } from './write/steps';
import { undoNoteOf, undoOf } from './write/undo-note';
import { isDocumentValue, oneLineText } from './write/values';

/** Inserts the document of the tab. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const refused = refusedWrite(place, 'document.insert-from-tab/read-only', 'document.insert-from-tab/view');
  if (refused !== undefined) {
    return refused;
  }
  const source = textArg(startArgs(answers), 'text') ?? tabOf(context, answers)?.draft?.text;
  if (source === undefined) {
    throw new Error('document.insert-from-tab is started on the tab of a new document.');
  }
  const read = editedValueOf(source, makersOf(context));
  if (!read.ok) {
    return refuse('document.insert-from-tab/invalid', text.refusals.invalidDocument(read.message));
  }
  if (!isDocumentValue(read.edited.value)) {
    return refuse('document.insert-from-tab/not-a-document', text.refusals.notADocument);
  }
  const document: JsonRecord = read.edited.value;
  const kept = insertedKept(place, [document]);
  return run({
    title: text.insert.planOne,
    steps: [writeStep(place, collectionRequest(place, 'insertOne', [document], oneWriteTimeLimitMs))],
    danger: { kind: 'none' },
    undo: undoOf(undoNoteOf(place, context.state.settings, kept), kept),
    publishes: true,
    after: [refreshAfter(place)],
  });
}

/** What follows, from the reply of `insertOne`: *Inserted document ObjectId("…")*. */
export function afterReplies(context: Context, answers: Answers, replies: readonly unknown[]): ReplyOutcome {
  const place = requiredPlace(context, answers);
  const id = insertedId(replies[0]);
  const notice = text.insertFromTab.inserted(id === undefined ? '' : oneLineText(id));
  return { kind: 'after', after: [{ kind: 'notify', level: 'success', text: notice }, refreshAfter(place)] };
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('document.insert-from-tab'), plan };
