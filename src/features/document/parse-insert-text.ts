/**
 * Feature: document.parse-insert-text
 *
 * Turns the text of the insert dialog into the documents to insert, each value with its type: one document, an array of
 * them, one document per line as mongoexport writes them, or a pasted `db.<collection>.insertOne(…)`, `insertMany(…)`
 * or `insert(…)`. The text is read by the mongosh reader of `query.parse` (for now the one of the pipeline editor), and
 * never run.
 */
import type { Json } from '../../shared/engine-request';
import { noMakers, type Makers } from '../aggregate/mongosh/helpers';
import { valueOf } from '../aggregate/mongosh/parse';
import { text } from './text';
import type { JsonRecord } from './types';
import { isDocumentValue } from './write/values';

/** The documents of the text, in order, or the message the dialog shows. */
export type InsertDocuments =
  { readonly ok: true; readonly documents: readonly JsonRecord[] } | { readonly ok: false; readonly message: string };

/** A whole pasted insert call, with the collection by name, by `getCollection("…")` or by `db["…"]`. */
const insertCall =
  /^db\s*(?:\.\s*[A-Za-z_$][\w$]*|\.\s*getCollection\(\s*(["'])(?:(?!\1).)*\1\s*\)|\[\s*(["'])(?:(?!\2).)*\2\s*\])\s*\.\s*insert(?:One|Many)?\s*\(([\s\S]*)\)\s*;?$/u;

/** A line of mongoexport's JSON Lines: one document, with an optional final comma. */
const documentLine = /^\s*\{.*\}\s*,?\s*$/u;

/** The index after the bracket that closes the one the text starts with; 0 when it starts with none. */
function matchingClose(source: string): number {
  if (!source.startsWith('{') && !source.startsWith('[')) {
    return 0;
  }
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? '';
    if (character === '"' || character === "'") {
      index = stringEnd(source, index);
    } else if ('{[('.includes(character)) {
      depth += 1;
    } else if ('}])'.includes(character)) {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return 0;
}

/** The index of the quote that closes the string opened at `start`. */
function stringEnd(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length && source[index] !== quote) {
    index += source[index] === '\\' ? 2 : 1;
  }
  return index;
}

/** The first argument of a whole pasted insert call, without the options after it; the text itself otherwise. */
function unwrappedInsertCall(source: string): string {
  const match = insertCall.exec(source);
  if (match === null) {
    return source;
  }
  const args = (match[3] ?? '').trim();
  const end = matchingClose(args);
  return end > 0 ? args.slice(0, end) : args;
}

/** The value of the text, or of each of its lines when it is mongoexport's JSON Lines. */
function valueOfText(source: string, makers: Makers): { ok: true; value: Json } | { ok: false; message: string } {
  const read = valueOf(source, makers);
  if (read.ok) {
    return read;
  }
  const lines = source.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2 || !lines.every((line) => documentLine.test(line))) {
    return { ok: false, message: read.message };
  }
  const values: Json[] = [];
  for (const line of lines) {
    const each = valueOf(line.replace(/,\s*$/u, ''), makers);
    if (!each.ok) {
      return { ok: false, message: each.message };
    }
    values.push(each.value);
  }
  return { ok: true, value: values };
}

/**
 * Feature: document.parse-insert-text
 *
 * The documents of the insert dialog's text, or the message it shows instead. `makers` gives the time of the insert to
 * `ISODate()` and new ids to `ObjectId()`; without them those two are not read.
 */
export function documentsOfText(source: string, makers: Makers = noMakers): InsertDocuments {
  const unwrapped = unwrappedInsertCall(source.trim());
  if (unwrapped.trim() === '') {
    return { ok: false, message: text.parse.empty };
  }
  const read = valueOfText(unwrapped, makers);
  if (!read.ok) {
    return read;
  }
  const items: readonly Json[] = Array.isArray(read.value) ? (read.value as readonly Json[]) : [read.value];
  if (items.length === 0) {
    return { ok: false, message: text.parse.emptyArray };
  }
  const wrong = items.findIndex((item) => !isDocumentValue(item));
  if (wrong >= 0) {
    return { ok: false, message: items.length > 1 ? text.parse.item(wrong + 1) : text.parse.notADocument };
  }
  return { ok: true, documents: items as readonly JsonRecord[] };
}
