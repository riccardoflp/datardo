import { describe, expect, it } from 'vitest';
import {
  emptyRanking,
  largestKeys,
  type MeasuredKey,
  type MeasuredSize,
  type Ranking,
} from '../../../src/features/server/rank-keys';
import { bytes } from './context';

const decoder = new TextDecoder();

function measured(...keys: readonly (readonly [string, MeasuredSize])[]): readonly MeasuredKey[] {
  return keys.map(([name, size]) => ({ name: bytes(name), size }));
}

function names(ranking: Ranking): readonly string[] {
  return ranking.keys.map((key) => `${decoder.decode(key.name)} ${String(key.bytes)}`);
}

function ranking(keys: readonly (readonly [string, number])[], examined: number): Ranking {
  return { ...emptyRanking, keys: keys.map(([name, size]) => ({ name: bytes(name), bytes: size })), examined };
}

describe('server.rank-keys', () => {
  it('(empty) with a 100, b 300, c 200 gives b, c, a, examined 3', () => {
    const after = largestKeys(emptyRanking, measured(['a', 100], ['b', 300], ['c', 200]), 3);
    expect(names(after)).toEqual(['b 300', 'c 200', 'a 100']);
    expect(after.examined).toBe(3);
  });

  it('b, c, a with d 250 gives b, d, c, examined 4', () => {
    const before = ranking(
      [
        ['b', 300],
        ['c', 200],
        ['a', 100],
      ],
      3,
    );
    const after = largestKeys(before, measured(['d', 250]), 3);
    expect(names(after)).toEqual(['b 300', 'd 250', 'c 200']);
    expect(after.examined).toBe(4);
  });

  it('b, d, c with e 50 is unchanged, examined 5', () => {
    const before = ranking(
      [
        ['b', 300],
        ['d', 250],
        ['c', 200],
      ],
      4,
    );
    const after = largestKeys(before, measured(['e', 50]), 3);
    expect(names(after)).toEqual(['b 300', 'd 250', 'c 200']);
    expect(after.examined).toBe(5);
  });

  it('b, d, c with c 400 gives c 400, b, d, examined 6', () => {
    const before = ranking(
      [
        ['b', 300],
        ['d', 250],
        ['c', 200],
      ],
      5,
    );
    const after = largestKeys(before, measured(['c', 400]), 3);
    expect(names(after)).toEqual(['c 400', 'b 300', 'd 250']);
    expect(after.examined).toBe(6);
  });

  it('b, d, c with f nil and g an error is unchanged, skipped 1, failed 1', () => {
    const before = ranking(
      [
        ['b', 300],
        ['d', 250],
        ['c', 200],
      ],
      6,
    );
    const after = largestKeys(
      before,
      measured(['f', null], ['g', { error: 'NOPERM No permissions to access a key' }]),
      3,
    );
    expect(names(after)).toEqual(['b 300', 'd 250', 'c 200']);
    expect(after).toMatchObject({ examined: 6, skipped: 1, failed: 1 });
  });

  it('(empty) with z, y, x, w all 100 gives w, x, y by name as bytes, examined 4', () => {
    const after = largestKeys(emptyRanking, measured(['z', 100], ['y', 100], ['x', 100], ['w', 100]), 3);
    expect(names(after)).toEqual(['w 100', 'x 100', 'y 100']);
    expect(after.examined).toBe(4);
  });

  it('1,000 keys in one batch, in ten batches and in reverse order give the same 100 keys in the same order', () => {
    const keys = Array.from({ length: 1000 }, (_, index): MeasuredKey => ({
      name: bytes(`key:${String(index)}`),
      size: ((index * 7919) % 613) * 8,
    }));
    const once = largestKeys(emptyRanking, keys);
    let tens = emptyRanking;
    for (let batch = 0; batch < 10; batch += 1) {
      tens = largestKeys(tens, keys.slice(batch * 100, batch * 100 + 100));
    }
    const reversed = largestKeys(emptyRanking, keys.toReversed());
    expect(once.keys).toHaveLength(100);
    expect(names(tens)).toEqual(names(once));
    expect(names(reversed)).toEqual(names(once));
  });

  it('never holds two keys with the same name', () => {
    const twice = largestKeys(largestKeys(emptyRanking, measured(['a', 10], ['b', 20])), measured(['a', 30], ['a', 5]));
    expect(names(twice)).toEqual(['b 20', 'a 5']);
  });
});
