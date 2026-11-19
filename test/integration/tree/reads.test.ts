/**
 * The reads of the tree against real servers (testing.md): the requests their `request` builds are sent as the runner
 * sends them, and their `parse` reads the replies. With `DATARDO_RECORD_REPLIES=1` the replies are recorded into
 * `test/fixtures/replies/`, which the unit tests of the `parse` functions read.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MongoClient } from 'mongodb';
import { createClient } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEngines } from '../../../src/engines';
import * as count from '../../../src/features/tree/count';
import * as listCollections from '../../../src/features/tree/list-collections';
import * as listDatabases from '../../../src/features/tree/list-databases';
import { namespacesOf } from '../../../src/features/tree/namespaces';
import * as redisDatabases from '../../../src/features/tree/redis-databases';
import * as scanNamespaces from '../../../src/features/tree/scan-namespaces';
import type { KeyScan } from '../../../src/features/tree/types';
import type { Json, RedisReply } from '../../../src/shared/engine-request';
import type { Context, ReadRequest } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const servers = testServers();
const redisDatabase = servers.redisDatabases.includes(15) ? 15 : (servers.redisDatabases[0] ?? 15);
const signal = (): AbortSignal => AbortSignal.timeout(30_000);
const database = 'tree_shop';
const decoder = new TextDecoder();

const context: Context = {
  feature: featureId('tree.list-databases'),
  now: 0,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'app' },
  state: initialState,
};

/** Sends every request of a Read, one after the other, as the runner does. */
async function send(engines: ReturnType<typeof createEngines>, read: ReadRequest): Promise<unknown[]> {
  if (read.kind !== 'engine') {
    throw new Error('The read asks no engine.');
  }
  const replies: unknown[] = [];
  for (const each of read.requests) {
    replies.push(await engines.send(each, signal()));
  }
  return replies;
}

/** A reply of Redis as JSON: bytes as `{ "$bytes": base64 }`, maps as `{ "$map": [[key, value]] }`. */
function redisJson(reply: unknown): Json {
  if (reply instanceof Uint8Array) {
    return { $bytes: Buffer.from(reply).toString('base64') };
  }
  if (Array.isArray(reply)) {
    return reply.map(redisJson);
  }
  if (typeof reply === 'object' && reply !== null && (reply as { kind?: string }).kind === 'map') {
    const entries = (reply as Extract<RedisReply, { kind: 'map' }>).entries;
    return { $map: entries.map(([key, value]) => [redisJson(key), redisJson(value)]) };
  }
  return reply as Json;
}

async function record(name: string, value: unknown): Promise<void> {
  if (recording) {
    await writeFile(join(folder, name), `${JSON.stringify(value, null, 2)}\n`);
  }
}

describe('tree.list-databases, tree.list-collections and tree.count on MongoDB', () => {
  const engines = createEngines();
  const id = connectionId('tree-mongo');

  beforeAll(async () => {
    const client = new MongoClient(servers.mongoStandalone);
    try {
      const db = client.db(database);
      await db.dropDatabase();
      await db.collection('orders').insertMany([{ n: 1 }, { n: 2 }, { n: 3 }]);
      await db.createCollection('Customers');
      await db.createCollection('fs.files');
      await db.createCollection('fs.chunks');
      await db.createCollection('img.files');
      await db.createCollection('active_orders', { viewOn: 'orders', pipeline: [{ $match: { n: { $gt: 1 } } }] });
      await db.createCollection('weather', { timeseries: { timeField: 'at' } });
    } finally {
      await client.close();
    }
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: servers.mongoStandalone, connectTimeoutMs: 10_000 },
      signal(),
    );
  });

  afterAll(async () => {
    await engines.disconnectAll();
  });

  it('tree.list-databases: each database with its size on disk, sorted by name', async () => {
    const args: Json = { connection: id, fallback: 'test' };
    const replies = await send(engines, listDatabases.request(context, args));
    const databases = listDatabases.parse(replies, args);
    expect(databases.map((each) => each.name)).toContain(database);
    expect(databases.find((each) => each.name === database)?.sizeOnDisk).toBeGreaterThan(0);
    expect(databases.map((each) => each.name)).toEqual([...databases.map((each) => each.name)].sort());
    await record('mongodb-8.2-listDatabases-sizes.json', replies[0]);
  });

  it('tree.list-collections: buckets, then collections, views and time series by name, then system collections', async () => {
    const args: Json = { connection: id, database };
    const replies = await send(engines, listCollections.request(context, args));
    const contents = listCollections.parse(replies);
    expect(contents.buckets).toEqual(['fs']);
    expect(contents.entries.find((each) => each.name === 'weather')?.kind).toBe('timeseries');
    expect(contents.entries.find((each) => each.name === 'active_orders')?.kind).toBe('view');
    expect(contents.entries.at(-1)?.system).toBe(true);
    await record('mongodb-8.2-tree-listCollections.json', replies[0]);
  });

  it('tree.count: the estimated count of each collection, and none for one that fails', async () => {
    const args: Json = { connection: id, database, collections: ['orders', 'Customers'] };
    const replies = await send(engines, count.request(context, args));
    expect(count.parse(replies, args)).toEqual({ orders: 3, Customers: 0 });
    await record('mongodb-8.2-estimatedDocumentCount.json', replies);
  });
});

