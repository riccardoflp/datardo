/**
 * Feature: table.sort
 *
 * A click on a column header sorts the documents by that field, without typing a sort: ascending, then descending,
 * then no sort. A click always leaves one field.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue } from '../query/format';
import { int32, numberOf } from '../query/mongosh/ejson';
import { objectOfText } from '../query/mongosh/object-text';

/** The direction of a field in a sort. */
export type Direction = 1 | -1;

function directionOf(value: Json | undefined): Direction | undefined {
  const number = value === undefined ? undefined : numberOf(value);
  if (number === undefined) {
    return undefined;
  }
  return number < 0 ? -1 : 1;
}

/** The fields of a sort and their directions, for the `▲` and `▼` of the headers; none for a text that cannot be read. */
export function sortDirections(sortText: string, now = 0): ReadonlyMap<string, Direction> {
  const read = objectOfText(sortText, now);
  const directions = new Map<string, Direction>();
  if (read.ok) {
    for (const [key, value] of Object.entries(read.value)) {
      const direction = directionOf(value);
      if (direction !== undefined) {
        directions.set(key, direction);
      }
    }
  }
  return directions;
}

/**
 * Feature: table.sort
 *
 * The text of **Sort** after a click on the header of `field`: `{ field: 1 }` when the field is not in the sort,
 * `{ field: -1 }` after `1`, an empty sort after `-1`. A text that cannot be read counts as an empty sort.
 */
export function sortAfterClick(sortText: string, field: string): string {
  const direction = sortDirections(sortText).get(field);
  if (direction === -1) {
    return '';
  }
  return formattedValue(Object.fromEntries([[field, int32(direction === 1 ? -1 : 1)]]));
}
