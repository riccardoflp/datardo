/**
 * Feature: server.rank-keys
 *
 * Keeps, as keys are measured, the ones that take the most memory: the ranking `server.largest-keys` shows and grows.
 * The result does not depend on how the measured keys were split into batches, nor on their order, because the keys
 * are ordered by size and then by name, and only the first ones are kept.
 */
import { compareBytes, hexOf } from './types';

/** How many keys the ranking keeps (Datardo's choice). */
export const rankedKeysLimit = 100;

/** A key of the ranking: its name as bytes and the bytes `MEMORY USAGE` answered. */
export interface RankedKey {
  readonly name: Uint8Array;
  readonly bytes: number;
}

/** The ranking so far: the largest keys, and how many keys were examined, skipped (gone) and failed. */
export interface Ranking {
  readonly keys: readonly RankedKey[];
  readonly examined: number;
  readonly skipped: number;
  readonly failed: number;
}

/** What `MEMORY USAGE` answered for one key: a number of bytes, nil (the key is gone), or an error. */
export type MeasuredSize = number | null | { readonly error: string };

/** A key just measured. */
export interface MeasuredKey {
  readonly name: Uint8Array;
  readonly size: MeasuredSize;
}

/** No key examined yet. */
export const emptyRanking: Ranking = { keys: [], examined: 0, skipped: 0, failed: 0 };

/** The order of the ranking: the largest first; two keys of the same size by name, compared as bytes. */
export function compareRanked(one: RankedKey, other: RankedKey): number {
  return other.bytes - one.bytes || compareBytes(one.name, other.name);
}

/** Feature: server.rank-keys — the ranking after the keys just measured, at most `limit` keys. */
export function largestKeys(ranking: Ranking, measured: readonly MeasuredKey[], limit = rankedKeysLimit): Ranking {
  const byName = new Map(ranking.keys.map((key) => [hexOf(key.name), key]));
  let { examined, skipped, failed } = ranking;
  for (const key of measured) {
    if (key.size === null) {
      skipped += 1;
    } else if (typeof key.size === 'number') {
      examined += 1;
      byName.set(hexOf(key.name), { name: key.name, bytes: key.size });
    } else {
      failed += 1;
    }
  }
  const keys = [...byName.values()].sort(compareRanked).slice(0, limit);
  return { keys, examined, skipped, failed };
}
