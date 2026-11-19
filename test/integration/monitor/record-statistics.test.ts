/**
 * Records the replies of the Stats and Replication sections of the Monitor page (`monitor.read-server-status`,
 * `monitor.read-database-stats`, `monitor.read-collection-stats`, `monitor.read-replication`, `monitor.read-oplog`) and
 * of the first steps of `monitor.read-sharding`, from the throwaway standalone server and single-member replica set,
 * into `test/fixtures/replies/mongodb-8.2-monitor-*.json` (testing.md). It runs only when `DATARDO_RECORD_REPLIES=1`.
 *
 * The throwaway servers are not a sharded cluster: the replies of a mongos and of a shard are built by hand in
 * `test/unit/monitor/sharding-replies.ts`. So that the files say nothing of the machine they were recorded on, every
 * address is `localhost:27017`, `serverStatus` keeps only the fields the page reads, and `$collStats` loses the
 * statistics of WiredTiger. A request the server refuses is recorded as `parse` receives it: `{ kind: 'error',
 * message, code }`.
 */
import { MongoClient } from 'mongodb';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { EngineError } from '../../../src/engines/engine';
import {
  request as collectionStatsRequest,
  collectionEntries,
} from '../../../src/features/monitor/read-collection-stats';
import { request as databaseStatsRequest } from '../../../src/features/monitor/read-database-stats';
import { request as oplogRequest } from '../../../src/features/monitor/read-oplog';
import { request as replicationRequest } from '../../../src/features/monitor/read-replication';
import { request as serverStatusRequest } from '../../../src/features/monitor/read-server-status';
import { request as shardingRequest } from '../../../src/features/monitor/read-sharding';
import type { Json } from '../../../src/shared/engine-request';
import type { Context, ReadRequest } from '../../../src/shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const standalone = connectionId('record-standalone');
const replicaSet = connectionId('record-replica-set');
const database = 'shop';

const context: Context = {
  feature: featureId('monitor.read-server-status'),
  now: 0,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'app' },
  state: initialState,
};

function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** The replies of a Read, in the order of its requests; a refused request as `parse` receives it. */
async function repliesOf(engines: EngineService, read: ReadRequest): Promise<readonly unknown[]> {
  if (read.kind !== 'engine') {
    throw new Error(`Expected requests to the engine, got ${read.kind}.`);
  }
  const replies: unknown[] = [];
  for (const each of read.requests) {
    try {
      replies.push(await engines.send(each, AbortSignal.timeout(20_000)));
    } catch (error) {
      if (!(error instanceof EngineError)) {
        throw error;
      }
      replies.push({
        kind: 'error',
        message: error.message,
        ...(error.code === undefined ? {} : { code: error.code }),
      });
    }
  }
  return replies;
}

/** The fields of `serverStatus` the Stats section reads. */
const serverStatusFields = [
  'host',
  'version',
  'uptime',
  'localTime',
  'connections',
  'opcounters',
  'mem',
  'network',
  'ok',
];

/** The reply without the addresses of the machine and the statistics of WiredTiger. */
function scrubbed(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/(?:127\.0\.0\.1|localhost|[\w.-]+):\d{4,5}/gu, 'localhost:27017');
  }
  if (Array.isArray(value)) {
    return value.map(scrubbed);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const entries = Object.entries(value)
    .filter(([name]) => name !== 'wiredTiger' && name !== 'indexDetails' && name !== '$clusterTime')
    .map(([name, field]) => [name, name === 'host' ? 'localhost:27017' : scrubbed(field)]);
  return Object.fromEntries(entries);
}

function serverStatusOnly(reply: unknown): unknown {
  const record = reply as Record<string, unknown>;
  const network = record['network'] as Record<string, unknown> | undefined;
  const kept = Object.fromEntries(
    serverStatusFields.filter((name) => name in record).map((name) => [name, record[name]]),
  );
  return {
    ...kept,
    ...(network === undefined
      ? {}
      : {
          network: { bytesIn: network['bytesIn'], bytesOut: network['bytesOut'], numRequests: network['numRequests'] },
        }),
  };
}

async function save(name: string, reply: unknown): Promise<void> {
  const path = join(folder, `mongodb-8.2-monitor-${name}.json`);
  const options = (await resolveConfig(path)) ?? {};
  await writeFile(path, await format(`${JSON.stringify(scrubbed(reply), null, 2)}\n`, { ...options, filepath: path }));
}

async function send(engines: EngineService, connection: ConnectionId, request: Record<string, unknown>): Promise<void> {
  await engines.send({ connection, request: { engine: 'mongodb', ...request } as never }, AbortSignal.timeout(20_000));
}

