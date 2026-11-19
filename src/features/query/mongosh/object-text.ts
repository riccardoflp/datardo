/**
 * The object of a field of the bar, for the features that change one entry of it and write it again
 * (`query.add-condition`, `query.add-sort`, `query.add-projection`).
 */
import type { Json } from '../../../shared/engine-request';
import { parsedValue } from '../parse';
import { text } from '../text';
import { isSubdocument, type JsonObject } from './ejson';

/** A text changed, or why it could not be. */
export type Changed = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: string };

/** The object of a text: empty for an empty text; the error of `query.parse`, or *must be an object*. */
export function objectOfText(
  written: string,
  now: number,
): { readonly ok: true; readonly value: JsonObject } | { readonly ok: false; readonly error: string } {
  if (written.trim() === '') {
    return { ok: true, value: {} };
  }
  const parsed = parsedValue(written, now, () => '000000000000000000000000');
  if (!parsed.ok) {
    return { ok: false, error: parsed.error.message };
  }
  return isSubdocument(parsed.value) ? { ok: true, value: parsed.value } : { ok: false, error: text.parse.notObject };
}

/** The object with one entry set: in its place when the key is there, after the others when not. */
export function withEntry(object: JsonObject, key: string, value: Json): JsonObject {
  const entries = new Map<string, Json>(Object.entries(object));
  entries.set(key, value);
  return Object.fromEntries(entries);
}

/** The object without the entries whose key is refused. */
export function withoutEntries(object: JsonObject, drop: (key: string, value: Json) => boolean): JsonObject {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => !drop(key, value)));
}
