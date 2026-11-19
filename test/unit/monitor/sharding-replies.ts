/**
 * The replies of a sharded cluster, BUILT BY HAND: the throwaway servers of the tests are a standalone server and a
 * one-member replica set, not a cluster. They follow the shapes MongoDB 8.2 documents for `listShards`,
 * `balancerStatus`, `config.collections`, `config.chunks`, `config.tags`, `config.databases`, `serverStatus`,
 * `config.changelog`, `config.actionlog`, `config.mongos`, `$shardedDataDistribution`, `balancerCollectionStatus` and
 * `getShardMap`, in canonical Extended JSON. A mongos with 2 shards and 3 sharded collections, read at {@link now}.
 */
import type { Json } from '../../../src/shared/engine-request';
import { date, int, long, now } from './context';

function uuid(last: string): Json {
  return { $binary: { base64: `AAAAAAAAAAAAAAAAAAAAA${last}==`, subType: '04' } };
}

const megabyte = 1024 * 1024;

/** `buildInfo` of the mongos. */
export const buildInfo: Json = { version: '8.0.4', ok: int(1) };

/** `listShards`: shard01 (zone east) and shard02 (zone west, a host without a replica set). */
export const listShards: Json = {
  shards: [
    {
      _id: 'shard01',
      host: 'shard01/s1a:27018,s1b:27018',
      state: int(1),
      tags: ['east'],
      topologyTime: date('2026-01-01T00:00:00Z'),
    },
    { _id: 'shard02', host: 's2a:27018', state: int(1), tags: ['west'] },
  ],
  ok: int(1),
};

/** `balancerStatus`: on, idle. */
export const balancerStatus: Json = { mode: 'full', inBalancerRound: false, numBalancerRounds: long(1204), ok: int(1) };

/** `config.settings`: the balancer with an active window and no secondary throttle; the chunk size. */
export const settings: Json = [
  {
    _id: 'balancer',
    mode: 'full',
    stopped: false,
    activeWindow: { start: '23:00', stop: '06:00' },
    _secondaryThrottle: false,
  },
  { _id: 'chunksize', value: int(128) },
];

/** `config.collections`: shop.orders (hashed), shop.users (balancing off), logs.events. */
export const collections: Json = [
  {
    _id: 'logs.events',
    uuid: uuid('C'),
    key: { ts: int(1) },
    unique: false,
    lastmodEpoch: { $oid: '000000000000000000000003' },
  },
  { _id: 'shop.orders', uuid: uuid('A'), key: { customerId: int(1), _id: 'hashed' }, unique: false },
  { _id: 'shop.users', uuid: uuid('B'), key: { _id: int(1) }, unique: true, noBalance: true },
];

/** The groups of `config.chunks` by collection and shard. */
export const chunkGroups: Json = [
  { _id: { uuid: uuid('A'), shard: 'shard01' }, n: int(12), jumbo: int(0) },
  { _id: { uuid: uuid('A'), shard: 'shard02' }, n: int(11), jumbo: int(0) },
  { _id: { uuid: uuid('B'), shard: 'shard01' }, n: int(1), jumbo: int(0) },
  { _id: { uuid: uuid('C'), shard: 'shard02' }, n: int(3), jumbo: int(1) },
  { _id: { uuid: uuid('C'), shard: 'shard03' }, n: int(1), jumbo: int(0) },
];

/** `config.tags`: two ranges of shop.orders. */
export const tags: Json = [
  {
    _id: { $oid: '000000000000000000000010' },
    ns: 'shop.orders',
    min: { customerId: { $minKey: 1 } },
    max: { customerId: int(500) },
    tag: 'east',
  },
  {
    _id: { $oid: '000000000000000000000011' },
    ns: 'shop.orders',
    min: { customerId: int(500) },
    max: { customerId: { $maxKey: 1 } },
    tag: 'north',
  },
];

/** `config.databases`. */
export const databases: Json = [
  { _id: 'shop', primary: 'shard01' },
  { _id: 'logs', primary: 'shard02' },
  { _id: 'admin2', primary: 'shard01' },
];

/** `serverStatus` of the mongos, with the parts the read excludes left out. */
export const serverStatus: Json = {
  host: 'router1:27017',
  process: 'mongos',
  localTime: { $date: { $numberLong: String(now) } },
  sharding: { configsvrConnectionString: 'cfg/c1:27019,c2:27019,c3:27019', maxChunkSizeInBytes: long(64 * megabyte) },
  ok: int(1),
};

/** The groups of `config.changelog`: 4 commits, 1 error, 1 move from that was aborted, 3 that succeeded. */
export const migrationGroups: Json = [
  { _id: { what: 'moveChunk.commit', ok: false }, n: int(4) },
  { _id: { what: 'moveChunk.error', ok: false }, n: int(1) },
  { _id: { what: 'moveChunk.from', ok: false }, n: int(1) },
  { _id: { what: 'moveChunk.from', ok: true }, n: int(3) },
];

/** The count of the balancer rounds with errors. */
export const failedRounds: Json = int(2);