/** The database `shop` with a collection, a capped collection and a view. */
async function fill(engines: EngineService, connection: ConnectionId): Promise<void> {
  await send(engines, connection, { database, method: 'runCommand', arguments: [{ dropDatabase: int(1) }] });
  const orders = Array.from({ length: 40 }, (_, index) => ({ _id: int(index), total: int(index * 10) }));
  await send(engines, connection, { database, collection: 'orders', method: 'insertMany', arguments: [orders] });
  await send(engines, connection, {
    database,
    method: 'runCommand',
    arguments: [{ create: 'events', capped: true, size: int(1_048_576) }],
  });
  await send(engines, connection, {
    database,
    method: 'runCommand',
    arguments: [{ create: 'paid', viewOn: 'orders', pipeline: [{ $match: { total: { $gt: int(100) } } }] }],
  });
}

async function recordStandalone(engines: EngineService): Promise<void> {
  const on = { connection: standalone };
  await fill(engines, standalone);
  const [status] = await repliesOf(engines, serverStatusRequest(context, on));
  const [databases] = await repliesOf(engines, databaseStatsRequest(context, { ...on, step: 'list' }));
  const [dbStats] = await repliesOf(
    engines,
    databaseStatsRequest(context, { ...on, step: 'stats', databases: [database] }),
  );
  const [collections] = await repliesOf(engines, collectionStatsRequest(context, { ...on, step: 'list', database }));
  const entries = collectionEntries(collections).map((entry) => ({ ...entry }));
  const collStats = await repliesOf(
    engines,
    collectionStatsRequest(context, { ...on, step: 'stats', database, collections: entries as unknown as Json }),
  );
  const [hello] = await repliesOf(engines, replicationRequest(context, { ...on, step: 'hello' }));
  const [statusRefused] = await repliesOf(engines, replicationRequest(context, { ...on, step: 'replica-set' }));
  await Promise.all([
    save('server-status', serverStatusOnly(status)),
    save('list-databases', databases),
    save('db-stats', dbStats),
    save('list-collections', collections),
    save('coll-stats', collStats),
    save('hello-standalone', hello),
    save('repl-set-get-status-standalone', statusRefused),
  ]);
}

/** An insert, an update, a delete, a transaction and a `create` of `shop.orders`, for the oplog. */
async function writeOplog(uri: string): Promise<void> {
  const client = await MongoClient.connect(uri);
  try {
    const shop = client.db(database);
    await shop.createCollection('customers');
    await shop.collection('customers').insertOne({ _id: 1 as never, name: 'Ada', tier: 'gold' });
    await shop
      .collection('customers')
      .updateOne({ _id: 1 as never }, { $set: { tier: 'platinum' }, $unset: { name: '' } });
    await shop.collection('customers').deleteOne({ _id: 1 as never });
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await shop.collection('customers').insertOne({ _id: 2 as never, name: 'Grace' }, { session });
        await shop.collection('customers').insertOne({ _id: 3 as never, name: 'Linus' }, { session });
      });
    } finally {
      await session.endSession();
    }
  } finally {
    await client.close();
  }
}

async function recordReplicaSet(engines: EngineService): Promise<void> {
  const on = { connection: replicaSet };
  await fill(engines, replicaSet);
  await writeOplog(testServers().mongoReplicaSet);
  const [hello] = await repliesOf(engines, replicationRequest(context, { ...on, step: 'hello' }));
  const [status, config, oplogStats, first, last] = await repliesOf(
    engines,
    replicationRequest(context, { ...on, step: 'replica-set' }),
  );
  const [recent] = await repliesOf(
    engines,
    oplogRequest(context, { ...on, text: database, operation: 'everything', last: 50 }),
  );
  const [shardingState] = await repliesOf(engines, shardingRequest(context, { ...on, step: 'sharding-state' }));
  await Promise.all([
    save('hello-replica-set', hello),
    save('repl-set-get-status', status),
    save('repl-set-get-config', config),
    save('oplog-coll-stats', oplogStats),
    save('oplog-first', first),
    save('oplog-last', last),
    save('oplog-recent', recent),
    save('sharding-state-replica-set', shardingState),
  ]);
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)('records the replies of the Stats and Replication sections on MongoDB', async () => {
    const engines = createEngines();
    const settings = { engine: 'mongodb', connectTimeoutMs: 10_000 } as const;
    await engines.connect(
      standalone,
      { ...settings, connectionString: testServers().mongoStandalone },
      AbortSignal.timeout(20_000),
    );
    await engines.connect(
      replicaSet,
      { ...settings, connectionString: testServers().mongoReplicaSet },
      AbortSignal.timeout(20_000),
    );
    try {
      await mkdir(folder, { recursive: true });
      await recordStandalone(engines);
      await recordReplicaSet(engines);
    } finally {
      await engines.disconnectAll();
    }
    expect(recording).toBe(true);
  });
});
