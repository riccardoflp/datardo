/**
 * Feature: undo.prune-order — given the operations and the limits, which ones stay.
 */

/** A day, in milliseconds. */
export const dayMs = 86_400_000;

/** What the walk needs of an operation: when it was recorded and the bytes of its file (0 once undone). */
export interface Sized {
  readonly time: number;
  readonly size: number;
}

/** The limits of the undo history, as `undo.limits` reads them from the settings. */
export interface PruneLimits {
  readonly maxBytes: number;
  readonly maxDays: number;
  readonly maxEntries: number;
}

/**
 * Feature: undo.prune-order. Walks the operations from the newest to the oldest, in the order given: one larger than
 * `maxBytes` alone is dropped and the walk goes on; the first too old, beyond `maxEntries` or that does not fit stops
 * the walk, and it and every older one are dropped, even one that would still fit.
 */
export function keptOperations<T extends Sized>(operations: readonly T[], now: number, limits: PruneLimits): T[] {
  const cutoff = now - limits.maxDays * dayMs;
  const kept: T[] = [];
  let bytes = 0;
  for (const operation of operations) {
    if (operation.size > limits.maxBytes) {
      continue;
    }
    if (!(operation.time > cutoff) || kept.length >= limits.maxEntries || bytes + operation.size > limits.maxBytes) {
      break;
    }
    kept.push(operation);
    bytes += operation.size;
  }
  return kept;
}
