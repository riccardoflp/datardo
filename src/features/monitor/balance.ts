/**
 * Feature: monitor.balance
 *
 * The word of the **Balance** column: the balancer's own verdict when it could be read (`balancerCollectionStatus`),
 * otherwise an estimate from the data on each shard. Ported from Mongoster's `src/webview/monitor.ts › balanceOf`.
 */
import type { Shard, ShardedCollection } from './parts/sharding-records';
import { text } from './text';

/** The chunk size when it is not known, in megabytes. */
export const defaultChunkSizeMb = 128;

/** The cell of **Balance**: a word, whether it is a warning, and a tooltip; an empty word leaves the cell empty. */
export interface Balance {
  readonly word: string;
  readonly warning: boolean;
  readonly tooltip: string;
}

const words = text.sharding.balance;

const empty: Balance = { word: '', warning: false, tooltip: '' };

/** The data per shard of the shards that are not draining, when known (rule 3). */
function estimate(collection: ShardedCollection, shards: readonly Shard[], chunkSizeMb: number): Balance {
  const counted = shards.filter((shard) => !shard.draining);
  const data = collection.data;
  if (data === undefined || counted.length < 2) {
    return empty;
  }
  const sizes = counted.map((shard) =>
    data.filter((each) => each.shard === shard.name).reduce((sum, each) => sum + each.size, 0),
  );
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const largest = Math.max(...sizes);
  const smallest = Math.min(...sizes);
  const evenShare = total / counted.length;
  const uneven = total > 0 && largest >= 1.5 * evenShare && largest - smallest > 3 * chunkSizeMb * 1024 * 1024;
  if (!uneven) {
    return empty;
  }
  const percent = String(Math.round((largest / total) * 100));
  return { word: words.uneven, warning: true, tooltip: words.largestHolds(percent) };
}

/** Feature: monitor.balance — the balancer's verdict (rules 1 and 2), else the estimate (rule 3). */
export function balance(
  collection: ShardedCollection,
  shards: readonly Shard[],
  chunkSizeMb: number = defaultChunkSizeMb,
): Balance {
  const verdict = collection.verdict;
  if (verdict === undefined) {
    return estimate(collection, shards, chunkSizeMb);
  }
  if (verdict.compliant) {
    return { word: words.balanced, warning: false, tooltip: words.compliant };
  }
  const violation = verdict.violation;
  const word = violation === undefined ? words.notBalanced : (words.violations[violation] ?? violation);
  return { word, warning: true, tooltip: words.violation(violation ?? words.notBalanced) };
}
