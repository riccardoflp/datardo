/**
 * Feature: aggregate.autocomplete
 *
 * What is suggested while typing the body of a stage, or the pipeline as text: stages, operators, fields and values
 * that fit where the cursor is. The fields are those of a sample of 500 documents of the collection for the first
 * stage; for a later stage, those of the documents in the table when it shows the output of the stage just before it
 * and that output is not empty. Nothing is evaluated (D10): the text is only scanned up to the cursor.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import { child, stagePlace, type Place } from './complete/contexts';
import { fieldsOfDocuments, type FieldHint, type SearchIndexHint } from './complete/fields';
import { keyItems, ranked, valueItems, type ItemSource, type Suggestion } from './complete/items';
import { scan, wordCharacter } from './complete/scan';
import { upToIndex, type PipelineEditor, type PipelinePlace } from './types';

export type { FieldHint, SearchIndexHint } from './complete/fields';
export type { Suggestion } from './complete/items';
export { fieldsOfDocuments } from './complete/fields';

/** The suggestions at the cursor: what they replace (`from` to `to`), what was typed, and the list, best first. */
export interface Suggestions {
  readonly from: number;
  readonly to: number;
  /** What was typed so far, without the opening quote. */
  readonly prefix: string;
  readonly position: 'key' | 'value';
  readonly items: readonly Suggestion[];
}

/** What the suggestions know of the collection: the fields to suggest, and its search indexes. */
export interface Known {
  readonly fields: readonly FieldHint[];
  readonly searchIndexes: readonly SearchIndexHint[];
}

/** The size of the sample the fields of the collection are read from, and the time it may take. */
export const sampleSize = 500;
/** The time the sample may take, in ms. */
export const sampleTimeLimitMs = 20000;

/** `db.orders.aggregate([ { $sample: { size: 500 } } ], { maxTimeMS: 20000 })`, analyzed with `fieldsOfDocuments`. */
export function fieldSampleRequest(place: Pick<PipelinePlace, 'database' | 'collection'>): MongoRequest {
  const pipeline: Json = [{ $sample: { size: { $numberInt: String(sampleSize) } } }];
  return {
    engine: 'mongodb',
    database: place.database,
    collection: place.collection,
    method: 'aggregate',
    arguments: [pipeline, { maxTimeMS: { $numberInt: String(sampleTimeLimitMs) } }],
    limit: sampleSize,
    timeLimitMs: sampleTimeLimitMs,
  };
}

/** What the table shows: the output of the pipeline up to the stage `upTo`, or nothing yet. */
export interface TableOutput {
  readonly upTo: number;
  readonly documents: readonly Json[];
}

/**
 * The fields suggested in the stage `index`: those of the documents in the table when it shows the output of the stage
 * just before and that output is not empty, otherwise those of the collection. In the text (`index` undefined), those
 * of the collection.
 */
export function fieldsForStage(
  index: number | undefined,
  table: TableOutput | undefined,
  collectionFields: readonly FieldHint[],
): readonly FieldHint[] {
  if (index === undefined || index === 0 || table === undefined || table.documents.length === 0) {
    return collectionFields;
  }
  return table.upTo === index - 1 ? fieldsOfDocuments(table.documents) : collectionFields;
}

/** What the table shows of the pipeline of `editor` with `documents`. */
export function tableOutput(editor: PipelineEditor, documents: readonly Json[]): TableOutput {
  return { upTo: upToIndex(editor), documents };
}

function innermost(frames: ReturnType<typeof scan>['frames'], root: Place): Place {
  let place = root;
  for (let index = 1; index < frames.length; index += 1) {
    const parent = frames[index - 1];
    if (parent !== undefined && parent.type !== '(') {
      place = child(place, parent.type === '[' ? null : (frames[index]?.key ?? null));
    }
  }
  return place;
}

function result(
  range: { readonly from: number; readonly to: number; readonly prefix: string },
  position: Suggestions['position'],
  items: readonly Suggestion[],
): Suggestions | undefined {
  return items.length === 0 ? undefined : { ...range, position, items };
}

/**
 * Feature: aggregate.autocomplete. The suggestions at `cursor` in `text`, the body of the stage named `stage` or, with
 * `stage` undefined, the whole pipeline as text; `undefined` where nothing applies (inside a comment, after a value,
 * in `$limit`…), so that no list opens.
 */
export function stageSuggestions(
  text: string,
  cursor: number,
  stage: string | undefined,
  known: Known,
): Suggestions | undefined {
  const scanned = scan(text, cursor);
  const { quote } = scanned;
  if (quote !== undefined && !/^["'`]$/u.test(quote)) {
    return undefined;
  }
  const prefix = text.slice(scanned.tokenStart, cursor);
  if (quote === undefined && prefix !== '' && !wordCharacter.test(prefix.charAt(0))) {
    return undefined;
  }
  let to = cursor;
  while (to < text.length && wordCharacter.test(text.charAt(to))) {
    to += 1;
  }
  to += quote !== undefined && text.charAt(to) === quote ? 1 : 0;
  const range = { from: scanned.tokenStart, to, prefix };
  const source: ItemSource = { fields: known.fields, searchIndexes: known.searchIndexes, quote };
  const root: Place = stage === undefined ? { kind: 'pipeline' } : stagePlace(stage.trim());
  const frame = scanned.frames[scanned.frames.length - 1];
  if (frame === undefined) {
    return scanned.done ? undefined : result(range, 'value', ranked(valueItems(root, source), prefix, undefined));
  }
  const place = innermost(scanned.frames, root);
  if (frame.type === '(') {
    return undefined;
  }
  if (frame.type === '[') {
    return result(range, 'value', ranked(valueItems(child(place, null), source), prefix, undefined));
  }
  if (frame.state === 'key') {
    const colon = /^\s*:/u.test(text.slice(to));
    return result(range, 'key', ranked(keyItems(place, source), prefix, colon));
  }
  if (frame.state === 'value') {
    return result(
      range,
      'value',
      ranked(valueItems(child(place, frame.currentKey ?? null), source), prefix, undefined),
    );
  }
  return undefined;
}
