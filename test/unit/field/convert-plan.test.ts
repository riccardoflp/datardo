import { describe, expect, it } from 'vitest';
import { CONVERT_TYPES, convertPlan } from '../../../src/features/field/convert-plan';
import { notArray } from './harness';

describe('field.convert-plan', () => {
  it('converts price to decimal in the documents of the filter', () => {
    const plan = convertPlan({ k: 1 }, 'price', 'decimal');
    const expected = { $and: [{ k: 1 }, { price: { $exists: true, $not: { $type: ['decimal', 'null', 'array'] } } }] };
    expect(plan.filter).toEqual(expected);
    expect(plan.reached).toEqual(expected);
  });

  it('guards the parent of a nested field, but not in reached', () => {
    const plan = convertPlan({}, 'a.b', 'int');
    const notYet = { 'a.b': { $exists: true, $not: { $type: ['int', 'null', 'array'] } } };
    expect(plan.filter).toEqual({ $and: [notArray('a'), notYet] });
    expect(plan.reached).toEqual(notYet);
  });

  it('keeps a value that fails, and null, with $convert', () => {
    expect(convertPlan({}, 'v', 'int').update).toEqual([
      { $set: { v: { $convert: { input: '$v', to: 'int', onError: '$v', onNull: '$v' } } } },
    ]);
  });

  it('offers the types in the order of the card, each with its description', () => {
    expect(CONVERT_TYPES.map((each) => each.type)).toEqual([
      'string',
      'int',
      'long',
      'double',
      'decimal',
      'bool',
      'date',
      'objectId',
    ]);
    expect(CONVERT_TYPES[0]?.description).toBe('Numbers, dates (ISO), ObjectIds and booleans as text');
    expect(CONVERT_TYPES[5]?.description).toBe('Numbers: 0 is false; any text, even "false", is true');
    expect(CONVERT_TYPES[7]?.description).toBe('24 hexadecimal characters');
  });
});
