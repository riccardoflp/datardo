import { describe, expect, it } from 'vitest';
import { indexesAtOnce, nextRequests, parse, readProgress, request } from '../../../src/features/structure/read';
import type { ConnectionRequest, Json, MongoRequest } from '../../../src/shared/engine-request';
import { mongoReply } from '../connection/replies';
import { contextWith, int } from './build';

const args = { connection: 'c-dev', database: 'shop' };

/** What a request asks: `listCollections`, `hello`, `config`, `listIndexes orders`, `search orders`. */
function asked(each: ConnectionRequest): string {
  const sent = each.request as MongoRequest;
  if (sent.method === 'runCommand') {
    return 'hello';
  }
  if (sent.database === 'config') {
    return 'config';
  }
  if (sent.method === 'aggregate') {
    return `search ${sent.collection ?? ''}`;
  }
  return sent.method === 'listIndexes' ? `listIndexes ${sent.collection ?? ''}` : sent.method;
}

/** A server that answers each request with `answer`, read as the runner does; every batch, and every reply. */
function readWith(answer: (what: string) => unknown): { batches: readonly (readonly string[])[]; replies: unknown[] } {
  const first = request(contextWith('structure.read'), args);
  if (first.kind !== 'engine') {
    throw new Error('Expected engine requests.');
  }
  const batches: string[][] = [];
  const replies: unknown[] = [];
  let batch: readonly ConnectionRequest[] = first.requests;
  while (batch.length > 0) {
    const names = batch.map(asked);
    batches.push(names);
    replies.push(...names.map(answer));
    batch = nextRequests(args, replies);
  }
  return { batches, replies };
}

function listing(...collections: readonly (readonly [string, string?])[]): Json {
  return collections.map(([name, type]) => ({ name, type: type ?? 'collection', options: {} }));
}

const idIndex = { v: int(2), key: { _id: int(1) }, name: '_id_' };
const noSearch = { kind: 'error', message: "Unrecognized pipeline stage name: '$listSearchIndexes'", code: 40324 };

