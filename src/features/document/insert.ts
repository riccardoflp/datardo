/**
 * Feature: document.insert
 *
 * Inserts the documents typed or pasted in the insert dialog **Insert into people**:
 * `db.people.insertOne({ name: "Ada" })` for one, `db.people.insertMany([ { … }, { … } ])` (ordered) for several. A
 * document without `_id` gets a new `ObjectId` from the driver, which the reply gives back. The text is read by
 * `document.parse-insert-text`; one that does not parse is not a refusal: the dialog is asked again with the message.
 *
 * Started with `{ text }`, the text the dialog opens with (the text left in it, or the copy of `document.duplicate`).
 * The answer `documents` is the text of the dialog when **Insert** is pressed.
 */
import type { Json } from '../../shared/engine-request';
import { ask, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Question } from '../../shared/question';
import { makersOf } from '../aggregate/types';
import { documentsOfText } from './parse-insert-text';
import { documentsText, text } from './text';
import {
  isRecord,
  keptCollection,
  refreshAfter,
  requiredPlace,
  startArgs,
  textArg,
  type DocumentPlace,
  type JsonRecord,
  type KeptDocuments,
  type ReplyOutcome,
} from './types';
import { refusedWrite } from './write/guard';
import { collectionRequest, manyWriteTimeLimitMs, oneWriteTimeLimitMs, writeStep } from './write/steps';
import { undoNoteOf, undoOf } from './write/undo-note';
import { oneLineText, replyCount } from './write/values';

/** The insert dialog: its editor with the text, and the hint, or the reader's message when it is asked again. */
export function insertDialog(place: DocumentPlace, typed: string, problem?: string): Question {
  return {
    title: text.insert.title(place.collection),
    text: problem ?? text.insert.hint,
    button: text.insert.button(1),
    fields: [{ kind: 'text', key: 'documents', label: text.insert.title(place.collection), default: typed }],
  };
}

/** What the undo history keeps of an insert: the `_id`s the documents carry, the others coming from the replies. */
export function insertedKept(place: DocumentPlace, documents: readonly JsonRecord[]): KeptDocuments {
  const ids = documents.flatMap((document) => (document['_id'] === undefined ? [] : [document['_id']]));
  return { kind: 'inserted', ...keptCollection(place), ids, count: documents.length };
}

/** The plan that inserts the documents of the dialog. */
export function insertPlan(context: Context, place: DocumentPlace, documents: readonly JsonRecord[]): Outcome {
  const kept = insertedKept(place, documents);
  const [only] = documents;
  const request =
    documents.length === 1 && only !== undefined
      ? collectionRequest(place, 'insertOne', [only], oneWriteTimeLimitMs)
      : collectionRequest(place, 'insertMany', [documents], manyWriteTimeLimitMs);
  return run({
    title: documents.length === 1 ? text.insert.planOne : text.insert.planMany(documents.length),
    steps: [writeStep(place, request)],
    danger: { kind: 'none' },
    touches: documentsText(documents.length),
    undo: undoOf(undoNoteOf(place, context.state.settings, kept), kept),
    publishes: true,
    after: [refreshAfter(place)],
  });
}

/** Opens the insert dialog, then inserts what it holds. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const refused = refusedWrite(place, 'document.insert/read-only', 'document.insert/view');
  if (refused !== undefined) {
    return refused;
  }
  const typed = answers['documents'];
  if (typeof typed !== 'string') {
    return ask(insertDialog(place, textArg(startArgs(answers), 'text') ?? ''));
  }
  const read = documentsOfText(typed, makersOf(context));
  return read.ok ? insertPlan(context, place, read.documents) : ask(insertDialog(place, typed, read.message));
}

/** The `_id` of the document inserted by `insertOne`, from its reply. */
export function insertedId(reply: unknown): Json | undefined {
  return isRecord(reply) ? reply['insertedId'] : undefined;
}

/** What follows, from the reply of `insertOne` or `insertMany`: the notification with the `_id` or the count. */
export function afterReplies(context: Context, answers: Answers, replies: readonly unknown[]): ReplyOutcome {
  const place = requiredPlace(context, answers);
  const [reply] = replies;
  const id = insertedId(reply);
  const notice =
    id === undefined
      ? text.insert.insertedMany(replyCount(reply, 'insertedCount'), place.collection)
      : text.insert.insertedOne(oneLineText(id), place.collection);
  return { kind: 'after', after: [{ kind: 'notify', level: 'success', text: notice }, refreshAfter(place)] };
}

/** Whether a server's error is a duplicate `_id`: E11000 on the index `_id_`. */
export function isDuplicateId(error: string): boolean {
  return /E11000 duplicate key error/u.test(error) && /index: _id_ /u.test(`${error} `);
}

/**
 * What the dialog says when the insert failed after `inserted` of `count` documents: the server's error, with *. Remove
 * _id to insert a copy with a new one.* for a duplicate `_id`, after *Inserted 1 of 3 documents, then:* when some were
 * inserted before it.
 */
export function insertFailureText(count: number, inserted: number, error: string): string {
  const message = isDuplicateId(error) ? `${error}${text.insert.duplicateId}` : error;
  return inserted === 0 ? message : text.insert.insertedThen(inserted, count, message);
}

/** The notification of an insert that stopped after `inserted` of `count` documents; none when nothing was inserted. */
export function insertFailureNotice(place: DocumentPlace, count: number, inserted: number): string | undefined {
  return inserted === 0 ? undefined : text.insert.insertedSome(inserted, count, place.collection);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('document.insert'), plan };
