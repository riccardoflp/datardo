import { describe, expect, it } from 'vitest';
import { advice } from '../../../src/features/advisor/analyze';
import { readIndexesOf } from '../../../src/features/advisor/parts/index-replies';
import { parse as parseSlow } from '../../../src/features/advisor/read-slow-operations';
import { summaryText } from '../../../src/features/advisor/parts/sources';
import { int } from '../monitor/context';
import { collectionOf, day, idIndex, index, megabyte, operation, recorded } from './context';

const now = Date.UTC(2026, 10, 18, 12, 0, 0);

/** The worked example: `shop.orders` with five indexes and one index to create. */
function example(): ReturnType<typeof advice> {
  const orders = collectionOf('shop.orders', [
    idIndex,
    index('status_1', { status: 1 }, { size: 2 * megabyte, uses: 0, since: now - 12 * day }),
    index(
      'status_1_createdAt_-1',
      { status: 1, createdAt: -1 },
      { size: 5 * megabyte, uses: 80, since: now - 12 * day },
    ),
    index('note_1', { note: 1 }, { size: 9 * megabyte, uses: 0, since: now - 30 * day }),
    index('old_1', { old: 1 }, { size: megabyte, hidden: true, uses: 0, since: now - 30 * day }),
  ]);
  return advice([orders], [operation({ filter: { customerId: int(42) } })], now);
}

describe('advisor.analyze', () => {
  it('the worked example gives the index to create, status_1 as redundant, then note_1 and old_1', () => {
    expect(example().advices.map((each) => each.id)).toEqual([
      'create:shop.orders:{ customerId: 1 }',
      'redundant:shop.orders:status_1',
      'unused:shop.orders:note_1',
      'hidden:shop.orders:old_1',
    ]);
  });

  it('the summary of the worked example says 4 suggestions', () => {
    const result = example();
    const indexes = { databases: ['shop'], profiled: [], collections: [], failed: [] };
    expect(summaryText(indexes, result.advices.length)).toBe(
      '0 collections · 0 indexes · 0 B of indexes · 4 suggestions',
    );
  });

  it('two indexes to create of 4,200 ms and 9,000 ms are listed with the one of 9,000 ms first', () => {
    const orders = collectionOf('shop.orders', [idIndex]);
    const operations = [
      operation({ filter: { a: int(1) }, millis: 4200 }),
      operation({ filter: { b: int(1) }, millis: 9000 }),
    ];
    expect(advice([orders], operations, now).advices.map((each) => each.id)).toEqual([
      'create:shop.orders:{ b: 1 }',
      'create:shop.orders:{ a: 1 }',
    ]);
  });

  it('the same collections and operations analyzed twice give the same identifiers', () => {
    expect(example().advices.map((each) => each.id)).toEqual(example().advices.map((each) => each.id));
  });

  it('with no collection and no operation the result is no advice and 0 indexes too recent', () => {
    expect(advice([], [], now)).toEqual({ advices: [], tooRecent: 0 });
  });

  it('the redundant and the unused indexes are the largest first; an unknown size counts as 0 bytes', () => {
    const orders = collectionOf('shop.orders', [
      idIndex,
      index('a_1', { a: 1 }, { uses: 0, since: now - 30 * day }),
      index('b_1', { b: 1 }, { size: megabyte, uses: 0, since: now - 30 * day }),
      index('c_1', { c: 1 }, { size: 3 * megabyte, uses: 0, since: now - 30 * day }),
    ]);
    expect(advice([orders], [], now).advices.map((each) => each.id)).toEqual([
      'unused:shop.orders:c_1',
      'unused:shop.orders:b_1',
      'unused:shop.orders:a_1',
    ]);
  });

  it('the replies recorded from MongoDB 8.2, two days later, give the advice of each kind', () => {
    const replies = ['list-indexes', 'index-stats', 'coll-stats', 'estimated-document-count'].map(recorded);
    const orders = readIndexesOf({ database: 'shop', collection: 'orders' }, replies);
    const slow = parseSlow([recorded('profile-status'), recorded('system-profile'), recorded('get-log')], {
      databases: ['shop'],
      profiled: ['shop'],
      collections: ['shop.orders'],
    });
    const since = Math.max(...orders.indexes.map((each) => each.since ?? 0));
    const ids = advice([orders], slow.operations, since + 2 * day).advices.map((each) => each.id);
    expect(ids.filter((id) => id.startsWith('create:')).sort()).toEqual([
      'create:shop.orders:{ customerId: 1, createdAt: -1 }',
      'create:shop.orders:{ customerId: 1, total: -1 }',
      'create:shop.orders:{ total: 1 }',
    ]);
    expect(ids.filter((id) => !id.startsWith('create:'))).toEqual(
      expect.arrayContaining([
        'redundant:shop.orders:status_1',
        'hidden:shop.orders:total_1',
        'unused:shop.orders:customerId_1',
        'unused:shop.orders:note_1',
        'unused:shop.orders:name_1',
      ]),
    );
    expect(ids).toHaveLength(8);
  });
});
