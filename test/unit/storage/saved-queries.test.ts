import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MySavedQuery, QueryText, RecentQuery } from '../../../src/features/saved-query/types';
import {
  connectionStateFile,
  recentQueriesIn,
  withCollectionRenamed as withStateRenamed,
  withRecentQueries,
  type StoredRecentQuery,
} from '../../../src/storage/connection-state';
import {
  queriesOfCollection,
  savedQueriesFile,
  withCollectionQueries,
  withCollectionRenamed,
  type StoredQueryText,
  type StoredSavedQuery,
} from '../../../src/storage/saved-queries';
import { Store, type JsonObject } from '../../../src/storage/store';

const paid: StoredSavedQuery = {
  name: 'Paid',
  description: 'Since the first',
  database: 'shop',
  collection: 'orders',
  query: { kind: 'find', filter: '{ status: "paid" }', sort: '', projection: '' },
  at: 1_763_000_000_000,
};

const stages: StoredSavedQuery = {
  name: 'Stages',
  database: 'shop',
  collection: 'orders',
  query: {
    kind: 'pipeline',
    stages: [
      { name: '$match', body: '{}', enabled: true },
      { name: '$sort', body: '{ a: 1 }', enabled: false },
    ],
  },
  at: 1_763_000_000_001,
};

const where = { database: 'shop', collection: 'orders' };

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-saved-queries-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function stored(path: string, content: unknown): Promise<void> {
  const [kind, name] = path.split('/') as [string, string];
  await mkdir(join(folder, kind), { recursive: true });
  await writeFile(join(folder, kind, name), typeof content === 'string' ? content : JSON.stringify(content));
}

