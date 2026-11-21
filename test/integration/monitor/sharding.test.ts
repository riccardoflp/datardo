/**
 * The Sharding section and the tool `sharding_status` against a small sharded cluster of their own (M31): a config
 * server, the shards `shard01` and `shard02` (each a replica set of one member) and a mongos, started from the
 * binaries next to `MONGOMS_SYSTEM_BINARY` on free ports and stopped at the end (`own-deployments.ts`). The file is
 * skipped when there is no mongos next to it. The cluster reads, its events, **Stop balancer…** and **Start
 * balancer…**, and **Disable balancing…** and **Enable balancing…** of a collection.
 */
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PartRead } from '../../../src/features/monitor/parts/failure';
import {
  nextShardingRead,
  nothingSharded,
  shardingOf,
  withShardingReply,
  type ShardingProgress,
} from '../../../src/features/monitor/parts/sharding-reading';
import type { ShardingEvent } from '../../../src/features/monitor/read-sharding-events';
import type { ShardingRead } from '../../../src/features/monitor/read-sharding';
import { shardingForTool } from '../../../src/main/sharding';
import type { IntentResult } from '../../../src/shared/bridge';
import { connectionId } from '../../../src/shared/ids';
import { mongosBinary, ownCluster } from './own-deployments';
import { ownId, ownServer, readOnlyId, type OwnServer } from './own-server';

let server: OwnServer;
let client: MongoClient;
// Both are made in beforeAll, which fails the file when they cannot be.

function readOf(result: IntentResult): unknown {
  if (result.kind !== 'read') {
    throw new Error(`Expected a read, got ${JSON.stringify(result)}`);
  }
  return result.result;
}

/** The reads of a Refresh of the section, one after the other. */
async function readCluster(full = true): Promise<ReturnType<typeof shardingOf>> {
  const input = { connection: ownId, full, at: Date.now() };
  let progress: ShardingProgress = nothingSharded;
  for (let step = nextShardingRead(input, progress); step !== undefined; step = nextShardingRead(input, progress)) {
    progress = withShardingReply(progress, readOf(await server.start('monitor.read-sharding', step)) as ShardingRead);
  }
  return shardingOf(progress);
}

async function balancerMode(): Promise<unknown> {
  return (await client.db('admin').command({ balancerStatus: 1 }))['mode'];
}

async function noBalance(namespace: string): Promise<unknown> {
  const found = await client
    .db('config')
    .collection<{ _id: string; noBalance?: boolean }>('collections')
    .findOne({ _id: namespace });
  return found?.noBalance;
}

