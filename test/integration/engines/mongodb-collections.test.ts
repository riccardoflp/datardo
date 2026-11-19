/**
 * The methods of a collection the MongoDB engine carries out against a real server (testing.md): `findOneAnd…`,
 * `bulkWrite`, `drop`, `renameCollection`, `getIndexes` and `stats`, every value keeping its BSON type, a failure that
 * says what failed and which operations, and a method the engine does not know.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testServers } from '../servers';
import { int, testClient, type TestClient } from './client';

const servers = testServers();
const database = 'engine_collections';
let client: TestClient;

const typed = {
  _id: int(1),
  int: int(7),
  long: { $numberLong: '9007199254740993' },
  decimal: { $numberDecimal: '0.10' },
  bytes: { $binary: { base64: '/wBB', subType: '00' } },
  when: { $date: { $numberLong: '1700000000000' } },
};

beforeAll(async () => {
  client = await testClient(servers.mongoReplicaSet, database);
  await client.send({ method: 'dropDatabase', arguments: [] });
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await client.send({ collection: 'orders', method: 'deleteMany', arguments: [{}] });
  await client.send({ collection: 'orders', method: 'insertOne', arguments: [typed] });
});

describe('the MongoDB engine: findOneAndUpdate, findOneAndReplace, findOneAndDelete', () => {
  it('give the document before, or after with returnNewDocument, its types kept, and null when none matches', async () => {
    const before = await client.send({
      collection: 'orders',
      method: 'findOneAndUpdate',
      arguments: [{ _id: int(1) }, { $set: { status: 'paid' } }],
    });
    expect(before).toEqual(typed);
    const after = await client.send({
      collection: 'orders',
      method: 'findOneAndUpdate',
      arguments: [{ _id: int(1) }, { $inc: { int: int(1) } }, { returnNewDocument: true }],
    });
    expect(after).toEqual({ ...typed, int: int(8), status: 'paid' });
    const none = await client.send({
      collection: 'orders',
      method: 'findOneAndUpdate',
      arguments: [{ _id: int(2) }, { $set: { status: 'paid' } }],
    });
    expect(none).toBeNull();
  });

  it('replace and delete one document, and give it back', async () => {
    const replacement = { long: { $numberLong: '5' }, double: { $numberDouble: '5.0' } };
    const replaced = await client.send({
      collection: 'orders',
      method: 'findOneAndReplace',
      arguments: [{ _id: int(1) }, replacement, { returnDocument: 'after' }],
    });
    expect(replaced).toEqual({ _id: int(1), ...replacement });
    const deleted = await client.send({
      collection: 'orders',
      method: 'findOneAndDelete',
      arguments: [{ _id: int(1) }],
    });
    expect(deleted).toEqual({ _id: int(1), ...replacement });
    expect(await client.send({ collection: 'orders', method: 'find', arguments: [{}] })).toEqual([]);
  });
});

describe('the MongoDB engine: bulkWrite', () => {
  it('gives the counts and the _ids of mongosh, and the documents keep their types', async () => {
    // A Double _id stays a Double in upsertedIds, though the counts are read with their values promoted.
    const double3 = { $numberDouble: '3.0' };
    const reply = await client.send({
      collection: 'orders',
      method: 'bulkWrite',
      arguments: [
        [
          { insertOne: { document: { _id: int(2), total: { $numberDecimal: '9.99' } } } },
          { replaceOne: { filter: { _id: double3 }, replacement: { n: int(3) }, upsert: true } },
          { updateOne: { filter: { _id: int(1) }, update: { $set: { status: 'paid' } } } },
          { deleteOne: { filter: { _id: int(9) } } },
        ],
        { ordered: false },
      ],
    });
    expect(reply).toEqual({
      acknowledged: true,
      insertedCount: int(1),
      insertedIds: { '0': int(2) },
      matchedCount: int(1),
      modifiedCount: int(1),
      deletedCount: int(0),
      upsertedCount: int(1),
      upsertedIds: { '1': double3 },
    });
    const found = await client.send({ collection: 'orders', method: 'findOne', arguments: [{ _id: int(2) }] });
    expect(found).toEqual({ _id: int(2), total: { $numberDecimal: '9.99' } });
  });

  it('a failure says which operations failed, with the code of the server', async () => {
    const error = await client.failure({
      collection: 'orders',
      method: 'bulkWrite',
      arguments: [
        [{ insertOne: { document: { _id: int(5) } } }, { insertOne: { document: typed } }],
        { ordered: false },
      ],
    });
    expect(error?.message).toMatch(/E11000 duplicate key/);
    expect(error?.['code']).toBe(11000);
    expect(error?.['failedOperations']).toEqual([1]);
    const many = await client.failure({
      collection: 'orders',
      method: 'insertMany',
      arguments: [[typed, { _id: int(6) }, typed], { ordered: false }],
    });
    expect(many?.['failedOperations']).toEqual([0, 2]);
  });
});

describe('the MongoDB engine: drop, renameCollection, getIndexes, stats', () => {
  it('renames a collection, drops it, and lists its indexes and statistics', async () => {
    await client.send({ collection: 'moved', method: 'drop', arguments: [] });
    expect(await client.send({ collection: 'orders', method: 'renameCollection', arguments: ['moved'] })).toEqual({
      ok: int(1),
    });
    const names = (await client.send({ method: 'getCollectionNames', arguments: [] })) as string[];
    expect(names).toContain('moved');
    expect(names).not.toContain('orders');
    const indexes = (await client.send({ collection: 'moved', method: 'getIndexes', arguments: [] })) as unknown[];
    expect(indexes).toEqual([expect.objectContaining({ name: '_id_', key: { _id: int(1) } })]);
    const stats = (await client.send({ collection: 'moved', method: 'stats', arguments: [] })) as Record<
      string,
      unknown
    >;
    expect(stats['ns']).toBe(`${database}.moved`);
    expect(await client.send({ collection: 'moved', method: 'drop', arguments: [] })).toBe(true);
    expect(await client.send({ method: 'getCollectionNames', arguments: [] })).not.toContain('moved');
  });

  it('renameCollection onto a collection that exists needs dropTarget', async () => {
    await client.send({ collection: 'other', method: 'insertOne', arguments: [{ _id: int(1) }] });
    const error = await client.failure({ collection: 'orders', method: 'renameCollection', arguments: ['other'] });
    expect(error?.message).toMatch(/target namespace exists/);
    expect(error?.['codeName']).toBe('NamespaceExists');
    await client.send({ collection: 'orders', method: 'renameCollection', arguments: ['other', true] });
    expect(await client.send({ collection: 'other', method: 'findOne', arguments: [{}] })).toEqual(typed);
    await client.send({ collection: 'other', method: 'renameCollection', arguments: ['orders'] });
  });
});

describe('the MongoDB engine: a method it does not know', () => {
  it('fails, and says so', async () => {
    const error = await client.failure({ collection: 'orders', method: 'mapReduce', arguments: [] });
    expect(error?.message).toBe('Datardo cannot call mapReduce on MongoDB yet.');
    const onDatabase = await client.failure({ method: 'drop', arguments: [] });
    expect(onDatabase?.message).toBe('Datardo cannot call drop on MongoDB yet.');
  });
});
