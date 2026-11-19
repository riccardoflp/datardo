/**
 * Feature: document.save
 *
 * Replaces the document in MongoDB with the text of its document tab: `db.orders.replaceOne({ _id: ObjectId("…") },
 * { … })`. The document is read again first (`document.read`) and compared byte for byte with the one the tab loaded:
 * changed meanwhile asks **Overwrite**, deleted meanwhile asks **Insert again**, which inserts it with the same `_id`.
 * A number typed as digits alone keeps the type it had in the document as it was opened
 * (`document.keep-numeric-types`). The connection is read as it is when the save is asked (D14).
 *
 * Started on a document tab (`args.tab`, or the active tab): its `_id` (`idJson`), and the text and the document as
 * loaded of its draft. The window may send them instead, as `{ id, text, original }`, the document as canonical
 * Extended JSON.
 */
import type { Json } from '../../shared/engine-request';
import {
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
import { makersOf } from '../aggregate/types';
import { editedValueOf, withKeptTypes } from './keep-numeric-types';
import { readArgs, readDocument } from './read';
import { text } from './text';
import {
  keptCollection,
  refreshAfter,
  requiredPlace,
  startArgs,
  tabOf,
  textArg,
  type DocumentPlace,
  type JsonRecord,
  type KeptDocuments,
} from './types';
import { refusedWrite } from './write/guard';
import { collectionRequest, idFilter, oneWriteTimeLimitMs, writeStep } from './write/steps';
import { undoNoteOf, undoOf } from './write/undo-note';
import { isDocumentValue, isSameValue, oneLineText, withoutId } from './write/values';

/** What a save works on: the `_id` of the tab's document, the text of its editor, and the document as loaded. */
export interface SavedTab {
  readonly id: Json;
  readonly text: string;
  readonly original?: Json;
}

function jsonOf(source: string | undefined): Json | undefined {
  if (source === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(source) as Json;
  } catch {
    // A draft whose document as loaded is not JSON is saved without the comparison: it is known as unknown.
    return undefined;
  }
}

/** The document tab a save was started on, from the arguments or the tab and its draft. */
export function savedTab(context: Context, answers: Answers): SavedTab {
  const args = startArgs(answers);
  const tab = tabOf(context, answers);
  const shows = tab?.shows.kind === 'document' ? tab.shows : undefined;
  const id = args['id'] ?? jsonOf(shows?.idJson);
  const source = textArg(args, 'text') ?? tab?.draft?.text;
  if (id === undefined || source === undefined) {
    throw new Error(`${context.feature} is started on a document tab.`);
  }
  const original = args['original'] ?? jsonOf(tab?.draft?.original);
  return original === undefined ? { id, text: source } : { id, text: source, original };
}

/** The document of a text to save, or the refusal of the save. */
export type SavedDocument =
  { readonly ok: true; readonly document: JsonRecord } | { readonly ok: false; readonly refusal: Outcome };

/** The document of the text, with its numbers restored against the document as loaded; or the refusal of the save. */
export function savedDocument(context: Context, saved: SavedTab): SavedDocument {
  const read = editedValueOf(saved.text, makersOf(context));
  if (!read.ok) {
    return { ok: false, refusal: refuse('document.save/invalid', text.refusals.invalidDocument(read.message)) };
  }
  if (!isDocumentValue(read.edited.value)) {
    return { ok: false, refusal: refuse('document.save/not-a-document', text.refusals.notADocument) };
  }
  const document = withKeptTypes(read.edited, saved.original) as JsonRecord;
  if ('_id' in document && !isSameValue(document['_id'], saved.id)) {
    return { ok: false, refusal: refuse('document.save/id', text.save.id) };
  }
  return { ok: true, document };
}

/** Confirm when the document changed in the database after the tab loaded it; none when it is still as loaded. */
export function saveDanger(saved: SavedTab, current: JsonRecord): Danger {
  if (saved.original === undefined || isSameValue(current, saved.original)) {
    return { kind: 'none' };
  }
  return { kind: 'confirm', text: `${text.save.changed}\n${text.save.changedDetail}`, button: text.save.overwrite };
}

function insertAgainPlan(context: Context, place: DocumentPlace, saved: SavedTab, document: JsonRecord): Outcome {
  const kept: KeptDocuments = { kind: 'inserted', ...keptCollection(place), ids: [saved.id], count: 1 };
  const inserted = { _id: saved.id, ...withoutId(document) };
  return run({
    title: text.save.title(oneLineText(saved.id)),
    steps: [writeStep(place, collectionRequest(place, 'insertOne', [inserted], oneWriteTimeLimitMs))],
    danger: { kind: 'confirm', text: text.save.deleted, button: text.save.insertAgain },
    undo: undoOf(undoNoteOf(place, context.state.settings, kept), kept),
    publishes: true,
    after: [refreshAfter(place)],
  });
}

/** Reads the document as it is now, then replaces it with the text of the tab, or inserts it again. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const refused = refusedWrite(place, 'document.save/read-only', 'document.save/view');
  if (refused !== undefined) {
    return refused;
  }
  const saved = savedTab(context, answers);
  const read = savedDocument(context, saved);
  if (!read.ok) {
    return read.refusal;
  }
  const document = read.document;
  if (!('current' in answers)) {
    return needRead('current', 'document.read', readArgs(place, saved.id));
  }
  const current = readDocument(answers, 'current');
  if (current === null) {
    return insertAgainPlan(context, place, saved, document);
  }
  const kept: KeptDocuments = { kind: 'ids', ...keptCollection(place), ids: [saved.id], count: 1 };
  const request = collectionRequest(place, 'replaceOne', [idFilter(saved.id), document], oneWriteTimeLimitMs);
  return run({
    title: text.save.title(oneLineText(saved.id)),
    steps: [writeStep(place, request)],
    danger: saveDanger(saved, current),
    undo: undoOf(undoNoteOf(place, context.state.settings, kept), kept),
    publishes: true,
    after: [refreshAfter(place)],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('document.save'), plan };
