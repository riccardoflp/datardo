import { describe, expect, it } from 'vitest';
import { shardHost } from '../../../src/features/monitor/parts/sharding-records';
import {
  clusterOf,
  collectionSteps,
  completeCluster,
  mergeSharding,
  parse,
  request,
  type ShardingRead,
} from '../../../src/features/monitor/read-sharding';
import type { Json } from '../../../src/shared/engine-request';
import { cluster, contextOn, failed, local, now, recorded, requestsOf } from './context';
import {
  clusterReplies,
  collStatsPerShard,
  compliant,
  helloConfigServer,
  helloMongos,
  helloShardMember,
  imbalanced,
  shardingState,
  shardMap,
} from './sharding-replies';

const context = contextOn('monitor.read-sharding', cluster);
type ClusterStep = Extract<ShardingRead, { readonly step: 'cluster' }>;

function clusterStep(replace: Readonly<Record<number, unknown>> = {}): ClusterStep {
  const read = parse(clusterReplies(replace), { step: 'cluster', at: now });
  if (read.step !== 'cluster') {
    throw new Error('Expected the step cluster.');
  }
  return read;
}

function namesOf(count: number): Json {
  return Array.from({ length: count }, (_, index) => ({
    _id: `shop.c${String(index).padStart(3, '0')}`,
    key: { _id: 1 },
  }));
}

