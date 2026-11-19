/**
 * Feature: field.rename-plan
 *
 * The filter and the update of **Rename field…**, and the filters that count what it overwrites and what it leaves
 * out. The documents left out because of arrays are the count of `reached` less the count of `filter`.
 */
import { and, noArrayParents } from './array-guard';
import type { JsonDocument } from './types';

/** What a rename sends and counts. */
export interface RenamePlan {
  /** The documents renamed: `reached` and the array guard of both names. */
  readonly filter: JsonDocument;
  readonly update: JsonDocument;
  /** The documents matching the user's filter that have the field, arrays or not. */
  readonly reached: JsonDocument;
  /** The documents of `filter` whose value at the new name is replaced. */
  readonly overwrites: JsonDocument;
}

/** Feature: field.rename-plan — `$rename` of `from` to `to` in the documents of `filter` that have it. */
export function renamePlan(filter: JsonDocument, from: string, to: string): RenamePlan {
  const reached = and(filter, { [from]: { $exists: true } });
  const renamed = and(reached, ...noArrayParents(from), ...noArrayParents(to));
  return {
    filter: renamed,
    update: { $rename: { [from]: to } },
    reached,
    overwrites: and(renamed, { [to]: { $exists: true } }),
  };
}