describe.runIf(servers.redis !== undefined)('tree.redis-databases and tree.scan-namespaces on Redis', () => {
  const engines = createEngines();
  const id = connectionId('tree-redis');

  async function fill(keys: number): Promise<void> {
    const client = createClient({ url: servers.redis ?? '', database: redisDatabase });
    await client.connect();
    try {
      await client.flushDb();
      for (let start = 0; start < keys; start += 1000) {
        const chunk = Array.from({ length: Math.min(1000, keys - start) }, (_, index) => [
          `bulk:${String(start + index)}`,
          'x',
        ]);
        await client.mSet(chunk.flat());
      }
    } finally {
      client.destroy();
    }
  }

  async function scanAll(): Promise<{ scan: KeyScan; calls: string[] }> {
    let scan = scanNamespaces.freshScan;
    const calls: string[] = [];
    while (scan.ended === undefined) {
      const args: Json = { connection: id, database: redisDatabase, cursor: scan.cursor };
      const read = scanNamespaces.request(context, args);
      if (read.kind === 'engine' && read.requests[0]?.request.engine === 'redis') {
        calls.push(read.requests[0].request.command.map((word) => decoder.decode(word)).join(' '));
      }
      scan = scanNamespaces.afterPage(scan, scanNamespaces.parse(await send(engines, read)));
    }
    return { scan, calls };
  }

  beforeAll(async () => {
    await engines.connect(
      id,
      { engine: 'redis', connectionString: servers.redis ?? '', connectTimeoutMs: 10_000 },
      signal(),
    );
  });

  afterAll(async () => {
    await engines.disconnectAll();
  });

  it('tree.redis-databases: INFO keyspace and CONFIG GET databases give every database with its keys', async () => {
    const client = createClient({ url: servers.redis ?? '', database: redisDatabase });
    await client.connect();
    try {
      await client.flushDb();
      await client.set('orders:1', 'x');
      await client.set('orders:2', 'x', { EX: 3600 });
    } finally {
      client.destroy();
    }
    const replies = await send(engines, redisDatabases.request(context, { connection: id }));
    const found = redisDatabases.parse(replies);
    expect(found.count).toBeGreaterThanOrEqual(16);
    expect(found.databases[redisDatabase]).toMatchObject({ keys: 2, expires: 1 });
    if (recording) {
      await writeFile(join(folder, 'redis-7.4-info-keyspace.txt'), decoder.decode(replies[0] as Uint8Array));
      await record('redis-7.4-config-get-databases.json', redisJson(replies[1]));
    }
  });

  it('tree.scan-namespaces: a database of 3,500 keys is scanned to the end with SCAN <cursor> COUNT 1000 only', async () => {
    await fill(3500);
    const { scan, calls } = await scanAll();
    expect(scan.ended).toBe('whole');
    expect(scan.keys).toHaveLength(3500);
    expect(calls[0]).toBe('SCAN 0 COUNT 1000');
    expect(calls.every((call) => /^SCAN \d+ COUNT 1000$/u.test(call))).toBe(true);
    expect(namespacesOf(scan.keys, ':', true).namespaces.map((each) => each.countText)).toEqual(['3,500']);
  });

  it('tree.scan-namespaces: a run stops once 10,000 keys were returned, and Load more goes on', async () => {
    await fill(12_000);
    const first = await scanAll();
    expect(first.scan.ended).toBe('paused');
    expect(first.scan.returned).toBeGreaterThanOrEqual(10_000);
    let scan = scanNamespaces.loadMore(first.scan);
    while (scan.ended === undefined) {
      const args: Json = { connection: id, database: redisDatabase, cursor: scan.cursor };
      scan = scanNamespaces.afterPage(
        scan,
        scanNamespaces.parse(await send(engines, scanNamespaces.request(context, args))),
      );
    }
    expect(scan.ended).toBe('whole');
    expect(scan.keys).toHaveLength(12_000);
  });

  it('tree.scan-namespaces: names that are not UTF-8 are scanned as bytes', async () => {
    const client = createClient({ url: servers.redis ?? '', database: redisDatabase });
    await client.connect();
    try {
      await client.flushDb();
      await client.set(Buffer.from([0x69, 0x6d, 0x67, 0xff, 0x3a, 0x31]), 'x');
      await client.set(Buffer.from([0x69, 0x6d, 0x67, 0xff, 0x3a, 0x32]), 'x');
      await client.set('orders:1', 'x');
    } finally {
      client.destroy();
    }
    const args: Json = { connection: id, database: redisDatabase, cursor: '0' };
    const replies = await send(engines, scanNamespaces.request(context, args));
    const page = scanNamespaces.parse(replies);
    expect(page.keys).toHaveLength(3);
    expect(namespacesOf(page.keys, ':', true).namespaces.map((each) => each.name)).toEqual(['img\\xff']);
    await record('redis-7.4-tree-scan.json', redisJson(replies[0]));
  });
});
