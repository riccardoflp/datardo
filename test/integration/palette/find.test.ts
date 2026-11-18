/**
 * `palette.find-collections` and `palette.find-keys` against real servers (testing.md): the requests their `request`
 * builds are sent as the runner sends them, and their `parse` reads the replies. With `DATARDO_RECORD_REPLIES=1` the
 * replies are recorded into `test/fixtures/replies/`, which the unit tests of the `parse` functions read.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MongoClient } from 'mongodb';
import { createClient } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEngines } from '../../../src/engines';
import * as findCollections from '../../../src/features/palette/find-collections';
import * as findKeys from '../../../src/features/palette/find-keys';
import type { Context, ReadRequest } from '../../../src/shared/feature';
import type { Json } from '../../../src/shared/engine-request';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const servers = testServers();
const [redisDatabase = 15] = servers.redisDatabases;
const id = connectionId('palette-test');
const signal = (): AbortSignal => AbortSignal.timeout(20_000);
const database = 'goto_shop';

const context: Context = {
  feature: featureId('palette.find-collections'),
  now: 0,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'connection', connection: id },
  state: initialState,
};

/** Sends every request of a Read, one after the other, as the runner does. */
async function send(engines: ReturnType<typeof createEngines>, read: ReadRequest): Promise<unknown[]> {
  if (read.kind !== 'engine') {
    throw new Error('The read asks no engine.');
  }
  const replies: unknown[] = [];
  for (const each of read.requests) {
    replies.push(await engines.send({ connection: each.connection, request: each.request }, signal()));
  }
  return replies;
}

describe('palette.find-collections', () => {
  const engines = createEngines();

  beforeAll(async () => {
    const client = new MongoClient(servers.mongoStandalone);
    try {
      const db = client.db(database);
      await db.dropDatabase();
      await db.createCollection('orders');
      await db.createCollection('order_items');
      await db.createCollection('fs.files');
      await db.createCollection('fs.chunks');
      await db.createCollection('big_orders', { viewOn: 'orders', pipeline: [] });
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

  it('finds the collections, the views and the buckets of every database, in two rounds', async () => {
    const first: Json = { connection: id };
    const databasesReplies = await send(engines, findCollections.request(context, first));
    const databases = findCollections.parse(databasesReplies, first);
    expect(databases.kind === 'databases' && databases.databases.includes(database)).toBe(true);
    const second: Json = { connection: id, databases: [database] };
    const collectionsReplies = await send(engines, findCollections.request(context, second));
    const found = findCollections.parse(collectionsReplies, second);
    const names = found.kind === 'collections' ? found.names : [];
    expect(names).toEqual(
      expect.arrayContaining([
        { database, name: 'fs', kind: 'bucket' },
        { database, name: 'orders', kind: 'collection' },
        { database, name: 'order_items', kind: 'collection' },
        { database, name: 'big_orders', kind: 'view' },
      ]),
    );
    expect(names.some((each) => each.name.startsWith('fs.'))).toBe(false);
    if (recording) {
      const written = (reply: unknown): string => `${JSON.stringify(reply, null, 2)}\n`;
      await writeFile(join(folder, 'mongodb-8.2-listDatabases.json'), written(databasesReplies[0]));
      await writeFile(join(folder, 'mongodb-8.2-listCollections.json'), written(collectionsReplies[0]));
    }
  });
});

describe.runIf(servers.redis !== undefined)('palette.find-keys', () => {
  const engines = createEngines();
  const redisId = connectionId('palette-keys');

  beforeAll(async () => {
    const client = createClient({ url: servers.redis ?? '', database: redisDatabase });
    await client.connect();
    try {
      await client.flushDb();
      for (let index = 0; index < 30; index += 1) {
        await client.set(`session:${String(index)}`, 'x');
      }
      await client.set('orders:41', 'x');
      await client.set('orders:42', 'x');
      await client.set(Buffer.from([0x6f, 0x72, 0x64, 0xff]), 'x');
    } finally {
      client.destroy();
    }
    await engines.connect(
      redisId,
      { engine: 'redis', connectionString: servers.redis ?? '', connectTimeoutMs: 10_000 },
      signal(),
    );
  });

  afterAll(async () => {
    await engines.disconnectAll();
  });

  async function record(replies: readonly unknown[]): Promise<void> {
    const [cursor, keys] = replies[0] as [Uint8Array, Uint8Array[]];
    const text = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
    const recorded = { cursor: text(cursor), keys: keys.map(text) };
    await writeFile(join(folder, 'redis-7.4-scan.json'), `${JSON.stringify(recorded, null, 2)}\n`);
  }

  async function scan(typed: string): Promise<findKeys.ScanProgress> {
    const wanted = findKeys.wantedKeys(typed);
    if (wanted === undefined) {
      throw new Error(`${typed} is not scanned.`);
    }
    let progress = findKeys.scanStart;
    while (progress.ended === undefined) {
      const args: Json = {
        connection: redisId,
        database: redisDatabase,
        pattern: wanted.pattern,
        cursor: progress.cursor,
      };
      const replies = await send(engines, findKeys.request(context, args));
      if (recording && progress.calls === 0 && typed === ':ord*') {
        await record(replies);
      }
      progress = findKeys.afterPage(progress, findKeys.parse(replies), wanted);
    }
    return progress;
  }

  it('finds at most 20 keys that hold the text, with SCAN', async () => {
    const progress = await scan('session');
    expect(progress.keys.length).toBeGreaterThan(0);
    expect(progress.keys.length).toBeLessThanOrEqual(20);
    expect(progress.keys.every((key) => findKeys.keyText(key).includes('session'))).toBe(true);
  });

  it('after the prefix :, a pattern is sent as typed', async () => {
    const progress = await scan(':orders:4*');
    expect(progress.keys.map(findKeys.keyText).sort()).toEqual(['orders:41', 'orders:42']);
    expect(progress.ended).toBe('whole');
  });

  it('a name that is not text survives, written byte by byte', async () => {
    const progress = await scan(':ord*');
    expect(progress.keys.map(findKeys.keyText)).toContain('ord\\xff');
  });
});
