/**
 * Feature: field.array-guard
 *
 * An update by field path cannot go through an array: `$rename` fails on the whole update, `$unset` does nothing,
 * `$set` would write into every element. The column actions leave such documents out, and count them to say so.
 */
import type { JsonDocument } from './types';

/**
 * Feature: field.array-guard — one condition `{ <parent>: { $not: { $type: "array" } } }` for each parent of the field
 * path, from the outermost; none for a top-level field.
 */
export function noArrayParents(path: string): readonly JsonDocument[] {
  const parts = path.split('.');
  return parts.slice(0, -1).map((_part, index) => ({
    [parts.slice(0, index + 1).join('.')]: { $not: { $type: 'array' } },
  }));
}

/** Feature: field.array-guard — the conditions without the empty ones: `{}`, the one left, or `{ $and: [ … ] }`. */
export function and(...parts: readonly JsonDocument[]): JsonDocument {
  const kept = parts.filter((part) => Object.keys(part).length > 0);
  const [first] = kept;
  if (first === undefined) {
    return {};
  }
  return kept.length === 1 ? first : { $and: kept };
}
