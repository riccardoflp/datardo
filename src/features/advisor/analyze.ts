/**
 * Feature: advisor.analyze
 *
 * Puts the three kinds of advice together, in the order the page and the MCP tool give them: the indexes to create,
 * the one whose queries took the most time first; the redundant indexes, the largest first; the unused and the hidden
 * indexes together, the largest first. A redundant index is not also listed as unused or hidden. Ported from
 * Mongoster's `src/shared/advisor.ts › analyze`.
 */
import type { SlowQuery } from '../monitor/types';
import { indexesToCreate } from './indexes-to-create';
import { redundantIndexes } from './redundant-indexes';
import {
  collectionNamespace,
  type Advice,
  type AdvisorCollection,
  type RedundantAdvice,
  type UnusedAdvice,
} from './types';
import { unusedIndexes } from './unused-indexes';

/** The advice for a scope, and how many unused indexes are too recent to tell. */
export interface AdviceResult {
  readonly advices: readonly Advice[];
  readonly tooRecent: number;
}

/** The size of the index of an advice; an index whose size is not known counts as 0 bytes. */
function sizeOf(advice: RedundantAdvice | UnusedAdvice): number {
  return advice.index.size ?? 0;
}

function largestFirst<T extends RedundantAdvice | UnusedAdvice>(advices: readonly T[]): readonly T[] {
  return [...advices].sort((one, other) => sizeOf(other) - sizeOf(one));
}

/** Feature: advisor.analyze — the advices for the collections and the slow operations of a scope, at `now`. */
export function advice(
  collections: readonly AdvisorCollection[],
  operations: readonly SlowQuery[],
  now: number,
): AdviceResult {
  const redundant: RedundantAdvice[] = [];
  const unused: UnusedAdvice[] = [];
  let tooRecent = 0;
  for (const collection of collections) {
    const found = redundantIndexes(collection);
    redundant.push(
      ...found.map((each): RedundantAdvice => ({
        kind: 'redundant',
        id: `redundant:${collectionNamespace(collection)}:${each.index.name}`,
        database: collection.database,
        collection: collection.collection,
        index: each.index,
        by: each.by,
      })),
    );
    const notUsed = unusedIndexes(collection, found, now);
    unused.push(...notUsed.advices);
    tooRecent += notUsed.tooRecent;
  }
  return {
    advices: [...indexesToCreate(collections, operations), ...largestFirst(redundant), ...largestFirst(unused)],
    tooRecent,
  };
}