describe('monitor.read-sharding', () => {
  it('sends only hello, and shardingState in a replica set, to a server that is not a mongos', () => {
    const sent = requestsOf(request(context, { connection: local.id }));
    expect(sent.map((each) => each.arguments[0])).toEqual([{ hello: { $numberInt: '1' } }]);
    expect(parse([recorded('hello-standalone')], { step: 'hello' })).toMatchObject({
      server: { kind: 'read', value: { kind: 'standalone' } },
    });
    expect(parse([recorded('hello-replica-set')], { step: 'hello' })).toMatchObject({
      server: { kind: 'read', value: { kind: 'replica-set', me: 'localhost:27017' } },
    });
    const state = requestsOf(request(context, { connection: local.id, step: 'sharding-state' }));
    expect(state.map((each) => each.arguments[0])).toEqual([{ shardingState: { $numberInt: '1' } }]);
    expect(parse([recorded('sharding-state-replica-set')], { step: 'sharding-state', me: 'localhost:27017' })).toEqual({
      step: 'sharding-state',
      server: { kind: 'replica-set', me: 'localhost:27017' },
    });
  });

  it('gives a config server for hello with configsvr: 2', () => {
    expect(parse([helloConfigServer], { step: 'hello' })).toMatchObject({
      server: { kind: 'read', value: { kind: 'config-server', me: 'c1.example.net:27019' } },
    });
  });

  it('gives a member of a shard when shardingState says so, a replica set when it is refused', () => {
    expect(parse([helloShardMember], { step: 'hello' })).toMatchObject({ server: { value: { kind: 'replica-set' } } });
    expect(parse([shardingState], { step: 'sharding-state', me: 'db1.example.net:27017' })).toEqual({
      step: 'sharding-state',
      server: {
        kind: 'shard-member',
        me: 'db1.example.net:27017',
        shard: 'shard01',
        configServer: 'cfg/c1:27019,c2:27019',
      },
    });
    expect(parse([failed('not authorized on admin', 13)], { step: 'sharding-state' })).toEqual({
      step: 'sharding-state',
      server: { kind: 'replica-set' },
    });
    expect(parse([helloMongos], { step: 'hello' })).toMatchObject({ server: { value: { kind: 'mongos' } } });
  });

  it('sends the 13 requests through a mongos, the counts from 24 hours before the read', () => {
    const sent = requestsOf(request(context, { connection: cluster.id, step: 'cluster', at: now }));
    expect(sent).toHaveLength(13);
    expect(
      sent.map((each) =>
        each.method === 'runCommand' ? Object.keys(each.arguments[0] as object)[0] : (each.collection ?? each.method),
      ),
    ).toEqual([
      'buildInfo',
      'listShards',
      'balancerStatus',
      'settings',
      'collections',
      'chunks',
      'tags',
      'databases',
      'serverStatus',
      'changelog',
      'actionlog',
      'mongos',
      'aggregate',
    ]);
    expect(sent[12]).toMatchObject({ database: 'admin', method: 'aggregate', timeLimitMs: 15_000 });
    expect(sent[10]).toMatchObject({ method: 'countDocuments', timeLimitMs: 15_000 });
    const since = { $date: { $numberLong: String(now - 86_400_000) } };
    expect(JSON.stringify(sent[9]?.arguments)).toContain(JSON.stringify(since));
  });

  it('splits rs0/a:27018,b:27018 into the replica set rs0 and two members; a:27018 has none', () => {
    expect(shardHost('rs0/a:27018,b:27018')).toEqual({ replicaSet: 'rs0', members: ['a:27018', 'b:27018'] });
    expect(shardHost('a:27018')).toEqual({ members: ['a:27018'] });
    const shards = clusterStep().cluster.shards ?? [];
    expect(shards.map((shard) => [shard.name, shard.replicaSet, shard.members])).toEqual([
      ['shard01', 'shard01', ['s1a:27018', 's1b:27018']],
      ['shard02', undefined, ['s2a:27018']],
    ]);
  });

  it('counts 4 done and 1 failed with 4 commits, 1 error and 1 aborted move from', () => {
    expect(clusterStep().cluster.migrations).toEqual({ done: 4, failed: 1, failedRounds: 2 });
  });

  it('does not count a mongos whose ping is 61 seconds old as active', () => {
    expect(clusterStep().cluster.routers).toEqual({ active: 1, total: 2 });
  });

  it('reads the balancer, the chunk size, the config servers, the zones and the shards', () => {
    const read = clusterStep().cluster;
    expect(read.balancer).toMatchObject({
      mode: 'full',
      inRound: false,
      rounds: 1204,
      window: { start: '23:00', stop: '06:00' },
      chunkSizeMb: 128,
      secondaryThrottle: false,
    });
    expect(read.configServer).toBe('cfg/c1:27019,c2:27019,c3:27019');
    expect(read.version).toBe('8.0.4');
    expect(read.zones).toEqual(['east', 'north', 'west']);
    expect(read.shards?.[0]).toMatchObject({ chunks: 13, dataSize: 3073 * 1024 * 1024, primaryOf: ['admin2', 'shop'] });
    expect(read.errors).toEqual([]);
  });

  it('takes the balancer from config.settings without balancerStatus, and the chunk size from serverStatus', () => {
    const read = clusterStep({ 2: failed('not authorized on admin'), 3: [{ _id: 'balancer', stopped: true }] }).cluster;
    expect(read.balancer?.mode).toBe('off');
    expect(read.balancer?.chunkSizeMb).toBe(64);
    expect(read.errors).toEqual(['balancer (balancerStatus): not authorized on admin']);
  });

  it('writes a shard key { customerId: 1, _id: "hashed" } exactly so, and counts jumbo chunks', () => {
    const collections = clusterStep().cluster.collections ?? [];
    const orders = collections.find((each) => each.namespace === 'shop.orders');
    expect(orders?.key).toBe('{ customerId: 1, _id: "hashed" }');
    expect(orders?.chunks).toEqual([
      ['shard01', 12],
      ['shard02', 11],
    ]);
    expect(orders?.zones).toEqual([
      { zone: 'east', min: '{ customerId: MinKey() }', max: '{ customerId: 500 }' },
      { zone: 'north', min: '{ customerId: 500 }', max: '{ customerId: MaxKey() }' },
    ]);
    const users = collections.find((each) => each.namespace === 'shop.users');
    expect(users).toMatchObject({ unique: true, balancing: false });
    expect(collections.find((each) => each.namespace === 'logs.events')).toMatchObject({
      totalChunks: 4,
      jumbo: 1,
      data: [],
    });
  });

  it('keeps an error not authorized on config … as chunks (config.chunks): not authorized on config', () => {
    const read = clusterStep({
      5: failed('not authorized on config to execute command { aggregate: "chunks", pipeline: [ … ] }', 13),
    });
    expect(read.cluster.errors).toEqual(['chunks (config.chunks): not authorized on config']);
  });

  it('sends $collStats for the first 100 collections where $shardedDataDistribution fails, and says so with 140', () => {
    const read = clusterStep({ 4: namesOf(140), 12: failed('Unrecognized pipeline stage name', 40324) });
    const steps = collectionSteps(cluster.id, read, true);
    expect(steps).toHaveLength(13);
    expect(steps[0]).toMatchObject({ step: 'collections', verdicts: expect.any(Array) as unknown });
    const sent = requestsOf(request(context, steps[0] ?? null));
    expect(sent).toHaveLength(16);
    expect(sent[0]?.arguments[0]).toEqual({ balancerCollectionStatus: 'shop.c000' });
    expect(sent[8]).toMatchObject({ database: 'shop', collection: 'c000', method: 'aggregate' });
    const asked = steps.flatMap((step) => (step as { collStats: string[] }).collStats);
    expect(asked).toHaveLength(100);
    const full = completeCluster(read, []);
    expect(full.dataLimitedTo).toBe(100);
  });

  it('sends neither balancerCollectionStatus nor $collStats on a read that is not full', () => {
    expect(collectionSteps(cluster.id, clusterStep({ 12: failed('Unrecognized') }), false)).toEqual([]);
  });

  it('puts the verdicts and the data of $collStats on the collections of a full read', () => {
    const read = clusterStep({ 12: failed('Unrecognized pipeline stage name') });
    const replies = [compliant, imbalanced, failed('not authorized'), collStatsPerShard([['shard01', 10, 2]])];
    const reads = parse(replies, {
      step: 'collections',
      verdicts: ['logs.events', 'shop.orders', 'shop.users'],
      collStats: ['shop.orders'],
    });
    const full = completeCluster(read, reads.step === 'collections' ? reads.collections : []);
    const orders = full.collections?.find((each) => each.namespace === 'shop.orders');
    expect(orders?.verdict).toEqual({ compliant: false, violation: 'chunksImbalance' });
    expect(orders?.data).toEqual([{ shard: 'shard01', size: 10, count: 2 }]);
    expect(full.errors).toEqual([]);
  });

  it('names the balancer status of the collections in the errors only when every collection failed', () => {
    const read = clusterStep();
    const refused = failed('not authorized on admin to execute command { balancerCollectionStatus: "x" }', 13);
    const reads = parse([refused, refused, refused], {
      step: 'collections',
      verdicts: ['logs.events', 'shop.orders', 'shop.users'],
    });
    const full = completeCluster(read, reads.step === 'collections' ? reads.collections : []);
    expect(full.errors).toEqual([
      'balancer status of the collections (balancerCollectionStatus, clusterManager role): not authorized on admin',
    ]);
  });

  it('keeps the verdicts, the data and the two errors of the last full read on a read that is not full', () => {
    const last = { ...clusterStep().cluster };
    const previous = {
      ...last,
      collections: (last.collections ?? []).map((each) => ({ ...each, verdict: { compliant: true } })),
      errors: ['data per shard ($shardedDataDistribution, $collStats): refused'],
    };
    const current = clusterStep({ 12: failed('refused') }).cluster;
    const merged = mergeSharding(previous, current);
    expect(merged.collections?.every((each) => each.verdict?.compliant === true)).toBe(true);
    expect(merged.collections?.find((each) => each.namespace === 'shop.orders')?.data).toHaveLength(2);
    expect(merged.errors).toEqual(['data per shard ($shardedDataDistribution, $collStats): refused']);
  });

  it('reads the config servers from getShardMap', () => {
    expect(parse([shardMap], { step: 'shard-map' })).toEqual({
      step: 'shard-map',
      configServer: 'cfg/c1:27019,c2:27019,c3:27019',
    });
    expect(clusterOf(clusterReplies({ 8: { ok: 1 } }), now).configServer).toBeUndefined();
  });
});
