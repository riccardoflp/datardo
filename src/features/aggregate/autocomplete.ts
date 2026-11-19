/**
 * Feature: aggregate.autocomplete
 *
 * What is suggested while typing the body of a stage, or the pipeline as text: stages, operators, fields and values
 * that fit where the cursor is. The list, its keys and what each place suggests are those of the query bar
 * (`query.autocomplete`, `query.suggestions`), read with the kind of the stage or of the whole pipeline. The fields are
 * those of a sample of 500 documents of the collection (`query.field-hints`) for the first stage; for a later stage,
 * those of the documents in the table when it shows the output of the stage just before it and that output is not
 * empty. Nothing is evaluated (D10): the text is only scanned up to the cursor.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import { hintsOfDocuments, sampleRequest, type FieldHint } from '../query/field-hints';
import { suggestions, type SearchIndexHint, type Suggestions, type TextKind } from '../query/suggestions';
import { upToIndex, type PipelineEditor } from './types';

export type { FieldHint } from '../query/field-hints';
export type { SearchIndexHint, Suggestion, Suggestions } from '../query/suggestions';
export { sampleSize, hintsTimeLimitMs as sampleTimeLimitMs } from '../query/field-hints';

/** What the suggestions know of the collection: the fields to suggest, and its search indexes. */
export interface Known {
  readonly fields: readonly FieldHint[];
  readonly searchIndexes: readonly SearchIndexHint[];
}

/** `db.orders.aggregate([ { $sample: { size: 500 } } ], { maxTimeMS: 20000 })`: the sample of `query.field-hints`. */
export function fieldSampleRequest(place: { readonly database: string; readonly collection: string }): MongoRequest {
  return sampleRequest(place.database, place.collection);
}

/** The fields of documents, with their types and shares: those of a sample, or of the output in the table. */
export function fieldsOfDocuments(documents: readonly Json[]): readonly FieldHint[] {
  return hintsOfDocuments(documents);
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

/** The kind of text of the body of a stage named `stage`, or of the whole pipeline when `stage` is undefined. */
export function stageTextKind(stage: string | undefined): TextKind {
  return stage === undefined ? 'pipeline' : { stage: stage.trim() };
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
  const found = suggestions(text, cursor, stageTextKind(stage), known);
  return found === undefined || found.items.length === 0 ? undefined : found;
}
