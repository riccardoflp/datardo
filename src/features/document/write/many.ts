/**
 * What **Update many** and **Delete many** share, and the selected rows with them: the filter of the query bar read as
 * written, its count (`query.count`), the line the form and the confirmation show for it, and whether it is empty
 * (D39: `{}` once parsed, blank text included).
 */
import type { Json } from '../../../shared/engine-request';
import { needRead, type Answers, type Outcome } from '../../../shared/feature';
import type { Makers } from '../../aggregate/mongosh/helpers';
import { valueOf } from '../../aggregate/mongosh/parse';
import { text } from '../text';
import { isRecord, type DocumentPlace, type JsonRecord } from '../types';
import { isDocumentValue, numberOf } from './values';

/** The longest title of an operation in the undo history, in characters (the cards' 300). */
export const longestTitle = 300;

/** A filter read from the query bar: the text as written, its value, and whether it is empty. */
export interface WrittenFilter {
  readonly written: string;
  readonly value: JsonRecord;
  readonly empty: boolean;
}

/** The filter of a text, blank text being the empty filter; the reader's message when it is not a document. */
export function filterOfText(
  source: string,
  makers: Makers,
): { readonly ok: true; readonly filter: WrittenFilter } | { readonly ok: false; readonly message: string } {
  if (source.trim() === '') {
    return { ok: true, filter: { written: source, value: {}, empty: true } };
  }
  const read = valueOf(source, makers);
  if (!read.ok) {
    return { ok: false, message: read.message };
  }
  if (!isDocumentValue(read.value)) {
    return { ok: false, message: text.refusals.notADocument };
  }
  return { ok: true, filter: { written: source, value: read.value, empty: Object.keys(read.value).length === 0 } };
}

/** The line of the filter in the form and the confirmation: as written, or the line that says there is none. */
export function filterLine(filter: WrittenFilter): string {
  return filter.empty ? text.many.noFilter : filter.written.trim();
}

/** A text on one line, its runs of spaces and line breaks made one space: as the undo history shows a filter. */
export function oneLine(source: string): string {
  return source.replace(/\s+/gu, ' ').trim();
}

/** A title cut at 300 characters, with `…` when it was longer. */
export function cutTitle(title: string): string {
  const characters = Array.from(title);
  return characters.length <= longestTitle ? title : `${characters.slice(0, longestTitle - 1).join('')}…`;
}

/** The read of how many documents match a filter, exactly (`query.count`), under the key `count`. */
export function countNeed(place: DocumentPlace, filter: WrittenFilter, now: number): Outcome {
  const args: Json = {
    connection: place.connection,
    database: place.database,
    collection: place.collection,
    filter: filter.written,
    at: now,
    kind: place.view ? 'view' : 'collection',
    exact: true,
  };
  return needRead('count', 'query.count', args);
}

/** The count `query.count` answered, a number or `{ count }`; `undefined` while it was not read. */
export function countOf(answers: Answers): number | undefined {
  const count = answers['count'];
  if (typeof count === 'number') {
    return count;
  }
  return isRecord(count) ? numberOf(count['count']) : undefined;
}
