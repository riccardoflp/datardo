import { describe, expect, it } from 'vitest';
import { dayMs, keptOperations, type PruneLimits, type Sized } from '../../../src/features/undo/prune-order';
import { megabyte } from '../../../src/features/undo/types';

const now = 1_800_000_000_000;
const kilobyte = 1024;
const defaults: PruneLimits = { maxBytes: 100 * megabyte, maxDays: 7, maxEntries: 200 };

function sized(size: number, age = 1000): Sized & { readonly name: string } {
  return { time: now - age, size, name: `${String(size)}@${String(age)}` };
}

describe('undo.prune-order', () => {
  it('keeps the newest 200 of 250 operations of 100 KB in the last 3 days', () => {
    const operations = Array.from({ length: 250 }, (_, index) => sized(100 * kilobyte, index * 1000));
    expect(keptOperations(operations, now, defaults)).toEqual(operations.slice(0, 200));
  });

  it('keeps 60 MB and 30 MB: the 20 MB one stops the walk, and the 1 KB one goes with it', () => {
    const operations = [sized(60 * megabyte), sized(30 * megabyte), sized(20 * megabyte), sized(kilobyte)];
    expect(keptOperations(operations, now, defaults)).toEqual(operations.slice(0, 2));
  });

  it('keeps the first only of 1 day, 8 days and 2 days old (the clock was changed)', () => {
    const operations = [sized(kilobyte, dayMs), sized(kilobyte, 8 * dayMs), sized(kilobyte, 2 * dayMs)];
    expect(keptOperations(operations, now, defaults)).toEqual(operations.slice(0, 1));
  });

  it('drops alone a new operation of 2 MB with a limit of 1 MB, and keeps the ten of 10 KB', () => {
    const operations = [sized(2 * megabyte), ...Array.from({ length: 10 }, () => sized(10 * kilobyte))];
    expect(keptOperations(operations, now, { ...defaults, maxBytes: megabyte })).toEqual(operations.slice(1));
  });

  it('keeps none with maxDays 0: the time of a new one is not after now', () => {
    expect(keptOperations([sized(kilobyte, 0)], now, { ...defaults, maxDays: 0 })).toEqual([]);
  });

  it('keeps none with maxEntries 0', () => {
    expect(keptOperations([sized(kilobyte)], now, { ...defaults, maxEntries: 0 })).toEqual([]);
  });
});
