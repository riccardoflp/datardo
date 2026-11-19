import { describe, expect, it } from 'vitest';
import { isRedundantWith, redundantIndexes } from '../../../src/features/advisor/redundant-indexes';
import type { AdvisorIndex } from '../../../src/features/advisor/types';
import { idIndex, index } from './context';

/** The redundant indexes, as `name by name`. */
function found(indexes: readonly AdvisorIndex[]): readonly string[] {
  return redundantIndexes({ indexes }).map((each) => `${each.index.name} by ${each.by.name}`);
}

const active = { partialFilterExpression: { active: true } };

describe('advisor.redundant-indexes', () => {
  it.each<[string, readonly AdvisorIndex[], readonly string[]]>([
    [
      'status_1 is replaced by status_1_createdAt_-1',
      [index('status_1', { status: 1 }), index('status_1_createdAt_-1', { status: 1, createdAt: -1 })],
      ['status_1 by status_1_createdAt_-1'],
    ],
    ['a_-1 is replaced by a_1', [index('a_1', { a: 1 }), index('a_-1', { a: -1 })], ['a_-1 by a_1']],
    [
      'a_1_b_1 and a_1 are both replaced by a_1_b_1_c_1',
      [index('a_1', { a: 1 }), index('a_1_b_1', { a: 1, b: 1 }), index('a_1_b_1_c_1', { a: 1, b: 1, c: 1 })],
      ['a_1_b_1 by a_1_b_1_c_1', 'a_1 by a_1_b_1_c_1'],
    ],
    [
      'a unique index is never redundant',
      [index('email_1', { email: 1 }, { unique: true }), index('email_1_name_1', { email: 1, name: 1 })],
      [],
    ],
    [
      'a TTL index is never redundant',
      [index('at_1', { at: 1 }, { expireAfterSeconds: 3600 }), index('at_1_kind_1', { at: 1, kind: 1 })],
      [],
    ],
    [
      'a hidden index replaces nothing',
      [index('a_1', { a: 1 }), index('a_1_b_1', { a: 1, b: 1 }, { hidden: true })],
      [],
    ],
    [
      'a partial index does not replace one that is not',
      [index('a_1', { a: 1 }), index('a_1_b_1', { a: 1, b: 1 }, active)],
      [],
    ],
    [
      'two indexes with the same partial filter',
      [index('a_1', { a: 1 }, active), index('a_1_b_1', { a: 1, b: 1 }, active)],
      ['a_1 by a_1_b_1'],
    ],
    [
      'a sparse index does not replace one that is not',
      [index('a_1', { a: 1 }), index('a_1_b_1', { a: 1, b: 1 }, { sparse: true })],
      [],
    ],
    [
      'a sparse index is replaced by one that is not',
      [index('a_1', { a: 1 }, { sparse: true }), index('a_1_b_1', { a: 1, b: 1 })],
      ['a_1 by a_1_b_1'],
    ],
    [
      'an index with a collation is not replaced by one without',
      [index('name_1', { name: 1 }, { collation: 'fr' }), index('name_1_at_1', { name: 1, at: 1 })],
      [],
    ],
    [
      'a hashed index is not replaced by an ascending one',
      [index('a_hashed', { a: 'hashed' }), index('a_1_b_1', { a: 1, b: 1 })],
      [],
    ],
  ])('%s', (_, indexes, result) => {
    expect(found(indexes)).toEqual(result);
  });

  it('an index is never redundant with itself, and _id_ is never redundant', () => {
    const status = index('status_1', { status: 1 });
    expect(isRedundantWith(status, status)).toBe(false);
    expect(found([idIndex, index('_id_1_at_1', { _id: 1, at: 1 })])).toEqual([]);
  });

  it('two indexes with the same keys give one advice, for the one listed last', () => {
    expect(found([index('a_1', { a: 1 }), index('a_first', { a: 1 }), index('b_1', { b: 1 })])).toEqual([
      'a_first by a_1',
    ]);
  });

  it('the advice of status_1 names status_1_createdAt_-1 { status: 1, createdAt: -1 } as the index that serves it', () => {
    const by = index('status_1_createdAt_-1', { status: 1, createdAt: -1 });
    const [advice] = redundantIndexes({ indexes: [index('status_1', { status: 1 }), by] });
    expect(advice?.by).toBe(by);
  });

  it('an index being built neither is redundant nor replaces one', () => {
    expect(found([index('a_1', { a: 1 }), index('a_1_b_1', { a: 1, b: 1 }, { building: true })])).toEqual([]);
    expect(found([index('a_1', { a: 1 }, { building: true }), index('a_1_b_1', { a: 1, b: 1 })])).toEqual([]);
  });

  it('when several indexes could replace one, the first listed is named', () => {
    expect(found([index('a_1', { a: 1 }), index('a_1_b_1', { a: 1, b: 1 }), index('a_1_c_1', { a: 1, c: 1 })])).toEqual(
      ['a_1 by a_1_b_1'],
    );
  });
});
