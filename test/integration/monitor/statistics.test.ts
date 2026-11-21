/**
 * The Stats section and what the Replication and Sharding sections say of a standalone server, against a mongod of
 * their own (M31): `serverStatus`, the databases and their `dbStats` one batch after the other, the collections of a
 * database with their `$collStats`; the sentence of a standalone server; the controls refused where they cannot run.
 */
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PartRead } from '../../../src/features/monitor/parts/failure';
import { collectionBatches, type CollectionStatsRead } from '../../../src/features/monitor/read-collection-stats';
import { databaseBatches, type DatabaseStatsRead } from '../../../src/features/monitor/read-database-stats';
import type { ReplicationRead } from '../../../src/features/monitor/read-replication';
import type { ServerStatus } from '../../../src/features/monitor/read-server-status';
import type { ShardingRead } from '../../../src/features/monitor/read-sharding';
import type { IntentResult } from '../../../src/shared/bridge';
import { ownServer, readOnlyId, type OwnServer } from './own-server';

const database = 'monitor_stats_it';
let server: OwnServer;
let client: MongoClient;
// Both are made in beforeAll, which fails the file when they cannot be.

function readOf(result: IntentResult): unknown {
  if (result.kind !== 'read') {
    throw new Error(`Expected a read, got ${JSON.stringify(result)}`);
  }
  return result.result;
}

beforeAll(async () => {
  server = await ownServer();
  client = await MongoClient.connect(server.uri);
  const db = client.db(database);
  await db
    .collection<{ _id: number; total: number }>('orders')
    .insertMany(Array.from({ length: 300 }, (_, index) => ({ _id: index, total: index })));
  await db.collection('orders').createIndex({ total: 1 });
  await db.collection<{ _id: number; name: string }>('customers').insertOne({ _id: 1, name: 'Ada' });
  await db.createCollection('paid', { viewOn: 'orders', pipeline: [{ $match: { total: { $gt: 100 } } }] });
  for (let index = 0; index < 9; index += 1) {
    await client
      .db(`${database}_${String(index)}`)
      .collection('items')
      .insertOne({ index });
  }
}, 120_000);

afterAll(async () => {
  await client.close();
  await server.close();
});

describe('monitor.read-server-status', () => {
  it('reads the host, the version, the connections and the counters of operations', async () => {
    const read = readOf(
      await server.start('monitor.read-server-status', { connection: 'c-monitor', at: 1000 }),
    ) as PartRead<ServerStatus>;
    expect(read.kind).toBe('read');
    const status = read.kind === 'read' ? read.value : undefined;
    expect(status?.version).toMatch(/^\d+\.\d+/u);
    expect(status?.connections.current).toBeGreaterThan(0);
    expect(status?.counters.insert).toBeGreaterThanOrEqual(310);
    expect(status?.at).toBe(1000);
  });
});

describe('monitor.read-database-stats', () => {
  it('lists the databases, then reads their dbStats 8 at a time', async () => {
    const on = { connection: 'c-monitor' };
    const list = readOf(await server.start('monitor.read-database-stats', on)) as DatabaseStatsRead;
    const names = list.step === 'list' && list.databases.kind === 'read' ? list.databases.value : [];
    expect(names).toEqual(expect.arrayContaining([database, `${database}_8`, 'admin']));
    const batches = databaseBatches(names);
    expect(batches.every((batch) => batch.length <= 8)).toBe(true);
    expect(batches.length).toBeGreaterThanOrEqual(2);
    const stats = [];
    for (const batch of batches) {
      const read = readOf(
        await server.start('monitor.read-database-stats', { ...on, step: 'stats', databases: [...batch] }),
      ) as DatabaseStatsRead;
      stats.push(...(read.step === 'stats' ? read.stats : []));
    }
    const shop = stats.find((each) => each.name === database);
    // dbStats counts system.views, which holds the view, among the collections, with its one document and index.
    expect(shop?.numbers).toMatchObject({ collections: 3, views: 1, objects: 302, indexes: 4 });
    expect(shop?.numbers?.dataSize).toBeGreaterThan(0);
  });
});

describe('monitor.read-collection-stats', () => {
  it('lists the collections and views, then reads $collStats of the collections and none of the view', async () => {
    const on = { connection: 'c-monitor', database };
    const list = readOf(await server.start('monitor.read-collection-stats', on)) as CollectionStatsRead;
    const entries = list.step === 'list' && list.collections.kind === 'read' ? list.collections.value : [];
    expect([...entries].sort((one, other) => one.name.localeCompare(other.name))).toEqual([
      { name: 'customers', type: 'collection' },
      { name: 'orders', type: 'collection' },
      { name: 'paid', type: 'view' },
    ]);
    const [batch = []] = collectionBatches(entries);
    const read = readOf(
      await server.start('monitor.read-collection-stats', {
        ...on,
        step: 'stats',
        collections: batch.map((each) => ({ ...each })),
      }),
    ) as CollectionStatsRead;
    const stats = read.step === 'stats' ? read.stats : [];
    expect(stats.find((each) => each.name === 'orders')?.numbers).toMatchObject({ count: 300, nindexes: 2 });
    expect(stats.find((each) => each.name === 'paid')).toEqual({ name: 'paid', type: 'view' });
  });
});

describe('monitor.read-replication', () => {
  it('says a standalone server is one, and asks nothing more of it', async () => {
    const read = readOf(
      await server.start('monitor.read-replication', { connection: 'c-monitor', step: 'hello' }),
    ) as ReplicationRead;
    expect(read).toMatchObject({ step: 'hello', server: { kind: 'read', value: { kind: 'standalone' } } });
  });
});

describe('monitor.read-sharding', () => {
  it('says a standalone server is one through hello', async () => {
    const read = readOf(
      await server.start('monitor.read-sharding', { connection: 'c-monitor', step: 'hello' }),
    ) as ShardingRead;
    expect(read).toMatchObject({ step: 'hello', server: { kind: 'read', value: { kind: 'standalone' } } });
  });
});

describe('monitor.step-down', () => {
  it('refuses a standalone server, which has no primary, and a read-only connection', async () => {
    expect(await server.start('monitor.step-down', { connection: 'c-monitor' })).toMatchObject({
      kind: 'refused',
      code: 'monitor.step-down/no-primary',
    });
    expect(await server.start('monitor.step-down', { connection: readOnlyId }, readOnlyId)).toMatchObject({
      kind: 'refused',
      code: 'monitor.step-down/read-only',
    });
    expect(server.dialogs.confirmed).toEqual([]);
  });
});

describe('monitor.set-balancer', () => {
  it('refuses a server that is not a mongos', async () => {
    expect(await server.start('monitor.set-balancer', { connection: 'c-monitor', balancer: 'stop' })).toMatchObject({
      kind: 'refused',
      code: 'monitor.set-balancer/unsupported',
    });
  });
});
