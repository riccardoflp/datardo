import { describe, expect, it } from 'vitest';
import {
  countText,
  countedCollections,
  mostCounted,
  parse,
  request,
  sizeText,
  withCounts,
} from '../../../src/features/tree/count';
import type { CollectionEntry } from '../../../src/features/tree/types';
import { contextOf, recorded } from './context';

function entry(name: string, kind: CollectionEntry['kind'] = 'collection'): CollectionEntry {
  return { name, kind, system: name.startsWith('system.') };
}

describe('tree.count', () => {
  it('reads the estimate the server keeps: estimatedDocumentCount, which scans nothing', () => {
    const read = request(contextOf('tree.count'), { connection: 'c-local', database: 'shop', collections: ['orders'] });
    expect(read.kind === 'engine' ? read.requests[0]?.request : undefined).toMatchObject({
      database: 'shop',
      collection: 'orders',
      method: 'estimatedDocumentCount',
      arguments: [],
    });
  });

  it('writes a number under 10,000 with separators: 0, 980, 1,204', () => {
    expect([0, 980, 1204, 9999].map(countText)).toEqual(['0', '980', '1,204', '9,999']);
  });

  it('writes from 10,000 in thousands, millions or billions: 12.3K, 120K, 1.3M, 2B', () => {
    expect([12_300, 120_000, 1_260_000, 2_000_000_000, 10_000, 99_960, 999_600].map(countText)).toEqual([
      '12.3K',
      '120K',
      '1.3M',
      '2B',
      '10K',
      '100K',
      '1M',
    ]);
  });

  it('writes a size by 1,024 with one decimal except for B: 512 B, 1.5 KB, 1.0 GB; 0 is not written', () => {
    expect([512, 1536, 1_073_741_824, 0].map(sizeText)).toEqual(['512 B', '1.5 KB', '1.0 GB', '']);
  });

  it('counts neither views, time series nor system collections, and only the first 500 in the order of the tree', () => {
    const entries = [
      entry('active', 'view'),
      entry('orders'),
      entry('weather', 'timeseries'),
      ...Array.from({ length: 600 }, (_, index) => entry(`c${String(index).padStart(3, '0')}`)),
      entry('system.views'),
    ];
    const counted = countedCollections({ buckets: [], entries });
    expect(counted).toHaveLength(mostCounted);
    expect(counted[0]).toBe('orders');
    expect(counted).not.toContain('active');
    expect(counted).not.toContain('weather');
    expect(counted).not.toContain('system.views');
    expect(counted).not.toContain('c599');
  });

  it('gives the counts that arrived, by collection (recorded from MongoDB 8.2)', () => {
    const args = { connection: 'c-local', database: 'tree_shop', collections: ['orders', 'Customers'] };
    expect(parse(recorded('mongodb-8.2-estimatedDocumentCount.json') as unknown[], args)).toEqual({
      orders: 3,
      Customers: 0,
    });
  });

  it('a count that fails leaves that collection without a count, and shows no error', () => {
    const args = { connection: 'c-local', database: 'shop', collections: ['orders', 'secret', 'users'] };
    const failed = { kind: 'error', message: 'not authorized' };
    expect(parse([{ $numberLong: '1204' }, failed, 7], args)).toEqual({ orders: 1204, users: 7 });
  });

  it('the key counts of Redis are written by the same rule', () => {
    expect(countText(1_204_000)).toBe('1.2M');
  });

  it('asks the runner for every count, even after one fails, and keeps the counts of the other databases', () => {
    const read = request(contextOf('tree.count'), { connection: 'c-local', database: 'shop', collections: ['orders'] });
    expect(read).toMatchObject({ kind: 'engine', failedRequests: 'are-replies' });
    const before = { 'shop.orders': 3, 'shop.gone': 1, 'media.fs.files': 2 };
    expect(withCounts(before, 'shop', { orders: 4 })).toEqual({ 'media.fs.files': 2, 'shop.orders': 4 });
  });
});
