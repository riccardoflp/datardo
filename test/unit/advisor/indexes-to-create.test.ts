import { describe, expect, it } from 'vitest';
import { indexesToCreate } from '../../../src/features/advisor/indexes-to-create';
import { queryDetails } from '../../../src/features/advisor/parts/advice-items';
import type { AdvisorIndex } from '../../../src/features/advisor/types';
import { indexKeyText, type SlowQuery } from '../../../src/features/monitor/types';
import { int } from '../monitor/context';
import { collectionOf, idIndex, index, operation, times } from './context';

const status = index('status_1', { status: 1 });

/** The keys of each advice on `shop.orders` with `_id_`, `status_1` and the indexes given. */
function keysOf(operations: readonly SlowQuery[], more: readonly AdvisorIndex[] = [status]): readonly string[] {
  return indexesToCreate([collectionOf('shop.orders', [idIndex, ...more])], operations).map((each) =>
    indexKeyText(each.keys),
  );
}

describe('advisor.indexes-to-create', () => {
  it('7 finds by customerId sorted by createdAt, collection scans, give { customerId: 1, createdAt: -1 }, 7 operations', () => {
    const operations = times(7, { filter: { customerId: int(42) }, sort: { createdAt: int(-1) } });
    const [advice] = indexesToCreate([collectionOf('shop.orders', [idIndex, status])], operations);
    expect(advice && indexKeyText(advice.keys)).toBe('{ customerId: 1, createdAt: -1 }');
    expect(advice?.operations).toBe(7);
    expect(advice?.id).toBe('create:shop.orders:{ customerId: 1, createdAt: -1 }');
  });

  it('equality, then sort, then range: { status: 1, createdAt: -1, total: 1 }', () => {
    const sorted = operation({
      filter: { status: 'paid', total: { $gt: int(100) } },
      sort: { createdAt: int(-1) },
      plan: 'IXSCAN { status: 1 }',
      inMemorySort: true,
    });
    expect(keysOf([sorted])).toEqual(['{ status: 1, createdAt: -1, total: 1 }']);
  });

  it('a find that status_1 serves gives nothing; a hidden, partial, sparse or collated status_1 does not serve it', () => {
    const paid = operation({
      filter: { status: 'paid' },
      examined: 50_000,
      returned: 20,
      plan: 'IXSCAN { status: 1 }',
    });
    expect(keysOf([paid])).toEqual([]);
    for (const more of [
      { hidden: true },
      { partialFilterExpression: { a: true } },
      { sparse: true },
      { collation: 'fr' },
    ]) {
      expect(keysOf([paid], [index('status_1', { status: 1 }, more)])).toEqual(['{ status: 1 }']);
    }
  });

  it('{ kind: "a" } and { kind: "a", user: 7 } make one advice { kind: 1, user: 1 } with both queries', () => {
    const operations = [operation({ filter: { kind: 'a' } }), operation({ filter: { kind: 'a', user: int(7) } })];
    const advices = indexesToCreate([collectionOf('shop.orders', [idIndex, status])], operations);
    expect(advices.map((each) => indexKeyText(each.keys))).toEqual(['{ kind: 1, user: 1 }']);
    expect(advices[0]?.queries).toHaveLength(2);
  });

  it('{ user: 7 } and { kind: "a", user: 7 } make two advices', () => {
    const operations = [operation({ filter: { user: int(7) } }), operation({ filter: { kind: 'a', user: int(7) } })];
    expect([...keysOf(operations)].sort()).toEqual(['{ kind: 1, user: 1 }', '{ user: 1 }']);
  });

  it('a sort by { createdAt: -1 } with no filter is served by { createdAt: 1 } read backwards', () => {
    const sorted = operation({ sort: { createdAt: int(-1) }, inMemorySort: true });
    expect(keysOf([sorted], [status, index('createdAt_1', { createdAt: 1 })])).toEqual([]);
  });

  it('an aggregate with $match then $sort gives { customerId: 1, date: -1 }; one that starts with $group, none', () => {
    const matched = operation({ pipeline: [{ $match: { customerId: int(7) } }, { $sort: { date: int(-1) } }] });
    expect(keysOf([matched])).toEqual(['{ customerId: 1, date: -1 }']);
    const grouped = operation({ pipeline: [{ $group: { _id: '$status' } }] });
    expect(keysOf([grouped])).toEqual([]);
  });

  it('a find of 40 ms and its two getMore of 900 and 700 ms: 1 operation, 1,640 ms, average 1,640 ms', () => {
    const operations = [
      operation({ filter: { kind: 'a' }, millis: 40 }),
      operation({ filter: { kind: 'a' }, millis: 900, getMore: true }),
      operation({ filter: { kind: 'a' }, millis: 700, getMore: true }),
    ];
    const [advice] = indexesToCreate([collectionOf('shop.orders', [idIndex])], operations);
    expect(advice).toMatchObject({ operations: 1, totalMillis: 1640 });
    expect(advice?.queries[0]).toMatchObject({ operations: 1, totalMillis: 1640, averageMillis: 1640 });
    expect(advice?.queries[0] && queryDetails(advice.queries[0])).toMatch(/^1 time · avg 1\.6 s/u);
  });

  it('a find with an IXSCAN that examined 80 and returned 20 gives nothing: 4 examined per returned', () => {
    expect(keysOf([operation({ filter: { kind: 'a' }, plan: 'IXSCAN { x: 1 }', examined: 80, returned: 20 })])).toEqual(
      [],
    );
  });

  it('{ kind: 1 } and { kind: 1, user: 1 } on two different collections give two advices', () => {
    const operations = [
      operation({ namespace: 'shop.orders', filter: { kind: 'a' } }),
      operation({ namespace: 'shop.users', filter: { kind: 'a', user: int(7) } }),
    ];
    const collections = [collectionOf('shop.orders', [idIndex]), collectionOf('shop.users', [idIndex])];
    expect(
      indexesToCreate(collections, operations)
        .map((each) => each.id)
        .sort(),
    ).toEqual(['create:shop.orders:{ kind: 1 }', 'create:shop.users:{ kind: 1, user: 1 }']);
  });

  it('two shapes of 3 and 9 operations and 1,200 and 3,000 ms make 12 operations and 4,200 ms, the 3,000 ms first', () => {
    const operations = [
      ...times(3, { filter: { kind: 'a' }, millis: 400 }),
      ...times(9, { filter: { kind: 'a', user: int(7) }, millis: 3000 / 9 }),
    ];
    const [advice] = indexesToCreate([collectionOf('shop.orders', [idIndex])], operations);
    expect(advice).toMatchObject({ operations: 12, totalMillis: 4200 });
    expect(advice?.queries.map((each) => each.operations)).toEqual([9, 3]);
  });

  it('an operation on a collection that is not in the scope gives no advice', () => {
    expect(keysOf([operation({ namespace: 'shop.customers', filter: { kind: 'a' } })])).toEqual([]);
  });

  it('100 examined and 0 returned ask for an index; 90 examined and 10 returned do not', () => {
    const plan = 'IXSCAN { x: 1 }';
    expect(keysOf([operation({ filter: { kind: 'a' }, plan, examined: 100, returned: 0 })])).toEqual(['{ kind: 1 }']);
    expect(keysOf([operation({ filter: { kind: 'a' }, plan, examined: 90, returned: 10 })])).toEqual([]);
  });

  it('the advices are listed by the total time of their queries, the largest first', () => {
    const operations = [
      operation({ filter: { a: int(1) }, millis: 4200 }),
      operation({ filter: { b: int(1) }, millis: 9000 }),
    ];
    expect(keysOf(operations)).toEqual(['{ b: 1 }', '{ a: 1 }']);
  });
});
