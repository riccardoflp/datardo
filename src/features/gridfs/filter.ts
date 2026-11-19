/**
 * Feature: gridfs.filter
 *
 * What the text of the filter of a bucket's page means, on the text without the spaces around it: empty is `{}`;
 * starting with `{` it is a MongoDB filter on the files documents in mongosh syntax (`query.parse`), and a text that
 * cannot be read is an error that starts with `Filter:`; anything else finds the files whose name contains it,
 * whatever the case, the text being taken as it is and not as a regular expression. Ported from Mongoster's
 * `filesFilter`.
 */
import type { Json } from '../../shared/engine-request';
import { idOfTime, parsedValue } from '../query/parse';
import { text } from './text';

/** The filter of a text, or the message that takes the place of the table. */
export type FilesFilter =
  { readonly ok: true; readonly filter: Json } | { readonly ok: false; readonly message: string };

/** The text with a `\` before each of `. * + ? ^ $ { } ( ) | [ ] \`, so that a regular expression finds it as it is. */
export function escapedForRegex(typed: string): string {
  return typed.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** Feature: gridfs.filter — the filter of the files a text means, read at `now` (`ISODate()` in it). */
export function filesFilter(typed: string, now: number): FilesFilter {
  const trimmed = typed.trim();
  if (trimmed === '') {
    return { ok: true, filter: {} };
  }
  if (trimmed.startsWith('{')) {
    const parsed = parsedValue(trimmed, now, () => idOfTime(now));
    return parsed.ok
      ? { ok: true, filter: parsed.value }
      : { ok: false, message: text.filterError(parsed.error.message) };
  }
  return { ok: true, filter: { filename: { $regex: escapedForRegex(trimmed), $options: 'i' } } };
}
