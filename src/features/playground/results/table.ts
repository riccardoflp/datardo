/**
 * The documents of a result as a table (`playground.results`): the column `#`, then `_id`, then the other fields in
 * the order they are first met in the first 1,000 documents; each cell in mongosh syntax with the BSON type that
 * colors it, cut at 160 characters, with the whole value as its tooltip when it is longer than 40. Ported from
 * Mongoster's `src/webview/playground.ts`.
 */
import type { Json } from '../../../shared/engine-request';
import { bsonType } from '../../aggregate/complete/fields';
import { formattedValue, isTypedValue } from '../../aggregate/mongosh/format';
import { text } from '../text';

/** How many documents the table shows at most, and reads its columns from. */
export const tableDocuments = 1000;

/** A cell is cut at 160 characters with `…`. */
export const longestCell = 160;

/** A value longer than 40 characters has a tooltip with the whole of it, up to 4,000 characters. */
export const tooltipAfter = 40;

/** The longest tooltip. */
export const longestTooltip = 4000;

/** A cell of the table: empty when the document has no such field, not `null`. */
export type ResultCell =
  | { readonly kind: 'empty' }
  | { readonly kind: 'value'; readonly text: string; readonly type: string; readonly tooltip?: string };

/** A row: its number from 1, and a cell per column after `#`. */
export interface ResultRow {
  readonly number: number;
  readonly cells: readonly ResultCell[];
}

/** The documents as a table. */
export interface ResultTable {
  /** `#`, `_id`, then the fields in the order they are first met. */
  readonly columns: readonly string[];
  readonly rows: readonly ResultRow[];
  /** *Showing 1000 of 1500 documents.* when there are more. */
  readonly note?: string;
}

type JsonObject = { readonly [key: string]: Json };

/** Whether a value is a document: an object that is not a value of a BSON type. */
export function isDocument(value: Json): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !isTypedValue(value);
}

/** Whether a value is documents: an array in which every element is a document. */
export function isDocuments(value: Json): value is readonly JsonObject[] {
  return Array.isArray(value) && (value as readonly Json[]).every(isDocument);
}

function cut(whole: string, most: number): string {
  const characters = Array.from(whole);
  return characters.length <= most ? whole : `${characters.slice(0, most).join('')}…`;
}

/** A cell: the value on one line in mongosh syntax, with its type. */
export function resultCell(value: Json | undefined): ResultCell {
  if (value === undefined) {
    return { kind: 'empty' };
  }
  const whole = formattedValue(value, { kind: 'one-line' });
  const tooltip = Array.from(whole).length > tooltipAfter ? { tooltip: cut(whole, longestTooltip) } : {};
  return { kind: 'value', text: cut(whole, longestCell), type: bsonType(value), ...tooltip };
}

function fieldsOf(documents: readonly JsonObject[]): readonly string[] {
  const seen = new Set<string>(['_id']);
  const fields: string[] = [];
  for (const document of documents) {
    for (const key of Object.keys(document)) {
      if (!seen.has(key)) {
        seen.add(key);
        fields.push(key);
      }
    }
  }
  const withId = documents.some((document) => '_id' in document) ? ['_id'] : [];
  return [...withId, ...fields];
}

/** The table of documents. */
export function resultTable(documents: readonly Json[]): ResultTable {
  const shown = documents.slice(0, tableDocuments).filter(isDocument);
  const fields = fieldsOf(shown);
  const rows = shown.map((document, index) => ({
    number: index + 1,
    cells: fields.map((field) => resultCell(document[field])),
  }));
  const note =
    documents.length > tableDocuments ? { note: text.results.showing(tableDocuments, documents.length) } : {};
  return { columns: ['#', ...fields], rows, ...note };
}
