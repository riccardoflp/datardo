import { describe, expect, it } from 'vitest';
import { queryShape } from '../../../src/features/monitor/query-shape';
import type { QueryParts } from '../../../src/features/monitor/types';
import { int } from './context';

const examples: readonly (readonly [string, QueryParts, string])[] = [
  ['find', { filter: { status: 'paid', age: { $gt: 30 } } }, '{ status: ?, age: { $gt: ? } }'],
  [
    'find',
    { filter: { status: 'new' }, sort: { createdAt: -1 }, projection: { name: 1, _id: 0 } },
    '{ status: ? } · sort { createdAt: -1 } · project { name: 1, _id: 0 }',
  ],
  ['find', { filter: { status: { $in: ['a', 'b', 'c'] } } }, '{ status: { $in: [?] } }'],
  ['find', { filter: { tags: { $in: [] } } }, '{ tags: { $in: [] } }'],
  ['find', { filter: { $or: [{ a: 1 }, { b: 2 }, { a: 5 }] } }, '{ $or: [{ a: ? }, { b: ? }] }'],
  [
    'find',
    {
      filter: {
        name: { $regularExpression: { pattern: '^ma', options: 'i' } },
        _id: { $oid: '65f1c0de9a1b2c3d4e5f6a2c' },
      },
    },
    '{ name: /?/, _id: ? }',
  ],
  ['find', { filter: { 'address.city': 'Rome', deletedAt: null } }, '{ "address.city": ?, deletedAt: ? }'],
  ['find', {}, '{}'],
  ['count', { filter: {} }, '{}'],
  [
    'update',
    { filter: { _id: 7 }, update: { $set: { status: 'paid' } } },
    '{ _id: ? } · update { $set: { status: ? } }',
  ],
  [
    'aggregate',
    {
      pipeline: [
        { $match: { status: 'paid' } },
        { $sort: { total: -1 } },
        { $group: { _id: '$customerId', n: { $sum: 1 } } },
        { $limit: 10 },
      ],
    },
    '[{ $match: { status: ? } }, { $sort: { total: -1 } }, { $group: { _id: "$customerId", n: { $sum: ? } } }, { $limit: ? }]',
  ],
  ['aggregate', { pipeline: [{ $project: { name: 1, active: true } }] }, '[{ $project: { name: 1, active: true } }]'],
  ['insert', {}, ''],
];

describe('monitor.query-shape', () => {
  it.each(examples)('gives the shape of a %s of the worked examples', (kind, query, shape) => {
    expect(queryShape(kind, query)).toBe(shape);
  });

  it('gives { status: "paid" } and { status: "new" } the same shape, and { state: "paid" } another', () => {
    const paid = queryShape('find', { filter: { status: 'paid' } });
    expect(queryShape('find', { filter: { status: 'new' } })).toBe(paid);
    expect(queryShape('find', { filter: { state: 'paid' } })).not.toBe(paid);
  });

  it('counts the order of the fields', () => {
    expect(queryShape('find', { filter: { a: 1, b: 2 } })).not.toBe(queryShape('find', { filter: { b: 2, a: 1 } }));
  });

  it('gives $in lists of 1 and of 500 values the same shape', () => {
    const many = Array.from({ length: 500 }, (_, index) => index);
    expect(queryShape('find', { filter: { _id: { $in: [1] } } })).toBe(
      queryShape('find', { filter: { _id: { $in: many } } }),
    );
  });

  it('tells a sort by { createdAt: 1 } from one by { createdAt: -1 }, also in canonical Extended JSON', () => {
    const ascending = queryShape('find', { sort: { createdAt: int(1) } });
    expect(ascending).toBe('sort { createdAt: 1 }');
    expect(queryShape('find', { sort: { createdAt: int(-1) } })).toBe('sort { createdAt: -1 }');
  });

  it('makes a canonical number of a filter a ?', () => {
    expect(queryShape('find', { filter: { total: { $gt: int(100) } } })).toBe('{ total: { $gt: ? } }');
  });
});
