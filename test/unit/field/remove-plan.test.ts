import { describe, expect, it } from 'vitest';
import { removePlan } from '../../../src/features/field/remove-plan';
import { notArray } from './harness';

describe('field.remove-plan', () => {
  it('removes a nested field where its parent is not an array', () => {
    const plan = removePlan({ x: 1 }, 'a.b');
    expect(plan.filter).toEqual({ $and: [{ $and: [{ x: 1 }, { 'a.b': { $exists: true } }] }, notArray('a')] });
    expect(plan.update).toEqual({ $unset: { 'a.b': '' } });
  });

  it('removes a field from every element of an expanded array', () => {
    const plan = removePlan({}, 'items.sku', 'items');
    expect(plan.filter).toEqual({ $and: [{ 'items.sku': { $exists: true } }, { items: { $type: 'array' } }] });
    expect(plan.update).toEqual({ $unset: { 'items.$[].sku': '' } });
    expect(plan.reached).toEqual({ 'items.sku': { $exists: true } });
  });

  it('removes a deep field of the elements of a nested array, its parent not an array', () => {
    const plan = removePlan({}, 'order.items.meta.sku', 'order.items');
    expect(plan.update).toEqual({ $unset: { 'order.items.$[].meta.sku': '' } });
    expect(plan.filter).toEqual({
      $and: [{ 'order.items.meta.sku': { $exists: true } }, notArray('order'), { 'order.items': { $type: 'array' } }],
    });
  });

  it('removes a top-level field with no guard, null values included', () => {
    const plan = removePlan({}, 'tmp');
    expect(plan.filter).toEqual({ tmp: { $exists: true } });
    expect(plan.update).toEqual({ $unset: { tmp: '' } });
  });
});