/** `config.mongos`: one router that pinged 10 seconds ago, one 61 seconds ago. */
export const routers: Json = [
  { _id: 'router1:27017', ping: { $date: { $numberLong: String(now - 10_000) } } },
  { _id: 'router2:27017', ping: { $date: { $numberLong: String(now - 61_000) } } },
];

/** `$shardedDataDistribution`. */
export const distribution: Json = [
  {
    ns: 'shop.orders',
    shards: [
      {
        shardName: 'shard01',
        numOrphanedDocs: int(0),
        numOwnedDocuments: long(30_000),
        ownedSizeBytes: long(3072 * megabyte),
        orphanedSizeBytes: int(0),
      },
      {
        shardName: 'shard02',
        numOrphanedDocs: int(0),
        numOwnedDocuments: long(10_000),
        ownedSizeBytes: long(1024 * megabyte),
        orphanedSizeBytes: int(0),
      },
    ],
  },
  {
    ns: 'shop.users',
    shards: [
      {
        shardName: 'shard01',
        numOrphanedDocs: int(0),
        numOwnedDocuments: int(500),
        ownedSizeBytes: int(megabyte),
        orphanedSizeBytes: int(0),
      },
    ],
  },
];

/** The 13 replies of a mongos, in the order of `clusterRequests`; `replace` puts other replies at their places. */
export function clusterReplies(replace: Readonly<Record<number, unknown>> = {}): readonly unknown[] {
  const replies: unknown[] = [
    buildInfo,
    listShards,
    balancerStatus,
    settings,
    collections,
    chunkGroups,
    tags,
    databases,
    serverStatus,
    migrationGroups,
    failedRounds,
    routers,
    distribution,
  ];
  return replies.map((reply, index) => (index in replace ? replace[index] : reply));
}

/** `balancerCollectionStatus` of a compliant collection, and of one with chunks to move. */
export const compliant: Json = { balancerCompliant: true, ok: int(1) };
export const imbalanced: Json = { balancerCompliant: false, firstComplianceViolation: 'chunksImbalance', ok: int(1) };

/** `$collStats` of a collection through a mongos, before 6.0.3: one document per shard. */
export function collStatsPerShard(sizes: readonly (readonly [string, number, number])[]): Json {
  return sizes.map(([shard, size, count]) => ({ shard, storageStats: { size: long(size), count: long(count) } }));
}

/** `hello` of a mongos, of a config server, of a shard member, of a standalone server. */
export const helloMongos: Json = { isWritablePrimary: true, msg: 'isdbgrid', ok: int(1) };
export const helloConfigServer: Json = { setName: 'cfg', me: 'c1.example.net:27019', configsvr: int(2), ok: int(1) };
export const helloShardMember: Json = { setName: 'shard01', me: 'db1.example.net:27017', ok: int(1) };

/** `shardingState` of a member of a shard. */
export const shardingState: Json = {
  enabled: true,
  configServer: 'cfg/c1:27019,c2:27019',
  shardName: 'shard01',
  ok: int(1),
};

/** `getShardMap` of a mongos. */
export const shardMap: Json = {
  map: { shard01: 'shard01/s1a:27018,s1b:27018', config: 'cfg/c1:27019,c2:27019,c3:27019' },
  ok: int(1),
};

/** Events of `config.changelog` and `config.actionlog`. */
export const changelog: Json = [
  {
    _id: 'router1-2026-11-17T13:59:00.000Z-1',
    server: 'router1',
    shard: 'shard01',
    time: date('2026-11-17T13:59:00Z'),
    what: 'moveChunk.commit',
    ns: 'shop.orders',
    details: {
      min: { a: int(0) },
      max: { a: int(100) },
      from: 'shard01',
      to: 'shard02',
      counts: { cloned: long(12_400) },
    },
  },
  {
    _id: 'router1-2026-11-17T13:58:00.000Z-2',
    server: 'router1',
    shard: 'shard01',
    time: date('2026-11-17T13:58:00Z'),
    what: 'moveChunk.from',
    ns: 'shop.orders',
    details: { min: { a: int(100) }, max: { a: int(200) }, from: 'shard01', to: 'shard02', note: 'aborted' },
  },
  {
    _id: 'router1-2026-11-17T13:56:00.000Z-3',
    server: 's1a:27018',
    time: date('2026-11-17T13:56:00Z'),
    what: 'split',
    ns: 'shop.orders',
    details: {
      before: { min: { a: int(0) }, max: { a: int(100) } },
      left: { min: { a: int(0) }, max: { a: int(50) } },
      right: { min: { a: int(50) }, max: { a: int(100) } },
    },
  },
];

export const actionlog: Json = [
  {
    _id: { $oid: '000000000000000000000020' },
    server: 'cfg1',
    time: date('2026-11-17T13:57:00Z'),
    what: 'balancer.round',
    ns: '',
    details: { executionTimeMillis: int(340), errorOccured: false, candidateChunks: int(5), chunksMoved: int(1) },
  },
];
