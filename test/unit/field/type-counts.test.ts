import { describe, expect, it } from 'vitest';
import { parse, typeCountsPipeline, typeCountsRequest } from '../../../src/features/field/type-counts';
import { convertQuestion } from '../../../src/features/field/convert-type';
import { placeOf } from '../../../src/features/field/types';
import { fieldContext, notArray, started } from './harness';

describe('field.type-counts', () => {
  it('matches the filter, the guard and the field, and groups by type', () => {
    expect(typeCountsPipeline({ x: 1 }, 'a.b')).toEqual([
      { $match: { $and: [{ x: 1 }, notArray('a'), { 'a.b': { $exists: true } }] } },
      { $group: { _id: { $type: '$a.b' }, n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]);
  });

  it('counts for at most 30 seconds', () => {
    const request = typeCountsRequest({ connection: 'c-local', database: 'shop', collection: 'people', field: 'v' });
    expect(request.method).toBe('aggregate');
    expect(request.timeLimitMs).toBe(30_000);
    expect(request.arguments[1]).toEqual({ maxTimeMS: 30_000 });
  });

  it('shows now: string 2 · double 1 · null 1 in the list of Convert type…', () => {
    const rows = parse([
      [
        { _id: 'string', n: { $numberInt: '2' } },
        { _id: 'double', n: { $numberInt: '1' } },
        { _id: 'null', n: { $numberInt: '1' } },
      ],
    ]);
    const place = placeOf(fieldContext('field.convert-type'), started({ field: 'v' }));
    if (place === undefined) {
      throw new Error('No place.');
    }
    const [field] = convertQuestion(place, rows).fields;
    expect(field?.label).toBe('Type to convert the values to · now: string 2 · double 1 · null 1');
  });

  it('gives the first row { _id: "int", n: 3 } once v is converted, and nothing for a failed count', () => {
    expect(parse([[{ _id: 'int', n: { $numberInt: '3' } }]])).toEqual([{ type: 'int', count: 3 }]);
    expect(parse([{ kind: 'error', message: 'operation exceeded time limit' }])).toEqual([]);
  });
});
