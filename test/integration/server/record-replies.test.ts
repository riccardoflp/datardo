/**
 * Records the replies of the reads of the Server page from the throwaway Redis into `test/fixtures/replies/`, named
 * after the server version they came from (testing.md). It runs only when `DATARDO_RECORD_REPLIES=1`: the unit tests
 * of `server.read-info`, `server.read-clients`, `server.read-slow-log`, `server.read-memory`, `server.read-config` and
 * `server.largest-keys` read the recorded files, and the files change only when they are recorded again. The slow log
 * of the server is cleared, filled with known commands, and its threshold put back as it was.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from 'redis';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { bytesMapping, toRedisReply } from '../../../src/engines/redis/replies';
import * as largestKeys from '../../../src/features/server/largest-keys';
import * as readClients from '../../../src/features/server/read-clients';
import * as readConfig from '../../../src/features/server/read-config';
import * as readInfo from '../../../src/features/server/read-info';
import * as readMemory from '../../../src/features/server/read-memory';
import * as readSlowLog from '../../../src/features/server/read-slow-log';
import { hexOf } from '../../../src/features/server/types';
import type { Json, RedisReply } from '../../../src/shared/engine-request';
import type { Context, ReadRequest } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const servers = testServers();
const database = servers.redisDatabases.includes(15) ? 15 : (servers.redisDatabases[0] ?? 15);
const id = connectionId('record-server');
const signal = (): AbortSignal => AbortSignal.timeout(20_000);

const context: Context = {
  feature: featureId('server.read-info'),
  now: 0,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'app' },
  state: initialState,
};

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

async function write(name: string, value: unknown): Promise<void> {
  await writeFile(join(folder, name), `${JSON.stringify(redisJson(value), null, 2)}\n`);
}

async function writeText(name: string, value: unknown): Promise<void> {
  await writeFile(join(folder, name), value instanceof Uint8Array ? value : String(value));
}

/** Sends every request of a Read, one after the other, as the runner does. */
async function send(engines: EngineService, read: ReadRequest): Promise<unknown[]> {
  const requests = read.kind === 'engine' ? read.requests : [];
  const replies: unknown[] = [];
  for (const each of requests) {
    replies.push(await engines.send(each, signal()));
  }
  return replies;
}

async function fillSlowLog(url: string): Promise<string> {
  const client = createClient({ url, database });
  await client.connect();
  try {
    const before = await client.configGet('slowlog-log-slower-than');
    await client.configSet('slowlog-log-slower-than', '0');
    await client.sendCommand(['SLOWLOG', 'RESET']);
    await client.sendCommand(['CLIENT', 'SETNAME', 'orders-api']);
    await client.sendCommand(['RPUSH', 'server:queue', 'a', 'b', 'c']);
    await client.sendCommand(['LRANGE', 'server:queue', '0', '-1']);
    await client.sendCommand(['SET', 'server:long', 'x'.repeat(2176)]);
    await client.sendCommand(['SADD', 'server:many', ...Array.from({ length: 40 }, (_, index) => `m${String(index)}`)]);
    await client.configSet('slowlog-log-slower-than', before['slowlog-log-slower-than'] ?? '10000');
    return before['slowlog-log-slower-than'] ?? '10000';
  } finally {
    client.destroy();
  }
}

async function seedKeys(url: string): Promise<void> {
  const client = createClient({ url, database });
  await client.connect();
  try {
    await client.flushDb();
    await client.set('server:small', 'x');
    await client.set('server:large', 'y'.repeat(5000));
    await client.hSet(
      'server:hash',
      Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`f${String(index)}`, 'v'])),
    );
    await client.rPush('server:list', ['a', 'b', 'c']);
  } finally {
    client.destroy();
  }
}

async function recordResp2(url: string): Promise<void> {
  const client = createClient({ url, RESP: 2 });
  await client.connect();
  try {
    // Every string as bytes, as the engine gives a reply back.
    const options = { typeMapping: bytesMapping };
    const stats = await client.sendCommand(['MEMORY', 'STATS'], options);
    await write('redis-7.4-server-memory-stats-resp2.json', toRedisReply(stats));
    const config = await client.sendCommand(['CONFIG', 'GET', '*'], options);
    await write('redis-7.4-server-config-get-all-resp2.json', toRedisReply(config));
  } finally {
    client.destroy();
  }
}

async function recordLargestKeys(engines: EngineService): Promise<void> {
  const call = (args: Json): Promise<unknown[]> => send(engines, largestKeys.request(context, args));
  const [scan] = await call({ connection: id, database, step: 'scan', cursor: '0' });
  await write('redis-7.4-server-scan.json', scan);
  const page = largestKeys.parse([scan], { step: 'scan' });
  const hex = page.step === 'scan' && page.page.kind === 'read' ? page.page.value.keys.map(hexOf) : [];
  await write(
    'redis-7.4-server-memory-usage.json',
    await call({ connection: id, database, step: 'measure', keys: hex }),
  );
  await write('redis-7.4-server-type.json', await call({ connection: id, database, step: 'type', keys: hex }));
}

describe('the recorded replies of the Server page', () => {
  it.runIf(recording && servers.redis !== undefined)(
    'records INFO, CLIENT LIST, the slow log, the memory and the configuration of Redis',
    async () => {
      const url = servers.redis ?? '';
      const threshold = await fillSlowLog(url);
      await seedKeys(url);
      const engines = createEngines();
      await engines.connect(id, { engine: 'redis', connectionString: url, connectTimeoutMs: 10_000 }, signal());
      try {
        const [info] = await send(engines, readInfo.request(context, { connection: id }));
        await writeText('redis-7.4-server-info.txt', info);
        const [replication] = await send(engines, readInfo.request(context, { connection: id, part: 'replication' }));
        await writeText('redis-7.4-server-info-replication.txt', replication);
        const [list] = await send(engines, readClients.request(context, { connection: id }));
        await writeText('redis-7.4-server-client-list.txt', list);
        const slowLog = await send(
          engines,
          readSlowLog.request(context, { connection: id, part: 'entries-and-threshold' }),
        );
        await write('redis-7.4-server-slowlog.json', slowLog);
        const memory = await send(engines, readMemory.request(context, { connection: id, doctor: true }));
        await write('redis-7.4-server-memory-stats-resp3.json', memory[0]);
        await writeText('redis-7.4-server-memory-doctor.txt', memory[1]);
        const [config] = await send(engines, readConfig.request(context, { connection: id }));
        await write('redis-7.4-server-config-get-all-resp3.json', config);
        await recordLargestKeys(engines);
        await recordResp2(url);
        expect(readSlowLog.parse(slowLog, { part: 'entries-and-threshold' }).threshold).toEqual({
          kind: 'read',
          value: { microseconds: Number(threshold) },
        });
      } finally {
        await engines.disconnectAll();
      }
    },
  );
});
