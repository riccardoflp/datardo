/**
 * Feature: field.remove-plan
 *
 * The filter and the update of **Remove field…**, for a field and for a field of the elements of an expanded array.
 */
import { and, noArrayParents } from './array-guard';
import type { JsonDocument } from './types';

/** What a removal sends and counts. */
export interface RemovePlan {
  readonly filter: JsonDocument;
  readonly update: JsonDocument;
  /** The documents matching the user's filter that have the field, arrays or not. */
  readonly reached: JsonDocument;
}

/**
 * Feature: field.remove-plan — `$unset` of `field` (`items.sku`); with `array`, the field path of the expanded array
 * whose elements have it (`items`), removed from every element with `items.$[].sku`.
 */
export function removePlan(filter: JsonDocument, field: string, array?: string): RemovePlan {
  const reached = and(filter, { [field]: { $exists: true } });
  if (array === undefined) {
    return { filter: and(reached, ...noArrayParents(field)), update: { $unset: { [field]: '' } }, reached };
  }
  const inside = field.slice(array.length + 1);
  return {
    // `$[]` fails on a document where the array is not one.
    filter: and(reached, ...noArrayParents(array), { [array]: { $type: 'array' } }),
    update: { $unset: { [`${array}.$[].${inside}`]: '' } },
    reached,
  };
}
