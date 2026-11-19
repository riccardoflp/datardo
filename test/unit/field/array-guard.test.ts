import { describe, expect, it } from 'vitest';
import { and, noArrayParents } from '../../../src/features/field/array-guard';
import { notArray } from './harness';

describe('field.array-guard', () => {
  it('gives no condition for a top-level field', () => {
    expect(noArrayParents('a')).toEqual([]);
  });

  it('gives one condition for each parent, from the outermost', () => {
    expect(noArrayParents('a.b.c')).toEqual([notArray('a'), notArray('a.b')]);
  });

  it('drops the empty conditions', () => {
    expect(and({}, {})).toEqual({});
    expect(and({ a: 1 }, {})).toEqual({ a: 1 });
    expect(and({ a: 1 }, { b: 2 })).toEqual({ $and: [{ a: 1 }, { b: 2 }] });
  });

  it('keeps the guard of addr.city for a rename that would fail on an array', () => {
    // The guard is what lets $rename of addr.city succeed where one document has addr as an array: that document is
    // not matched. The run against a server is the integration test of field.rename.
    expect(and({ 'addr.city': { $exists: true } }, ...noArrayParents('addr.city'))).toEqual({
      $and: [{ 'addr.city': { $exists: true } }, notArray('addr')],
    });
  });
});
