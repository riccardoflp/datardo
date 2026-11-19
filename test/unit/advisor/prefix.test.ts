import { describe, expect, it } from 'vitest';
import { startsWith } from '../../../src/features/advisor/prefix';
import { indexKeyOf } from '../../../src/features/monitor/types';

type Key = Readonly<Record<string, number | string>>;

function starts(key: Key, prefix: Key): boolean {
  return startsWith(indexKeyOf(key), indexKeyOf(prefix));
}

describe('advisor.prefix', () => {
  it.each<[Key, Key, boolean]>([
    [{ a: 1, b: 1 }, { a: 1 }, true],
    [{ a: 1, b: -1, c: 1 }, { a: 1, b: -1 }, true],
    [{ a: -1, b: 1, c: 1 }, { a: 1, b: -1 }, true],
    [{ a: 1, b: 1, c: 1 }, { a: 1, b: -1 }, false],
    [{ a: 1, b: 1 }, { b: 1 }, false],
    [{ a: 1 }, { a: 1, b: 1 }, false],
    [{ a: 1 }, { a: 1 }, true],
    [{ a: -1 }, { a: 1 }, true],
    [{ a: 'hashed' }, { a: 1 }, false],
    [{ a: 'hashed' }, { a: 'hashed' }, true],
    [{ loc: '2dsphere', at: -1 }, { loc: '2dsphere' }, true],
    [{ a: 1 }, {}, false],
  ])('the key %j starts with %j: %s', (key, prefix, result) => {
    expect(starts(key, prefix)).toBe(result);
  });

  it('the order of the fields always counts: { a: 1, b: 1 } does not start with { b: 1, a: 1 }', () => {
    expect(starts({ a: 1, b: 1 }, { b: 1, a: 1 })).toBe(false);
  });

  it('any negative number is descending and any other number ascending', () => {
    expect(starts({ a: -5, b: 2 }, { a: -1, b: 1 })).toBe(true);
    expect(starts({ a: 3 }, { a: -1 })).toBe(true);
  });

  it('a kind against a direction, or another kind, is no, also reversed', () => {
    expect(starts({ a: 1, b: 'text' }, { a: -1, b: 'text' })).toBe(false);
    expect(starts({ a: 'text' }, { a: 'hashed' })).toBe(false);
  });
});
