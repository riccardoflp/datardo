import { describe, expect, it } from 'vitest';
import { expandedAfterClearing, filterDelayMs, view } from '../../../src/features/tree/filter';
import { contentsOf } from '../../../src/features/tree/list-collections';
import { expandedByFilter, view as mongodbView } from '../../../src/features/tree/mongodb';
import { view as redisView } from '../../../src/features/tree/redis';
import { afterPage, freshScan } from '../../../src/features/tree/scan-namespaces';
import { databasesToList, view as showView, withFilterText } from '../../../src/features/tree/show';
import { freshIsland, type MongoTreeData, type RedisTreeData, type TreeIsland } from '../../../src/features/tree/types';
import { bytes, inputOf, linesOf, mongoConnection, redisConnection } from './context';

const names = (list: readonly string[]) => list.map((name) => ({ name, type: 'collection' }));

const mongo: MongoTreeData = {
  databases: { kind: 'loaded', value: [{ name: 'admin' }, { name: 'media' }, { name: 'secret' }, { name: 'shop' }] },
  contents: {
    admin: { kind: 'loaded', value: contentsOf(names(['system.users'])) },
    media: { kind: 'loaded', value: contentsOf(names(['fs.files', 'fs.chunks'])) },
    secret: { kind: 'failed', message: 'not authorized on secret' },
    shop: { kind: 'loaded', value: contentsOf(names(['orders', 'orders_archive', 'users'])) },
  },
  counts: {},
};

function filtered(text: string, more: Partial<TreeIsland> = {}): readonly string[] {
  return linesOf(
    mongodbView(inputOf({ island: { mongodb: mongo, filter: { open: true, text }, ...more } }), mongoConnection()),
  );
}

describe('tree.filter', () => {
  it('follows the text 300 milliseconds after the last key typed', () => {
    expect(filterDelayMs).toBe(300);
  });

  it('typing ord shows shop expanded with orders and orders_archive only', () => {
    expect(filtered('ord')).toEqual(['shop', 'orders', 'orders_archive']);
  });

  it('typing shop shows shop with all its collections', () => {
    expect(filtered('shop')).toEqual(['shop', 'orders', 'orders_archive', 'users']);
  });

  it('a database is shown when one of its buckets matches', () => {
    expect(filtered('fs')).toEqual(['media', 'fs', 'fs.chunks', 'fs.files']);
  });

  it('nothing matching reads Nothing matches "<text>" under Databases', () => {
    expect(filtered('zzz')).toEqual(['Nothing matches "zzz"']);
  });

  it('a database shown for its name whose collections do not match reads No collections match "<text>"', () => {
    const empty = {
      ...mongo,
      contents: { ...mongo.contents, shop: { kind: 'loaded', value: { buckets: [], entries: [] } } as const },
    };
    expect(
      linesOf(
        mongodbView(inputOf({ island: { mongodb: empty, filter: { open: true, text: 'shop' } } }), mongoConnection()),
      ),
    ).toEqual(['shop', 'No collections match "shop"']);
  });

  it('a database whose collections cannot be listed is shown only for its own name, with no error', () => {
    expect(filtered('secret')).toEqual(['secret']);
    expect(filtered('orders')).not.toContain('secret');
  });

  it('an empty field shows everything; the databases the filter expanded stay expanded', () => {
    expect(filtered('')).toEqual(['admin', 'media', 'secret', 'shop']);
    const input = inputOf({ island: { mongodb: mongo, filter: { open: true, text: 'ord' } } });
    const kept = expandedAfterClearing(input.island, expandedByFilter(input));
    expect(kept).toEqual(['database:shop']);
    expect(filtered('', { expanded: kept })).toEqual([
      'admin',
      'media',
      'secret',
      'shop',
      'orders',
      'orders_archive',
      'users',
    ]);
  });

  it('Redis: a database is shown for its name or one of its namespaces; only databases already expanded are looked into', () => {
    const scan = {
      scan: {
        ...afterPage(freshScan, { cursor: '0', keys: bytes('orders:2024:1', 'orders:2024:2', 'users:1', 'users:2') }),
      },
    };
    const redis: RedisTreeData = {
      databases: {
        kind: 'loaded',
        value: {
          count: 16,
          databases: Array.from({ length: 16 }, (_, number) => ({
            number,
            keys: number < 2 ? 4 : 0,
            expires: 0,
            averageTtlMs: 0,
          })),
        },
      },
      scans: { '0': scan, '1': scan },
    };
    const lines = (text: string) =>
      linesOf(
        redisView(
          inputOf({
            connections: [redisConnection()],
            island: { redis, expanded: ['redis-database:0'], filter: { open: true, text } },
          }),
          redisConnection(),
        ),
      );
    expect(lines('2024')).toEqual(['db0', 'orders', '2024']);
    expect(lines('db1')).toEqual(['db1', '14 empty databases']);
    expect(lines('nothing')).toEqual(['Nothing matches "nothing"']);
  });

  it('the field has the placeholder and the hint of the engine, and Filter is on while a filter applies', () => {
    const mongoField = view(inputOf({ island: { filter: { open: true, text: '' } } }), 'mongodb');
    expect([mongoField.placeholder, mongoField.hint, mongoField.on]).toEqual([
      'e.g. orders, shop, shop.ord',
      'Part of a database or collection name, or database.collection; empty shows everything',
      false,
    ]);
    const redisField = view(inputOf({ island: { filter: { open: false, text: 'db1' } } }), 'redis');
    expect([redisField.placeholder, redisField.hint, redisField.on, redisField.open]).toEqual([
      'e.g. orders, db1, orders:2024',
      'Part of a database or namespace name; empty shows everything',
      true,
      true,
    ]);
    expect(redisField.clear).toMatchObject({ label: 'Clear filter', action: 'clear-filter' });
  });

  it('Pinned and Pages of are not filtered', () => {
    const shown = showView(
      inputOf({
        pins: [{ kind: 'collection', database: 'other', collection: 'zebra' }],
        island: { mongodb: mongo, filter: { open: true, text: 'ord' } },
      }),
    );
    const lines = shown.kind === 'tree' ? linesOf(shown.items) : [];
    expect(lines).toContain('zebra');
    expect(lines).toContain('Monitor');
  });

  it('the text applied is kept; emptied, the databases it showed expanded stay expanded', () => {
    const typed = withFilterText(inputOf({ island: { mongodb: mongo } }), 'ord');
    expect([typed.filter.text, typed.expanded]).toEqual(['ord', []]);
    const emptied = withFilterText(inputOf({ island: typed }), '');
    expect([emptied.filter.text, emptied.expanded]).toEqual(['', ['database:shop']]);
  });

  it('asks for the collections of every database not read yet, and none without a text', () => {
    const island: TreeIsland = {
      ...freshIsland,
      mongodb: { ...mongo, contents: { shop: mongo.contents['shop']!, secret: mongo.contents['secret']! } },
      filter: { open: true, text: 'ord' },
    };
    expect(databasesToList(island)).toEqual(['admin', 'media']);
    expect(databasesToList({ ...island, filter: { open: true, text: ' ' } })).toEqual([]);
    expect(databasesToList({ ...freshIsland, filter: { open: true, text: 'ord' } })).toEqual([]);
  });
});
