/**
 * Feature: query.add-sort
 *
 * Sets, changes or removes the direction of one field in the sort, keeping the others.
 */
import { formattedValue } from './format';
import { int32 } from './mongosh/ejson';
import { objectOfText, withEntry, withoutEntries, type Changed } from './mongosh/object-text';

/** The direction of a field in the sort, or its removal. */
export type SortChange = 1 | -1 | 'remove';

/**
 * Feature: query.add-sort
 *
 * The text of **Sort** with the field set to the direction, on one line: a field already there keeps its place, a
 * new one goes after the others; removing the last field gives an empty text. An error when the text is not an
 * object.
 */
export function sortWithField(written: string, field: string, direction: SortChange, now = 0): Changed {
  const read = objectOfText(written, now);
  if (!read.ok) {
    return read;
  }
  const sort =
    direction === 'remove'
      ? withoutEntries(read.value, (key) => key === field)
      : withEntry(read.value, field, int32(direction));
  return { ok: true, text: Object.keys(sort).length === 0 ? '' : formattedValue(sort) };
}
