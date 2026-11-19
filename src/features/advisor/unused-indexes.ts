/**
 * Feature: advisor.unused-indexes
 *
 * The indexes that were not used since their statistics started, when that is at least a day ago, and the hidden
 * ones. Unique and TTL indexes work without being read by queries and are never listed; an index whose uses are not
 * known (no privilege for `$indexStats`) is never listed either. Ported from Mongoster's `src/shared/advisor.ts`
 * (`unusedCandidate`, `observedLongEnough`, `UNUSED_AFTER_MS`).
 */
import { collectionNamespace, type AdvisorCollection, type AdvisorIndex, type UnusedAdvice } from './types';
import type { RedundantIndex } from './redundant-indexes';

/** How long the statistics of an index must cover before it is called unused: 24 hours, in milliseconds. */
export const unusedAfterMs = 24 * 3600 * 1000;

/** The unused and hidden indexes of a collection, and how many unused ones are too recent to tell. */
export interface UnusedIndexes {
  readonly advices: readonly UnusedAdvice[];
  readonly tooRecent: number;
}

function isCandidate(index: AdvisorIndex): boolean {
  return index.uses === 0 && !index.unique && index.expireAfterSeconds === undefined;
}

function adviceOf(kind: UnusedAdvice['kind'], collection: AdvisorCollection, index: AdvisorIndex): UnusedAdvice {
  return {
    kind,
    id: `${kind}:${collectionNamespace(collection)}:${index.name}`,
    database: collection.database,
    collection: collection.collection,
    index,
  };
}

/** Feature: advisor.unused-indexes — the *unused* and *hidden* advices of a collection, in the server's order. */
export function unusedIndexes(
  collection: AdvisorCollection,
  redundant: readonly RedundantIndex[],
  now: number,
): UnusedIndexes {
  const skipped = new Set(redundant.map((each) => each.index.name));
  const advices: UnusedAdvice[] = [];
  let tooRecent = 0;
  for (const index of collection.indexes) {
    if (index.name === '_id_' || skipped.has(index.name) || index.building) {
      continue;
    }
    if (index.hidden) {
      advices.push(adviceOf('hidden', collection, index));
    } else if (isCandidate(index)) {
      const longEnough = index.since !== undefined && now - index.since >= unusedAfterMs;
      if (longEnough) {
        advices.push(adviceOf('unused', collection, index));
      } else {
        tooRecent += 1;
      }
    }
  }
  return { advices, tooRecent };
}