describe('structure.read', () => {
  it('reads the recorded database of MongoDB 8.2: system collections left out, views not asked for indexes', () => {
    const replies = mongoReply('mongodb-8.2-structure-shop') as unknown as readonly unknown[];
    const read = parse(replies, { connection: 'c-dev', database: 'structure-record' });
    if (read.kind !== 'structure') {
      throw new Error(read.message);
    }
    const { collections, search, sharded } = read.structure;
    expect(collections.map((each) => [each.name, each.type])).toEqual([
      ['big', 'view'],
      ['metrics', 'timeseries'],
      ['orders', 'collection'],
      ['recent', 'view'],
      ['users', 'collection'],
    ]);
    expect(search).toBe('unsupported');
    expect(sharded).toBe(false);
    const byName = new Map(collections.map((each) => [each.name, each]));
    expect(byName.get('orders')?.options).toEqual({
      validator: { total: { $exists: true } },
      validationLevel: 'moderate',
    });
    expect(byName.get('users')?.options).toEqual({ capped: true, size: int(8192), max: int(10) });
    expect(byName.get('metrics')?.options).toEqual({
      expireAfterSeconds: { $numberLong: '60' },
      timeseries: { timeField: 't', metaField: 'm', granularity: 'hours' },
    });
    expect(byName.get('recent')?.options).toEqual({ viewOn: 'orders', pipeline: [{ $sort: { date: int(-1) } }] });
    const orders = byName.get('orders')?.indexes ?? [];
    expect(orders.map((each) => each.name)).toEqual(['byDate', 'email_fr', 'search_text', 'status_1']);
    expect(orders.find((each) => each.name === 'status_1')).toEqual({
      name: 'status_1',
      keys: { status: int(1) },
      options: {},
    });
    expect(orders.find((each) => each.name === 'byDate')?.options).toEqual({ expireAfterSeconds: int(3600) });
    const collation = orders.find((each) => each.name === 'email_fr')?.options['collation'];
    expect(collation).toMatchObject({ locale: 'fr' });
    expect(collation).not.toHaveProperty('version');
    expect(orders.find((each) => each.name === 'search_text')?.keys).toEqual({ body: 'text', title: 'text' });
    expect(byName.get('users')?.indexes).toEqual([]);
    expect(byName.get('recent')?.indexes).toEqual([]);
  });

  it('gives two entries for orders, recent and system.views, and asks the indexes of orders only', () => {
    const { batches } = readWith((what) =>
      what === 'listCollections'
        ? listing(['orders'], ['recent', 'view'], ['system.views'])
        : what === 'hello'
          ? { isWritablePrimary: true }
          : what.startsWith('listIndexes')
            ? [idIndex]
            : noSearch,
    );
    expect(batches).toEqual([['listCollections', 'hello'], ['listIndexes orders'], ['search orders']]);
  });

  it('never makes the index _id_ part of a structure', () => {
    const { replies } = readWith((what) =>
      what === 'listCollections'
        ? listing(['orders'])
        : what === 'hello'
          ? {}
          : what.startsWith('listIndexes')
            ? [idIndex, { v: int(2), key: { a: int(1) }, name: 'a_1' }]
            : [],
    );
    const read = parse(replies, args);
    expect(read.kind === 'structure' && read.structure.collections[0]?.indexes.map((each) => each.name)).toEqual([
      'a_1',
    ]);
  });

  it('asks the indexes of no more than 8 collections at the same time, and says how far it is', () => {
    const names = Array.from({ length: 20 }, (_each, at) => [`c${String(at).padStart(2, '0')}`] as const);
    const { batches, replies } = readWith((what) =>
      what === 'listCollections'
        ? listing(...names)
        : what === 'hello'
          ? {}
          : what.startsWith('search')
            ? noSearch
            : [],
    );
    const indexBatches = batches.filter((batch) => batch.some((what) => what.startsWith('listIndexes')));
    expect(indexBatches.map((batch) => batch.length)).toEqual([indexesAtOnce, indexesAtOnce, 4]);
    expect(readProgress(replies.slice(0, 2))).toEqual({ done: 0, total: 20 });
    expect(readProgress(replies.slice(0, 10))).toEqual({ done: 8, total: 20 });
    expect(readProgress(replies)).toEqual({ done: 20, total: 20 });
    expect(readProgress([])).toBeUndefined();
  });

  it('asks the first collection only for search indexes on a server without search', () => {
    const { batches, replies } = readWith((what) =>
      what === 'listCollections'
        ? listing(['a'], ['b'], ['c'], ['m', 'timeseries'])
        : what === 'hello'
          ? {}
          : what.startsWith('search')
            ? noSearch
            : [],
    );
    expect(batches.flat().filter((what) => what.startsWith('search'))).toEqual(['search a']);
    const read = parse(replies, args);
    expect(read.kind === 'structure' && read.structure.search).toBe('unsupported');
  });

  it('reads the search indexes of every collection that is neither a view nor a time series, sorted by name', () => {
    const { batches, replies } = readWith((what) =>
      what === 'listCollections'
        ? listing(['a'], ['b'], ['m', 'timeseries'], ['v', 'view'])
        : what === 'hello'
          ? {}
          : what === 'search a'
            ? [
                { name: 'zeta', type: 'search', latestDefinition: { mappings: { dynamic: true } } },
                { name: 'alpha', type: 'vectorSearch', latestDefinition: { fields: [] } },
              ]
            : [],
    );
    expect(batches.flat().filter((what) => what.startsWith('search'))).toEqual(['search a', 'search b']);
    const read = parse(replies, args);
    if (read.kind !== 'structure') {
      throw new Error(read.message);
    }
    expect(read.structure.search).toBe('ok');
    expect(read.structure.collections[0]?.searchIndexes).toEqual([
      { name: 'alpha', type: 'vectorSearch', definition: { fields: [] } },
      { name: 'zeta', type: 'search', definition: { mappings: { dynamic: true } } },
    ]);
    expect(read.structure.collections[2]?.searchIndexes).toBeUndefined();
  });

  it('keeps the reason when the search indexes fail for another reason', () => {
    const { replies } = readWith((what) =>
      what === 'listCollections'
        ? listing(['a'], ['b'])
        : what === 'hello'
          ? {}
          : what.startsWith('search')
            ? { kind: 'error', message: 'not authorized on shop to execute command', code: 13 }
            : [],
    );
    expect(parse(replies, args)).toMatchObject({
      kind: 'structure',
      structure: { search: 'error', searchError: 'not authorized on shop to execute command' },
    });
  });

  it('reads the shard keys through a mongos, with the first indexes', () => {
    const { batches, replies } = readWith((what) =>
      what === 'listCollections'
        ? listing(['orders'], ['users'])
        : what === 'hello'
          ? { msg: 'isdbgrid' }
          : what === 'config'
            ? [
                { _id: 'shop.orders', key: { region: int(1) } },
                { _id: 'shop.users', key: { _id: 'hashed' }, unique: true },
              ]
            : what.startsWith('search')
              ? noSearch
              : [],
    );
    expect(batches[1]).toEqual(['config', 'listIndexes orders', 'listIndexes users']);
    const read = parse(replies, args);
    if (read.kind !== 'structure') {
      throw new Error(read.message);
    }
    expect(read.structure.sharded).toBe(true);
    expect(read.structure.collections.map((each) => each.shardKey)).toEqual([
      { key: { region: int(1) } },
      { key: { _id: 'hashed' }, unique: true },
    ]);
  });

  it('asks config.collections for the database alone', () => {
    const { replies } = readWith((what) => (what === 'listCollections' ? [] : { msg: 'isdbgrid' }));
    expect(replies).toHaveLength(3);
    const first = request(contextWith('structure.read'), { connection: 'c-dev', database: 'a.b' });
    expect(first.kind).toBe('engine');
    const config = nextRequests({ connection: 'c-dev', database: 'a.b' }, [[], { msg: 'isdbgrid' }])[0];
    expect((config?.request as MongoRequest).arguments).toEqual([
      { _id: { $regularExpression: { pattern: '^a\\.b\\.', options: '' } }, dropped: { $ne: true } },
    ]);
  });

  it('does not read config.collections on a replica set', () => {
    const { batches } = readWith((what) =>
      what === 'listCollections' ? listing(['orders']) : what === 'hello' ? { setName: 'rs0' } : noSearch,
    );
    expect(batches.flat()).not.toContain('config');
  });

  it('gives a structure without shard keys and no error when config.collections cannot be read', () => {
    const { replies } = readWith((what) =>
      what === 'listCollections'
        ? listing(['orders'])
        : what === 'hello'
          ? { msg: 'isdbgrid' }
          : what === 'config'
            ? { kind: 'error', message: 'not authorized on config', code: 13 }
            : what.startsWith('search')
              ? noSearch
              : [],
    );
    const read = parse(replies, args);
    expect(read).toMatchObject({ kind: 'structure', structure: { sharded: false } });
    expect(read.kind === 'structure' && read.structure.collections[0]?.shardKey).toBeUndefined();
  });

  it('treats a hello that fails as not sharded', () => {
    const { batches } = readWith((what) =>
      what === 'listCollections' ? listing(['orders']) : what === 'hello' ? new Error('hello failed') : noSearch,
    );
    expect(batches.flat()).not.toContain('config');
  });

  it("gives the server's message and no result when the indexes of a collection cannot be listed", () => {
    const { batches, replies } = readWith((what) =>
      what === 'listCollections'
        ? listing(...Array.from({ length: 10 }, (_each, at) => [`c${String(at)}`] as const))
        : what === 'hello'
          ? {}
          : { kind: 'error', message: 'not authorized on shop to execute command { listIndexes: "c0" }', code: 13 },
    );
    expect(batches).toHaveLength(2);
    expect(parse(replies, args)).toEqual({
      kind: 'error',
      message: 'not authorized on shop to execute command { listIndexes: "c0" }',
    });
  });

  it("fails with the server's message when the collections cannot be listed", () => {
    const { batches, replies } = readWith((what) =>
      what === 'listCollections' ? { kind: 'error', message: 'not authorized', code: 13 } : {},
    );
    expect(batches).toHaveLength(1);
    expect(parse(replies, args)).toEqual({ kind: 'error', message: 'not authorized' });
  });

  it('reads no document and writes nothing', () => {
    const { batches } = readWith((what) =>
      what === 'listCollections' ? listing(['orders']) : what === 'hello' ? { msg: 'isdbgrid' } : [],
    );
    const first = request(contextWith('structure.read'), args);
    const methods = first.kind === 'engine' ? first.requests.map((each) => (each.request as MongoRequest).method) : [];
    expect(methods).toEqual(['listCollections', 'runCommand']);
    expect(batches.flat().sort()).toEqual([
      'config',
      'hello',
      'listCollections',
      'listIndexes orders',
      'search orders',
    ]);
  });
});