describe('the saved queries file', () => {
  it('has the shapes of the features, which src/storage may not import (R1.3)', () => {
    // These compile only while the shapes stay the same: a query of the features is a stored query, and back.
    const toStored = (query: QueryText): StoredQueryText => query;
    const fromStored = (query: StoredQueryText): QueryText => query;
    const mine = ({ place: _place, ...rest }: MySavedQuery): StoredSavedQuery => rest;
    const recent = (value: RecentQuery): StoredRecentQuery => value;
    expect(fromStored(toStored(paid.query))).toBe(paid.query);
    expect([mine, recent]).toHaveLength(2);
  });

  it('writes the queries for me at version 1 in saved-queries/<id>.json and reads them back', async () => {
    const store = new Store(folder, savedQueriesFile('c-local'));
    expect(await store.load()).toEqual({ kind: 'missing' });
    store.set(withCollectionQueries(store.get(), where, [paid, stages]));
    await store.flush();
    const object = JSON.parse(await readFile(join(folder, 'saved-queries', 'c-local.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(Object.keys(object)[0]).toBe('version');
    expect(object['version']).toBe(1);
    const again = new Store(folder, savedQueriesFile('c-local'));
    expect(await again.load()).toEqual({ kind: 'current' });
    expect(queriesOfCollection(again.get(), 'shop', 'orders')).toEqual([paid, stages]);
    expect(queriesOfCollection(again.get(), 'shop', 'sales')).toEqual([]);
  });

  it('keeps the fields it does not know, on each query and at the top, and a query it cannot read', async () => {
    await stored('saved-queries/c-local.json', {
      version: 1,
      future: 'kept',
      queries: [{ ...paid, color: 'blue' }, { name: 'Broken' }],
    });
    const store = new Store(folder, savedQueriesFile('c-local'));
    await store.load();
    store.set(withCollectionQueries(store.get(), where, [{ ...paid, at: 2 }]));
    await store.flush();
    const object = JSON.parse(await readFile(join(folder, 'saved-queries', 'c-local.json'), 'utf8')) as {
      future: string;
      queries: Record<string, unknown>[];
    };
    expect(object.future).toBe('kept');
    expect(object.queries).toEqual([{ ...paid, at: 2, color: 'blue' }, { name: 'Broken' }]);
  });

  it('replaces the queries of one collection only', () => {
    const other = { ...paid, collection: 'sales' };
    const file = withCollectionQueries(
      withCollectionQueries(savedQueriesFile('c-local').empty(), where, [paid]),
      { database: 'shop', collection: 'sales' },
      [other],
    );
    expect(withCollectionQueries(file, where, []).queries).toEqual([other]);
  });

  it('carries the queries of a collection to its new name', () => {
    const file = withCollectionQueries(savedQueriesFile('c-local').empty(), where, [paid]);
    expect(
      queriesOfCollection(withCollectionRenamed(file, 'shop', { from: 'orders', to: 'sales' }), 'shop', 'sales'),
    ).toEqual([{ ...paid, collection: 'sales' }]);
  });

  it('sets a damaged file aside and reads it as empty, and never writes a file of a newer version', async () => {
    await stored('saved-queries/c-local.json', '{ not json');
    const damaged = new Store(folder, savedQueriesFile('c-local'));
    expect((await damaged.load()).kind).toBe('damaged');
    expect(damaged.get().queries).toEqual([]);
    expect((await readdir(join(folder, 'saved-queries'))).some((name) => name.includes('.damaged-'))).toBe(true);
    await stored('saved-queries/c-new.json', { version: 2, queries: [paid] });
    const newer = new Store(folder, savedQueriesFile('c-new'));
    expect(await newer.load()).toEqual({ kind: 'newer', version: 2 });
    expect(newer.get().queries).toEqual([paid]);
    expect(newer.set(newer.get())).toBe(false);
  });

  it('refuses an id that cannot name a file', () => {
    expect(() => savedQueriesFile('../x')).toThrow();
  });
});

describe('the state file of a connection', () => {
  const recent: StoredRecentQuery = { query: paid.query, at: 5 };

  it('writes the recent queries of a collection at version 1 in state/<id>.json and reads them back, newest first', async () => {
    const store = new Store(folder, connectionStateFile('c-local'));
    await store.load();
    store.set(withRecentQueries(store.get(), where, [recent, { query: stages.query, at: 4 }]));
    await store.flush();
    const text = await readFile(join(folder, 'state', 'c-local.json'), 'utf8');
    expect(JSON.parse(text)).toEqual({
      version: 1,
      collections: { shop: { orders: { recentQueries: [recent, { query: stages.query, at: 4 }] } } },
    });
    const again = new Store(folder, connectionStateFile('c-local'));
    await again.load();
    expect(recentQueriesIn(again.get(), 'shop', 'orders')).toEqual([recent, { query: stages.query, at: 4 }]);
  });

  it('keeps every other part of the file, and removes what an empty list leaves empty', async () => {
    await stored('state/c-local.json', {
      version: 1,
      console: ['PING'],
      collections: {
        shop: { orders: { columns: { hidden: ['a'] }, recentQueries: [recent] }, sales: { recentQueries: [recent] } },
      },
    });
    const store = new Store(folder, connectionStateFile('c-local'));
    await store.load();
    const cleared = withRecentQueries(store.get(), where, []);
    expect(cleared).toEqual({
      console: ['PING'],
      collections: { shop: { orders: { columns: { hidden: ['a'] } }, sales: { recentQueries: [recent] } } },
    });
    expect(
      withRecentQueries(withRecentQueries(cleared, { database: 'shop', collection: 'sales' }, []), where, []),
    ).toEqual({
      console: ['PING'],
      collections: { shop: { orders: { columns: { hidden: ['a'] } } } },
    });
  });

  it('keeps 50 and leaves out what is not a recent query', () => {
    const many = Array.from({ length: 60 }, (_, index) => ({ query: paid.query, at: index }));
    const state = withRecentQueries({}, where, many);
    expect(recentQueriesIn(state, 'shop', 'orders')).toHaveLength(50);
    const odd: JsonObject = {
      collections: {
        shop: {
          orders: {
            recentQueries: [
              { query: { kind: 'find', filter: '{ status: "paid" }', sort: '', projection: '' }, at: 5 },
              { at: 1 },
              'x',
            ],
          },
        },
      },
    };
    expect(recentQueriesIn(odd, 'shop', 'orders')).toEqual([recent]);
  });

  it('carries the recent queries of a collection to its new name', () => {
    const state = withRecentQueries({}, where, [recent]);
    const renamed = withStateRenamed(state, 'shop', { from: 'orders', to: 'sales' });
    expect(recentQueriesIn(renamed, 'shop', 'sales')).toEqual([recent]);
    expect(recentQueriesIn(renamed, 'shop', 'orders')).toEqual([]);
  });

  it('sets aside a file whose collections are not an object', async () => {
    await stored('state/c-local.json', { version: 1, collections: [] });
    expect((await new Store(folder, connectionStateFile('c-local')).load()).kind).toBe('damaged');
  });
});