describe.runIf(mongosBinary() !== undefined)('a sharded cluster of its own', () => {
  beforeAll(async () => {
    server = await ownServer(ownCluster);
    client = await MongoClient.connect(server.uri);
    const admin = client.db('admin');
    await admin.command({ shardCollection: 'shop.orders', key: { customerId: 'hashed' } });
    await admin.command({ shardCollection: 'shop.users', key: { _id: 1 }, unique: true });
    await admin.command({ addShardToZone: 'shard01', zone: 'east' });
    await client
      .db('shop')
      .collection<{ _id: number; customerId: number }>('orders')
      .insertMany(Array.from({ length: 400 }, (_, index) => ({ _id: index, customerId: index % 40 })));
    await client.db('shop').collection<{ _id: number; name: string }>('users').insertOne({ _id: 1, name: 'Ada' });
  }, 240_000);

  afterAll(async () => {
    await client.close();
    await server.close();
  }, 60_000);

  describe('monitor.read-sharding', () => {
    it('reads the shards, the balancer, the config servers and the sharded collections through the mongos', async () => {
      const { server: kind, cluster } = await readCluster();
      expect(kind).toEqual({ kind: 'read', value: { kind: 'mongos' } });
      expect(cluster?.errors).toEqual([]);
      expect(cluster?.version).toMatch(/^\d+\.\d+/u);
      expect(cluster?.configServer).toMatch(/^cfg\/127\.0\.0\.1:\d+$/u);
      expect(cluster?.balancer?.mode).toBe('full');
      expect(cluster?.routers?.total).toBeGreaterThanOrEqual(1);
      expect(cluster?.shards?.map((shard) => [shard.name, shard.replicaSet, shard.members.length])).toEqual([
        ['shard01', 'shard01', 1],
        ['shard02', 'shard02', 1],
      ]);
      expect(cluster?.shards?.[0]?.zones).toEqual(['east']);
      expect(cluster?.zones).toEqual(['east']);
      const orders = cluster?.collections?.find((each) => each.namespace === 'shop.orders');
      expect(orders).toMatchObject({ key: '{ customerId: "hashed" }', balancing: true, jumbo: 0 });
      expect(orders?.chunks.map(([shard]) => shard).sort()).toEqual(['shard01', 'shard02']);
      expect(orders?.verdict?.compliant).toEqual(expect.any(Boolean));
      const documents = (orders?.data ?? []).reduce((sum, each) => sum + each.count, 0);
      expect(documents).toBe(400);
      expect(cluster?.collections?.find((each) => each.namespace === 'shop.users')?.unique).toBe(true);
    }, 60_000);

    it('asks no verdict of the balancer on a read that is not full', async () => {
      const { cluster } = await readCluster(false);
      expect(cluster?.collections?.every((each) => each.verdict === undefined)).toBe(true);
    }, 60_000);
  });

  describe('monitor.read-sharding-events', () => {
    it('lists the events of shardCollection with Show every events, and filters them by namespace', async () => {
      const on = { connection: ownId, text: 'shop.orders', show: 'every' };
      const read = readOf(await server.start('monitor.read-sharding-events', on)) as PartRead<readonly ShardingEvent[]>;
      const events = read.kind === 'read' ? read.value : [];
      expect(events.some((event) => event.what.startsWith('shardCollection'))).toBe(true);
      expect(events.every((event) => event.namespace === 'shop.orders')).toBe(true);
    }, 30_000);
  });

  describe('monitor.set-balancer', () => {
    it('refuses a read-only connection, sends nothing when the confirmation is closed, stops and starts it', async () => {
      const refused = await server.start(
        'monitor.set-balancer',
        { connection: readOnlyId, balancer: 'stop' },
        readOnlyId,
      );
      expect(refused).toMatchObject({ kind: 'refused', code: 'monitor.set-balancer/read-only' });
      server.dialogs.confirm = false;
      expect(await server.start('monitor.set-balancer', { connection: ownId, balancer: 'stop' })).toEqual({
        kind: 'cancelled',
      });
      server.dialogs.confirm = true;
      expect(await balancerMode()).toBe('full');
      expect(await server.start('monitor.set-balancer', { connection: ownId, balancer: 'stop' })).toEqual({
        kind: 'done',
      });
      expect(await balancerMode()).toBe('off');
      expect(await server.start('monitor.set-balancer', { connection: ownId, balancer: 'start' })).toEqual({
        kind: 'done',
      });
      expect(await balancerMode()).toBe('full');
    }, 60_000);
  });

  describe('monitor.set-collection-balancing', () => {
    it('disables then enables the balancing of shop.users with configureCollectionBalancing', async () => {
      const on = { connection: ownId, namespace: 'shop.users' };
      const refused = await server.start(
        'monitor.set-collection-balancing',
        { ...on, connection: readOnlyId, balancing: 'disable' },
        readOnlyId,
      );
      expect(refused).toMatchObject({ kind: 'refused', code: 'monitor.set-collection-balancing/read-only' });
      expect(await server.start('monitor.set-collection-balancing', { ...on, balancing: 'disable' })).toEqual({
        kind: 'done',
      });
      expect(await noBalance('shop.users')).toBe(true);
      const { cluster } = await readCluster(false);
      expect(cluster?.collections?.find((each) => each.namespace === 'shop.users')?.balancing).toBe(false);
      expect(await server.start('monitor.set-collection-balancing', { ...on, balancing: 'enable' })).toEqual({
        kind: 'done',
      });
      expect(await noBalance('shop.users')).toBe(false);
    }, 60_000);
  });

  describe('mcp.deployment-tools', () => {
    it('answers monitor.sharding for sharding_status with the cluster and its events, and changes nothing', async () => {
      const mode = await balancerMode();
      const reply = await shardingForTool({ connection: 'c-monitor', events: 5 }, (feature, args, connection) =>
        server.start(feature, args, connectionId(connection)),
      );
      expect(reply.shards.map((shard) => shard.name)).toEqual(['shard01', 'shard02']);
      expect(reply.collections.map((each) => each.ns).sort()).toEqual(
        expect.arrayContaining(['shop.orders', 'shop.users']),
      );
      expect(reply.balancer?.enabled).toBe(true);
      expect(reply.errors).toEqual([]);
      expect(await balancerMode()).toBe(mode);
    }, 60_000);
  });
});
