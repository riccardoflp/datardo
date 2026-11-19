/**
 * Records the replies of the Operations and Slow queries sections of the Monitor page (`monitor.read-operations`,
 * `monitor.read-slow-queries`) from the throwaway standalone server, into
 * `test/fixtures/replies/mongodb-8.2-monitor-*.json` (testing.md). It runs only when `DATARDO_RECORD_REPLIES=1`.
 *
 * The database `shop` gets 2,000 orders and its profiler records every operation (level 1, `slowms: 0`, which also
 * makes the server log every operation as a slow query); then a `find` with a sort and a `getMore`, an `aggregate`, a
 * `count`, a `distinct`, an `update`, a `delete` and an `insert` run, and a `find` that sleeps runs while `currentOp`
 * is read. So that the files say nothing of the machine they were recorded on, every address is `localhost:27017`,
 * and the server log keeps only its "Slow query" lines on `shop` and two other lines.
 */
import { MongoClient } from 'mongodb';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { EngineError } from '../../../src/engines/engine';
import { request as operationsRequest } from '../../../src/features/monitor/read-operations';
import { request as slowQueriesRequest } from '../../../src/features/monitor/read-slow-queries';
import type { Context, ReadRequest } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const standalone = connectionId('record-standalone');
const database = 'shop';

const context: Context = {
  feature: featureId('monitor.read-slow-queries'),
  now: 0,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'app' },
  state: initialState,
};

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

/** The reply without the addresses of the machine. */
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
    .filter(([name]) => name !== '$clusterTime')
    .map(([name, field]) => [name, name === 'host' ? 'localhost:27017' : scrubbed(field)]);
  return Object.fromEntries(entries);
}

async function save(name: string, reply: unknown): Promise<void> {
  const path = join(folder, `mongodb-8.2-monitor-${name}.json`);
  const options = (await resolveConfig(path)) ?? {};
  await writeFile(path, await format(`${JSON.stringify(scrubbed(reply), null, 2)}\n`, { ...options, filepath: path }));
}

/** The "Slow query" lines on `shop` of the server log, and two other lines, with the count of lines written. */
function slowLinesOnly(reply: unknown): unknown {
  const record = reply as { log?: unknown[]; totalLinesWritten?: unknown; ok?: unknown };
  const lines = (record.log ?? []).filter((line): line is string => typeof line === 'string');
  const slow = lines.filter((line) => line.includes('"msg":"Slow query"') && line.includes(`"ns":"${database}.`));
  const others = lines.filter((line) => line.includes('"msg":"Connection ended"')).slice(0, 2);
  return { totalLinesWritten: record.totalLinesWritten, log: [...others, ...slow], ok: record.ok };
}

/** The orders, the profiler, and the operations the profiler and the log record. */
async function workload(client: MongoClient): Promise<void> {
  const shop = client.db(database);
  await shop.dropDatabase();
  const statuses = ['paid', 'shipped', 'cancelled', 'new'];
  const orders = Array.from({ length: 2000 }, (_, index) => ({
    _id: index as never,
    status: statuses[index % statuses.length],
    total: index * 3,
    createdAt: new Date(Date.UTC(2026, 10, 1) + index * 60_000),
  }));
  await shop.collection('orders').insertMany(orders);
  await shop.command({ profile: 1, slowms: 0 });
  const appClient = new MongoClient(testServers().mongoStandalone, { appName: 'checkout' });
  await appClient.connect();
  try {
    const orders = appClient.db(database).collection('orders');
    await orders.find({ status: 'paid' }).sort({ createdAt: -1 }).limit(20).toArray();
    await orders
      .find({ total: { $gt: 5000 } }, { batchSize: 2 })
      .limit(6)
      .toArray();
    await orders
      .aggregate([{ $match: { status: 'shipped' } }, { $group: { _id: '$status', total: { $sum: '$total' } } }])
      .toArray();
    await orders.countDocuments({ status: 'new' });
    await orders.distinct('status', { total: { $lt: 100 } });
    await orders.updateMany({ status: 'new' }, { $set: { seen: true } });
    await orders.deleteOne({ _id: 1999 as never });
    await orders.insertOne({ _id: 5000 as never, status: 'new', total: 1 });
  } finally {
    await appClient.close();
  }
}

/** `currentOp` while a `find` sleeps, with and without the idle connections. */
async function readOperations(engines: EngineService, client: MongoClient): Promise<readonly unknown[]> {
  const sleeping = client
    .db(database)
    .collection('orders')
    .find({ _id: 0 as never, $where: 'sleep(1500) || true' })
    .toArray();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const on = { connection: standalone };
  const [operations] = await repliesOf(engines, operationsRequest(context, on));
  const [withIdle] = await repliesOf(engines, operationsRequest(context, { ...on, idle: true }));
  await sleeping;
  return [operations, withIdle];
}

async function record(engines: EngineService): Promise<void> {
  const client = await MongoClient.connect(testServers().mongoStandalone);
  try {
    await workload(client);
    const [operations, withIdle] = await readOperations(engines, client);
    const on = { connection: standalone, database };
    const [status, profile] = await repliesOf(engines, slowQueriesRequest(context, { ...on, source: 'profiler' }));
    const [, log] = await repliesOf(engines, slowQueriesRequest(context, { ...on, source: 'log' }));
    await client.db(database).command({ profile: 0, slowms: 100 });
    await Promise.all([
      save('current-op', operations),
      save('current-op-idle', withIdle),
      save('profile-status', status),
      save('system-profile', profile),
      save('get-log', slowLinesOnly(log)),
    ]);
  } finally {
    await client.close();
  }
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)(
    'records the replies of the Operations and Slow queries sections on MongoDB',
    async () => {
      const engines = createEngines();
      await engines.connect(
        standalone,
        { engine: 'mongodb', connectTimeoutMs: 10_000, connectionString: testServers().mongoStandalone },
        AbortSignal.timeout(20_000),
      );
      try {
        await mkdir(folder, { recursive: true });
        await record(engines);
      } finally {
        await engines.disconnectAll();
      }
      expect(recording).toBe(true);
    },
    60_000,
  );
});
