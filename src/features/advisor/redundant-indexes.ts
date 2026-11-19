/**
 * Feature: advisor.redundant-indexes
 *
 * The indexes whose every query another index of the same collection can serve, so that they only cost writes and
 * memory. The indexes are examined from the last listed to the first, and the index that replaces one must not
 * itself be redundant: of two indexes on the same keys, the one listed last is the redundant one. Ported from
 * Mongoster's `src/shared/advisor.ts` (`redundantWith`, `analyze`).
 */
import { sameJson } from '../monitor/parts/ejson';
import { startsWith } from './prefix';
import type { AdvisorCollection, AdvisorIndex } from './types';

/** A redundant index and the index that replaces it. */
export interface RedundantIndex {
  readonly index: AdvisorIndex;
  readonly by: AdvisorIndex;
}

/** Whether an index has a job of its own besides serving queries: `_id_`, a unique index, a TTL index (rule 1). */
function hasOwnJob(index: AdvisorIndex): boolean {
  return index.name === '_id_' || index.unique || index.expireAfterSeconds !== undefined;
}

/** Whether `by` serves every query `index` serves (rules 1 to 6). */
export function isRedundantWith(index: AdvisorIndex, by: AdvisorIndex): boolean {
  if (index.name === by.name || hasOwnJob(index)) {
    return false;
  }
  if (index.hidden || by.hidden || index.building || by.building) {
    return false;
  }
  if (!sameJson(index.partialFilterExpression, by.partialFilterExpression)) {
    return false;
  }
  if (by.sparse && !index.sparse) {
    return false;
  }
  return (index.collation ?? '') === (by.collation ?? '') && startsWith(by.key, index.key);
}

/** Feature: advisor.redundant-indexes — the redundant indexes of a collection, the last listed first. */
export function redundantIndexes(collection: Pick<AdvisorCollection, 'indexes'>): readonly RedundantIndex[] {
  const found: RedundantIndex[] = [];
  const redundant = new Set<string>();
  for (const index of [...collection.indexes].reverse()) {
    const by = collection.indexes.find((other) => !redundant.has(other.name) && isRedundantWith(index, other));
    if (by !== undefined) {
      redundant.add(index.name);
      found.push({ index, by });
    }
  }
  return found;
}
