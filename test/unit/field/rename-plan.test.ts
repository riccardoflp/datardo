import { describe, expect, it } from 'vitest';
import { renamePlan } from '../../../src/features/field/rename-plan';
import { notArray } from './harness';

describe('field.rename-plan', () => {
  it('renames old to new in the whole collection', () => {
    const plan = renamePlan({}, 'old', 'new');
    expect(plan.filter).toEqual({ old: { $exists: true } });
    expect(plan.reached).toEqual({ old: { $exists: true } });
    expect(plan.update).toEqual({ $rename: { old: 'new' } });
    expect(plan.overwrites).toEqual({ $and: [{ old: { $exists: true } }, { new: { $exists: true } }] });
  });

  it('guards the parents of both names', () => {
    const plan = renamePlan({ status: 'a' }, 'a.b', 'c.d.e');
    expect(plan.filter).toEqual({
      $and: [{ $and: [{ status: 'a' }, { 'a.b': { $exists: true } }] }, notArray('a'), notArray('c'), notArray('c.d')],
    });
    expect(plan.reached).toEqual({ $and: [{ status: 'a' }, { 'a.b': { $exists: true } }] });
  });

  it('counts as overwritten the documents that already have the new name', () => {
    const plan = renamePlan({ kind: 'x' }, 'name', 'fullName');
    const reached = { $and: [{ kind: 'x' }, { name: { $exists: true } }] };
    expect(plan.filter).toEqual(reached);
    expect(plan.overwrites).toEqual({ $and: [reached, { fullName: { $exists: true } }] });
  });

  it('leaves out of filter, and not of reached, a document where addr is an array', () => {
    const plan = renamePlan({}, 'addr.city', 'city');
    expect(plan.reached).toEqual({ 'addr.city': { $exists: true } });
    expect(plan.filter).toEqual({ $and: [{ 'addr.city': { $exists: true } }, notArray('addr')] });
  });
});
