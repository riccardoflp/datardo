/**
 * The methods of indexes and of databases the MongoDB engine carries out against a real server (testing.md): indexes
 * created from key patterns and from descriptions, dropped by name, by key and all at once; search indexes, which a
 * server without Atlas Search refuses with its own message; collections and views created with their options, which
 * keep their BSON types; the statistics and the commands of the admin database; a database dropped.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testServers } from '../servers';
import { int, testClient, type TestClient } from './client';

const servers = testServers();
const database = 'engine_indexes';
let client: TestClient;

beforeAll(async () => {
  client = await testClient(servers.mongoReplicaSet, database);
  await client.send({ method: 'dropDatabase', arguments: [] });
  await client.send({ collection: 'orders', method: 'insertOne', arguments: [{ _id: int(1), status: 'paid' }] });
});

afterAll(async () => {
  await client.send({ method: 'dropDatabase', arguments: [] });
  await client.close();
});

async function indexNames(): Promise<unknown[]> {
  const indexes = (await client.send({ collection: 'orders', method: 'getIndexes', arguments: [] })) as Record<
    string,
    unknown
  >[];
  return indexes.map((each) => each['name']);
}

describe('the MongoDB engine: indexes', () => {
  it('createIndex and createIndexes give the names, and the options keep their types', async () => {
    const filter = { total: { $gt: { $numberDecimal: '0.5' } } };
    expect(
      await client.send({
        collection: 'orders',
        method: 'createIndex',
        arguments: [{ status: int(1), total: int(-1) }, { partialFilterExpression: filter }],
      }),
    ).toBe('status_1_total_-1');
    expect(
      await client.send({
        collection: 'orders',
        method: 'createIndexes',
        arguments: [[{ a: int(1) }, { b: 'text' }], { sparse: true }],
      }),
    ).toEqual(['a_1', 'b_text']);
    const indexes = (await client.send({ collection: 'orders', method: 'getIndexes', arguments: [] })) as Record<
      string,
      unknown
    >[];
    const partial = indexes.find((each) => each['name'] === 'status_1_total_-1');
    expect(partial?.['partialFilterExpression']).toEqual(filter);
    expect(indexes.find((each) => each['name'] === 'a_1')?.['sparse']).toBe(true);
  });

  it('createIndexes takes the descriptions listIndexes gives, as a copy does', async () => {
    const description = { key: { copied: int(1) }, name: 'by_copied', unique: true, collation: { locale: 'fr' } };
    expect(await client.send({ collection: 'orders', method: 'createIndexes', arguments: [[description]] })).toEqual([
      'by_copied',
    ]);
    const indexes = (await client.send({ collection: 'orders', method: 'getIndexes', arguments: [] })) as Record<
      string,
      unknown
    >[];
    expect(indexes.find((each) => each['name'] === 'by_copied')).toMatchObject({
      unique: true,
      key: { copied: int(1) },
    });
  });

  it('dropIndex by name or by key, and dropIndexes drops all but _id_', async () => {
    const byName = (await client.send({ collection: 'orders', method: 'dropIndex', arguments: ['a_1'] })) as Record<
      string,
      unknown
    >;
    expect(byName['ok']).toEqual(int(1));
    await client.send({ collection: 'orders', method: 'dropIndex', arguments: [{ status: int(1), total: int(-1) }] });
    expect(await indexNames()).toEqual(['_id_', 'b_text', 'by_copied']);
    const missing = await client.failure({ collection: 'orders', method: 'dropIndex', arguments: ['nope'] });
    expect(missing?.message).toMatch(/index not found with name \[nope\]/);
    expect(missing?.['code']).toBe(27);
    expect(missing?.['codeName']).toBe('IndexNotFound');
    await client.send({ collection: 'orders', method: 'dropIndexes', arguments: [] });
    expect(await indexNames()).toEqual(['_id_']);
  });

  it('createIndexes without indexes fails, and says what it takes', async () => {
    const error = await client.failure({ collection: 'orders', method: 'createIndexes', arguments: [[]] });
    expect(error?.message).toMatch(/createIndexes takes an array of indexes/);
  });
});

describe('the MongoDB engine: search indexes', () => {
  it('a server without Atlas Search refuses them with its own message', async () => {
    for (const asked of [
      { method: 'createSearchIndex', arguments: ['default', { mappings: { dynamic: true } }] },
      { method: 'createSearchIndexes', arguments: [[{ name: 'one', definition: { mappings: { dynamic: true } } }]] },
      { method: 'updateSearchIndex', arguments: ['default', { mappings: { dynamic: false } }] },
      { method: 'dropSearchIndex', arguments: ['default'] },
      { method: 'getSearchIndexes', arguments: [] },
    ]) {
      const error = await client.failure({ collection: 'orders', ...asked });
      expect(error?.message, asked.method).toMatch(/search/i);
      expect(typeof error?.['code'], asked.method).toBe('number');
    }
  });
});

describe('the MongoDB engine: methods of a database', () => {
  it('createCollection and createView answer { ok: 1 }, and the options keep their types', async () => {
    const validator = { price: { $gte: { $numberDecimal: '0.10' } } };
    const created = (await client.send({
      method: 'createCollection',
      arguments: ['priced', { validator, capped: true, size: { $numberLong: '1048576' } }],
    })) as Record<string, unknown>;
    expect(created['ok']).toEqual(int(1));
    const pipeline = [{ $match: { status: 'paid' } }];
    await client.send({ method: 'createView', arguments: ['paid', 'orders', pipeline] });
    const infos = (await client.send({ method: 'getCollectionInfos', arguments: [{}, {}] })) as Record<
      string,
      Record<string, unknown>
    >[];
    const priced = infos.find((each) => each['name'] === ('priced' as unknown));
    expect(priced?.['options']).toMatchObject({ validator, capped: true });
    const view = infos.find((each) => each['name'] === ('paid' as unknown));
    expect(view).toMatchObject({ type: 'view', options: { viewOn: 'orders', pipeline } });
    expect(await client.send({ method: 'getCollectionNames', arguments: [] })).toEqual([
      'orders',
      'paid',
      'priced',
      'system.views',
    ]);
    const named = await client.send({
      method: 'getCollectionInfos',
      arguments: [{ name: 'paid' }, { nameOnly: true }],
    });
    expect(named).toEqual([{ name: 'paid', type: 'view' }]);
  });

  it('a collection that exists cannot be created again, and the server says so', async () => {
    const error = await client.failure({
      method: 'createCollection',
      arguments: ['orders', { capped: true, size: int(4096) }],
    });
    expect(error?.message).toMatch(/already exists/);
    expect(error?.['codeName']).toBe('NamespaceExists');
  });

  it('stats, serverStatus, hostInfo, currentOp, version, getDBNames and getDBs', async () => {
    const stats = (await client.send({ method: 'stats', arguments: [] })) as Record<string, unknown>;
    expect(stats['db']).toBe(database);
    const status = (await client.send({ method: 'serverStatus', arguments: [] })) as Record<string, unknown>;
    expect(status).toHaveProperty('uptime');
    const host = (await client.send({ method: 'hostInfo', arguments: [] })) as Record<string, unknown>;
    expect(host).toHaveProperty('system');
    const operations = (await client.send({ method: 'currentOp', arguments: [true] })) as Record<string, unknown>;
    expect(Array.isArray(operations['inprog'])).toBe(true);
    expect(await client.send({ method: 'version', arguments: [] })).toMatch(/^\d+\.\d+\.\d+/);
    expect(await client.send({ method: 'getDBNames', arguments: [] })).toContain(database);
    const listed = (await client.send({ method: 'getDBs', arguments: [] })) as Record<string, unknown>;
    expect(Array.isArray(listed['databases'])).toBe(true);
  });

  it('dropDatabase answers { ok: 1, dropped }', async () => {
    await client.send({ database: 'engine_dropped', collection: 'c', method: 'insertOne', arguments: [{}] });
    expect(await client.send({ database: 'engine_dropped', method: 'dropDatabase', arguments: [] })).toMatchObject({
      ok: int(1),
      dropped: 'engine_dropped',
    });
    expect(await client.send({ method: 'getDBNames', arguments: [] })).not.toContain('engine_dropped');
  });
});
