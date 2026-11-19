/**
 * Records the replies the reads of the keys area get from a real Redis into `test/fixtures/replies/redis-<version>-keys.json`
 * (testing.md, R11.3): the requests are those the reads build (`key.scan`, `key.scan:types`, `key.details`,
 * `key.inspect:read`, the `EXISTS` and `TYPE` of the operations, the pages `key.export` reads), sent as the runner
 * sends them. It runs only when `DATARDO_RECORD_REPLIES=1`, on a database the tests may empty; the unit tests of the
 * `parse` functions read the file.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from 'redis';
import { describe, expect, it } from 'vitest';
import { createEngines } from '../../../src/engines';
import * as details from '../../../src/features/key/details';
import * as exportKeys from '../../../src/features/key/export';
import * as inspect from '../../../src/features/key/inspect';
import * as scan from '../../../src/features/key/scan';
import type { ConnectionRequest, Json, RedisReply } from '../../../src/shared/engine-request';
import { redisCommand } from '../../../src/shared/engine-request';
import type { Context, ReadRequest } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const signal = (): AbortSignal => AbortSignal.timeout(20_000);
const id = connectionId('record-keys');

const context: Context = {
  feature: featureId('key.scan'),
  now: 0,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'connection', connection: id },
  state: initialState,
};

/** A reply as JSON: bytes in base64, numbers that JSON cannot hold as text, errors and maps tagged. */
function encoded(reply: unknown): Json {
  if (reply instanceof Uint8Array) {
    return { bytes: Buffer.from(reply).toString('base64') };
  }
  if (Array.isArray(reply)) {
    return reply.map(encoded);
  }
  if (typeof reply === 'number' && !Number.isFinite(reply)) {
    return { number: String(reply) };
  }
  if (typeof reply === 'object' && reply !== null) {
    const tagged = reply as { kind?: string; message?: string; entries?: unknown[][] };
    return tagged.kind === 'error'
      ? { error: tagged.message ?? '' }
      : { map: (tagged.entries ?? []).map(([key, value]) => [encoded(key), encoded(value)]) };
  }
  return reply as Json;
}

async function fill(url: string, database: number): Promise<void> {
  const client = createClient({ url, database });
  await client.connect();
  try {
    await client.flushDb();
    await client.set('session:1', '{"user":7}', { PXAT: 1_798_761_600_000 });
    await client.hSet('user:7', { name: 'Ada Lovelace', visits: '12' });
    await client.hSet('orders:42', { total: '12.5' });
    await client.set('orders:41', 'x', { PX: 7_500_000 });
    await client.rPush('queue:mail', ['a', 'c d', Buffer.from([0x00, 0xff])]);
    await client.sAdd('tags', ['redis', 'keys']);
    await client.zAdd('board', [
      { score: 1.5, value: 'ada' },
      { score: 3, value: 'bob' },
      { score: Number.POSITIVE_INFINITY, value: 'zed' },
    ]);
    await client.xAdd('events', '1700000000000-0', { type: 'signup', user: '7' });
    await client.xAdd('empty-stream', '1-1', { a: 'b' });
    await client.xDel('empty-stream', '1-1');
    await client.set(Buffer.from([0x75, 0x73, 0x65, 0x72, 0x3a, 0xff]), 'not text');
  } finally {
    client.destroy();
  }
}

