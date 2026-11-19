/**
 * Feature: document.duplicate
 *
 * Opens the insert dialog with a copy of a document without its `_id`, to insert it as a new one. The document is read
 * in full and with its types (`document.read`), so the copy does not depend on the projection of the query; it is
 * written in mongosh syntax indented by two spaces, where a number whose type a plain number would lose keeps it
 * (`NumberLong(7)`, `Double(5)`). It writes nothing by itself: **Insert** in the dialog does (`document.insert`).
 *
 * Started with `{ id }`, the `_id` as canonical Extended JSON.
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
import { text } from './text';
import { collectionTarget, requiredArg, requiredPlace, type JsonRecord } from './types';
import { refusedWrite } from './write/guard';
import { documentText, withoutId } from './write/values';

/** The text the insert dialog opens with: the document without `_id`, in mongosh syntax. */
export function duplicateText(document: JsonRecord): string {
  return documentText(withoutId(document));
}

/** Reads the document, then opens the insert dialog with its copy. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const refused = refusedWrite(place, 'document.duplicate/read-only', 'document.duplicate/view');
  if (refused !== undefined) {
    return refused;
  }
  const id = requiredArg(context, answers, 'id');
  if (!('document' in answers)) {
    return needRead('document', 'document.read', readArgs(place, id));
  }
  const document = readDocument(answers, 'document');
  if (document === null) {
    return refuse('document.duplicate/not-found', text.refusals.notFound);
  }
  const args = {
    connection: place.connection,
    database: place.database,
    collection: place.collection,
    text: duplicateText(document),
  };
  return run({
    title: text.duplicate.title,
    steps: [],
    danger: { kind: 'none' },
    undo: { cannot: text.undo.nothingWritten },
    publishes: false,
    after: [{ kind: 'start', feature: featureId('document.insert'), target: collectionTarget(place), args }],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('document.duplicate'), plan };
