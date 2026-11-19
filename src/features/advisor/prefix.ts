/**
 * Feature: advisor.prefix
 *
 * The one rule behind "already served" and "redundant": an index whose keys begin with other keys can do everything
 * an index on those keys does. The fields must be the same, in the same order, from the first; each with the same
 * direction or the same kind, or, when they are all numbers, all reversed, since an index is read both ways. Ported
 * from Mongoster's `src/shared/advisor.ts › startsWith`.
 */
import type { IndexKey, IndexKeyField } from '../monitor/types';

/** A direction as `1` or `-1` (any negative number is descending), or the kind (`"text"`, `"hashed"`). */
function directionOf(field: IndexKeyField): number | string {
  return typeof field.value === 'number' ? (field.value < 0 ? -1 : 1) : field.value;
}

/** Feature: advisor.prefix — whether the index `key` starts with the keys `prefix`. */
export function startsWith(key: IndexKey, prefix: IndexKey): boolean {
  if (prefix.length === 0 || prefix.length > key.length) {
    return false;
  }
  const pairs = prefix.map((looked, index) => ({ looked, own: key[index] }));
  if (pairs.some(({ looked, own }) => own === undefined || own.field !== looked.field)) {
    return false;
  }
  const same = pairs.every(({ looked, own }) => own !== undefined && directionOf(own) === directionOf(looked));
  if (same) {
    return true;
  }
  return pairs.every(({ looked, own }) => {
    const ownDirection = own === undefined ? undefined : directionOf(own);
    const lookedDirection = directionOf(looked);
    return typeof ownDirection === 'number' && typeof lookedDirection === 'number' && ownDirection === -lookedDirection;
  });
}