describe('the recorded replies of the keys area', () => {
  it.runIf(recording)('records the replies of the reads of key.md', async () => {
    const servers = testServers();
    const url = servers.redis;
    const database = servers.redisDatabases[servers.redisDatabases.length - 1] ?? 15;
    expect(url).toBeDefined();
    await fill(url ?? '', database);
    const engines = createEngines();
    await engines.connect(id, { engine: 'redis', connectionString: url ?? '', connectTimeoutMs: 10_000 }, signal());
    const send = async (requests: readonly ConnectionRequest[]): Promise<Json[]> => {
      const replies: Json[] = [];
      for (const each of requests) {
        try {
          replies.push(encoded(await engines.send(each, signal())));
        } catch (error: unknown) {
          replies.push({ error: error instanceof Error ? error.message : String(error) });
        }
      }
      return replies;
    };
    const read = (request: unknown): Promise<Json[]> =>
      send((request as Extract<ReadRequest, { kind: 'engine' }>).requests);
    const command = (...words: (string | Uint8Array)[]): Promise<Json[]> =>
      send([{ connection: id, request: redisCommand(database, ...words) }]);
    const key = (name: string): string => Buffer.from(name).toString('hex');
    try {
      const recorded: Record<string, Json[]> = {};
      const scanArgs = { connection: id, database, pattern: '*', type: 'all', cursor: '0' };
      recorded['scan-all'] = await read(scan.request(context, scanArgs));
      recorded['scan-plain'] = await read(scan.request(context, { ...scanArgs, pattern: '*user:7*', plain: 'user:7' }));
      recorded['scan-hash'] = await read(scan.request(context, { ...scanArgs, pattern: 'user:*', type: 'hash' }));
      recorded['scan-types'] = await read(
        scan.typesRequest(context, {
          connection: id,
          database,
          keys: [key('user:7'), key('board'), key('nothing:here')],
        }),
      );
      recorded['details'] = await read(
        details.request(
          context,
          details.detailsArgs(id, database, [
            Buffer.from('user:7'),
            Buffer.from('orders:41'),
            Buffer.from('nothing:here'),
          ]),
        ),
      );
      recorded['inspect-hash'] = await read(inspect.request(context, { connection: id, database, key: key('user:7') }));
      recorded['inspect-gone'] = await read(
        inspect.request(context, { connection: id, database, key: key('nothing:here') }),
      );
      recorded['exists-taken'] = await command('EXISTS', 'orders:42');
      recorded['exists-free'] = await command('EXISTS', 'orders:43');
      recorded['type-hash'] = await command('TYPE', 'orders:42');
      recorded['type-none'] = await command('TYPE', 'nothing:here');
      recorded['unknown-command'] = await command('MEMORYX', 'USAGE', 'user:7');
      recorded['renamenx-taken'] = await command('RENAMENX', 'orders:41', 'orders:42');
      recorded['rename-gone'] = await command('RENAME', 'nothing:here', 'orders:44');
      recorded['persist-persistent'] = await command('PERSIST', 'user:7');
      recorded['unlink-gone'] = await command('UNLINK', 'nothing:here');
      recorded['copy-taken'] = await command('COPY', 'orders:41', 'orders:42');
      recorded['set-nx-taken'] = await command('SET', 'orders:41', 'y', 'NX');
      recorded['expire-gone'] = await command('EXPIRE', 'nothing:here', '60');
      recorded['pexpiretime'] = await command('PEXPIRETIME', 'session:1');
      for (const name of ['session:1', 'user:7', 'queue:mail', 'tags', 'board', 'events', 'empty-stream']) {
        const type = (await engines.send(
          { connection: id, request: redisCommand(database, 'TYPE', name) },
          signal(),
        )) as Uint8Array;
        let reading = exportKeys.startReading(Buffer.from(name), new TextDecoder().decode(type));
        const pages: Json[] = [];
        for (
          let next = exportKeys.nextValueCommand(reading);
          next !== undefined;
          next = exportKeys.nextValueCommand(reading)
        ) {
          const reply = (await engines.send(
            { connection: id, request: redisCommand(database, ...next) },
            signal(),
          )) as RedisReply;
          pages.push(encoded(reply));
          reading = exportKeys.afterValueReply(reading, reply);
          reading = exportKeys.dumpInstead(reading) ?? reading;
        }
        recorded[`export-${name}`] = pages;
      }
      const info = (await command('INFO', 'server'))[0] as { bytes: string };
      const version = /redis_version:(\d+\.\d+)/u.exec(Buffer.from(info.bytes, 'base64').toString())?.[1] ?? 'unknown';
      await writeFile(join(folder, `redis-${version}-keys.json`), `${JSON.stringify(recorded, null, 2)}\n`);
    } finally {
      await engines.disconnectAll();
    }
  });
});
