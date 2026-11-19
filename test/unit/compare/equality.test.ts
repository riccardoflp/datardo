import { describe, expect, it } from 'vitest';
import { comparable, ignoredPaths } from '../../../src/features/compare/equality';
import type { EqualityOptions } from '../../../src/features/compare/types';
import type { Json } from '../../../src/shared/engine-request';
import { decimal, double, int, long } from './context';

function options(overrides: Partial<EqualityOptions> = {}): EqualityOptions {
  return { ignore: [], ignoreOrder: false, numbersByValue: false, ...overrides };
}

function result(left: Json, right: Json, given: EqualityOptions): 'identical' | 'different' {
  return comparable(left, given) === comparable(right, given) ? 'identical' : 'different';
}

describe('compare.equality', () => {
  const both = options({ ignoreOrder: true, numbersByValue: true });

  it.each<[string, Json, Json, EqualityOptions, 'identical' | 'different']>([
    ['field order counts', { a: int(1), b: int(2) }, { b: int(2), a: int(1) }, options(), 'different'],
    [
      'Ignore field order',
      { a: int(1), b: int(2) },
      { b: int(2), a: int(1) },
      options({ ignoreOrder: true }),
      'identical',
    ],
    [
      'Ignore field order inside arrays',
      { x: [{ a: int(1), b: int(2) }] },
      { x: [{ b: int(2), a: int(1) }] },
      options({ ignoreOrder: true }),
      'identical',
    ],
    ['the order of array elements', { a: [int(1), int(2)] }, { a: [int(2), int(1)] }, both, 'different'],
    ['numbers by type', { n: int(1) }, { n: double('1.0') }, options(), 'different'],
    ['an int and a long by value', { n: int(1) }, { n: long('1') }, options({ numbersByValue: true }), 'identical'],
    ['1.5 and 1 by value', { n: double('1.5') }, { n: int(1) }, options({ numbersByValue: true }), 'different'],
    [
      'a long beyond 53 bits',
      { n: long('9007199254740993') },
      { n: double('9007199254740992.0') },
      options({ numbersByValue: true }),
      'different',
    ],
    [
      'a long at 53 bits',
      { n: long('9007199254740992') },
      { n: double('9007199254740992.0') },
      options({ numbersByValue: true }),
      'identical',
    ],
    [
      'ignored paths at any depth',
      { updatedAt: int(1), meta: { rev: int(1), v: int(1) }, items: [{ a: int(1), tmp: int(1) }] },
      { updatedAt: int(2), meta: { rev: int(2), v: int(1) }, items: [{ a: int(1), tmp: int(2) }] },
      options({ ignore: ['updatedAt', 'meta.rev', 'items.tmp'] }),
      'identical',
    ],
    ['only the exact path', { a: { b: int(1) } }, { a: { b: int(2) } }, options({ ignore: ['b'] }), 'different'],
  ])('%s', (...[, left, right, given, expected]) => {
    expect(result(left, right, given)).toBe(expected);
  });

  it('counts -0.0 and 0 equal by value, and never a Decimal128 and an int', () => {
    expect(result({ n: double('-0.0') }, { n: int(0) }, both)).toBe('identical');
    expect(result({ n: decimal('1') }, { n: int(1) }, both)).toBe('different');
  });

  it('counts NaN equal to NaN and the two infinities apart', () => {
    expect(result({ n: double('NaN') }, { n: double('NaN') }, both)).toBe('identical');
    expect(result({ n: double('Infinity') }, { n: double('-Infinity') }, both)).toBe('different');
  });

  it('compares every other value with its BSON type', () => {
    expect(result({ v: '1' }, { v: int(1) }, both)).toBe('different');
    expect(result({ at: { $date: { $numberLong: '0' } } }, { at: long('0') }, both)).toBe('different');
  });

  it('splits Ignore on commas, spaces and new lines, without blanks or duplicates', () => {
    expect(ignoredPaths(' a, b.c  a\n,d ,')).toEqual(['a', 'b.c', 'd']);
  });
});
