/**
 * Feature: table.copy-text
 *
 * Writes documents in each of the formats `table.copy-as` offers: mongosh, Extended JSON, JSON Lines, JSON, YAML, an
 * insert command, CSV. Every type is kept in the formats that go back into a collection.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue } from '../query/format';
import { csvTable, csvText } from './copy/csv';
import { copiedExtendedJson, plainValue } from './copy/plain';
import { yamlOf } from './copy/yaml';
import type { ColumnNode, Document } from './types';

/** The formats a copy offers, by the variant of their command. */
export const copyFormats = ['mongosh', 'extended-json', 'json-lines', 'json', 'yaml', 'insert-command', 'csv'] as const;

/** A format of a copy. */
export type CopyFormat = (typeof copyFormats)[number];

/** The formats of one document, in the order of the menu. */
export const oneDocumentFormats: readonly CopyFormat[] = ['mongosh', 'extended-json', 'json', 'yaml', 'insert-command'];

/** The formats of several documents, in the order of the menu. */
export const severalDocumentsFormats: readonly CopyFormat[] = [
  'mongosh',
  'extended-json',
  'json-lines',
  'json',
  'yaml',
  'insert-command',
  'csv',
];

function insertText(collection: string, documents: readonly Document[]): string {
  const [only] = documents;
  const name = JSON.stringify(collection);
  return documents.length === 1 && only !== undefined
    ? `db.getCollection(${name}).insertOne(${formattedValue(only, 'indented')});`
    : `db.getCollection(${name}).insertMany(${formattedValue(documents, 'indented')});`;
}

/**
 * Feature: table.copy-text
 *
 * The text of documents in a format: one document as itself, several as the form for several (an array, a list, one
 * line each). `collection` names the collection of the insert commands; `columns`, the columns drawn, make the CSV.
 */
export function copyText(
  documents: readonly Document[],
  format: CopyFormat,
  collection: string,
  columns: readonly ColumnNode[] = [],
): string {
  const [only] = documents;
  const value: Json = documents.length === 1 && only !== undefined ? only : documents;
  switch (format) {
    case 'mongosh':
      return formattedValue(value, 'indented');
    case 'extended-json':
      return JSON.stringify(copiedExtendedJson(value), null, 2);
    case 'json-lines':
      return documents.map((document) => `${JSON.stringify(copiedExtendedJson(document))}\n`).join('');
    case 'json':
      return JSON.stringify(plainValue(value), null, 2);
    case 'yaml':
      return documents.length === 0 ? '[]\n' : yamlOf(plainValue(value, true));
    case 'insert-command':
      return insertText(collection, documents);
    case 'csv':
      return csvText(csvTable(documents, columns));
  }
}
