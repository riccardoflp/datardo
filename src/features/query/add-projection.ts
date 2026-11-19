/**
 * Feature: query.add-projection
 *
 * Includes or excludes one field in the projection, or removes it, and drops the entries MongoDB would not accept
 * beside it.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue } from './format';
import { int32, numberOf } from './mongosh/ejson';
import { objectOfText, withEntry, withoutEntries, type Changed } from './mongosh/object-text';

/** Include, exclude, or remove a field of the projection. */
export type ProjectionChange = 1 | 0 | 'remove';

function excludes(value: Json): boolean {
  return value === false || numberOf(value) === 0;
}

/**
 * Feature: query.add-projection
 *
 * The text of **Project** with the field included or excluded, on one line. Including or excluding a field other
 * than `_id` drops the entries of the other kind (except `_id`) and those on a path above or below it, which MongoDB
 * refuses; removing the last entry gives an empty text. An error when the text is not an object.
 */
export function projectionWithField(written: string, field: string, change: ProjectionChange, now = 0): Changed {
  const read = objectOfText(written, now);
  if (!read.ok) {
    return read;
  }
  let projection = read.value;
  if (change === 'remove') {
    projection = withoutEntries(projection, (key) => key === field);
  } else {
    if (field !== '_id') {
      projection = withoutEntries(
        projection,
        (key, value) =>
          (key !== '_id' && excludes(value) === (change === 1)) ||
          key.startsWith(`${field}.`) ||
          field.startsWith(`${key}.`),
      );
    }
    projection = withEntry(projection, field, int32(change));
  }
  return { ok: true, text: Object.keys(projection).length === 0 ? '' : formattedValue(projection) };
}
