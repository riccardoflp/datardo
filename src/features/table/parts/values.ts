/**
 * The values of a document the table reads (`table.rows`, `table.format-table`): the value at a path, and how many
 * elements of an expanded array are shown.
 */
import type { Json } from '../../../shared/engine-request';
import { isSubdocument } from '../../query/mongosh/ejson';

/** How many elements of an array are shown as sub-rows for each document. */
export const mostElements = 20;

/** The value at a path from an object, or `undefined` when a segment is absent or a parent is not a sub-document. */
export function valueAt(object: Json, path: readonly string[]): Json | undefined {
  let current: Json = object;
  for (const segment of path) {
    if (!isSubdocument(current) || !Object.hasOwn(current, segment)) {
      return undefined;
    }
    current = current[segment] as Json;
  }
  return current;
}
