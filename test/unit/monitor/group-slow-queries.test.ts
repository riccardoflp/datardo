import { describe, expect, it } from 'vitest';
import { slowQueryGroups } from '../../../src/features/monitor/group-slow-queries';
import { slowQuery } from './slow-query-builder';

const sorted = { filter: { status: 'paid' }, sort: { createdAt: -1 } };

describe('monitor.group-slow-queries', () => {
  it('makes one group of three find of one shape, with its totals, its example and its suggestion', () => {
    const runs = [120, 300, 90].map((millis, index) =>
      slowQuery({
        millis,
        query: sorted,
        docsExamined: 5000,
        returned: index === 2 ? 10 : 20,
        plan: 'COLLSCAN',
        time: 1000 + index,
      }),
    );
    const [group, ...others] = slowQueryGroups(runs);
    expect(others).toEqual([]);
    expect(group).toMatchObject({
      namespace: 'shop.orders',
      kind: 'find',
      shape: '{ status: ? } · sort { createdAt: -1 }',
      count: 3,
      getMores: 0,
      totalMillis: 510,
      averageMillis: 170,
      maxMillis: 300,
      docsExamined: 15000,
      returned: 50,
      plans: ['COLLSCAN'],
      collectionScan: true,
      last: 1002,
      suggestion: [
        { field: 'status', value: 1 },
        { field: 'createdAt', value: -1 },
      ],
    });
    expect(group?.example.millis).toBe(300);
  });

  it('counts the getMore batches with their find, which stays the example', () => {
    const find = slowQuery({ millis: 40 });
    const batches = [900, 700].map((millis) => slowQuery({ millis, getMore: true }));
    const [group] = slowQueryGroups([find, ...batches]);
    expect(group).toMatchObject({ count: 3, getMores: 2, totalMillis: 1640 });
    expect(group?.example).toBe(find);
  });

  it('suggests { customerId: 1, date: -1, total: 1 } for an aggregate that sorted in memory', () => {
    const pipeline = [{ $match: { customerId: 7, total: { $gt: 100 } } }, { $sort: { date: -1 } }];
    const [group] = slowQueryGroups([slowQuery({ kind: 'aggregate', query: { pipeline }, inMemorySort: true })]);
    expect(group?.suggestion).toEqual([
      { field: 'customerId', value: 1 },
      { field: 'date', value: -1 },
      { field: 'total', value: 1 },
    ]);
  });

  it('suggests nothing for an aggregate that starts with $group, even on a collection scan', () => {
    const pipeline = [{ $group: { _id: '$status', n: { $sum: 1 } } }];
    const [group] = slowQueryGroups([slowQuery({ kind: 'aggregate', query: { pipeline }, plan: 'COLLSCAN' })]);
    expect(group?.collectionScan).toBe(true);
    expect(group?.suggestion).toBeUndefined();
  });

  it('suggests nothing for an index scan examining 4 documents per document returned', () => {
    const run = slowQuery({ plan: 'IXSCAN { status: 1 }', docsExamined: 80, returned: 20 });
    expect(slowQueryGroups([run])[0]?.suggestion).toBeUndefined();
  });

  it('makes two groups of one shape on two collections', () => {
    const groups = slowQueryGroups([slowQuery(), slowQuery({ namespace: 'shop.customers' })]);
    expect(groups.map((group) => group.namespace).sort()).toEqual(['shop.customers', 'shop.orders']);
  });

  it('suggests an index for 100 documents examined and none returned', () => {
    const [group] = slowQueryGroups([slowQuery({ docsExamined: 100, returned: 0 })]);
    expect(group?.suggestion).toEqual([{ field: 'status', value: 1 }]);
  });

  it('gives the groups by total time, the largest first, then the one with more runs', () => {
    const groups = slowQueryGroups([
      slowQuery({ millis: 50, query: { filter: { a: 1 } } }),
      slowQuery({ millis: 900, query: { filter: { b: 1 } } }),
      slowQuery({ millis: 25, query: { filter: { c: 1 } } }),
      slowQuery({ millis: 25, query: { filter: { c: 2 } } }),
    ]);
    expect(groups.map((group) => [group.shape, group.totalMillis, group.count])).toEqual([
      ['{ b: ? }', 900, 1],
      ['{ c: ? }', 50, 2],
      ['{ a: ? }', 50, 1],
    ]);
  });
});
