/**
 * Records the replies the Reads of the value area get from the test Redis into
 * `test/fixtures/replies/redis-<version>-values.json` (testing.md), on keys of each type written first in the test
 * database: bytes that are not text, equal elements of a list, a score of `inf`, a field with an expiry, a stream with
 * a consumer group and entries pending. It runs only when `DATARDO_RECORD_REPLIES=1`: the unit tests of the `parse`
 * functions read the recorded file, and the file changes only when it is recorded again.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from 'redis';
import { describe, expect, it } from 'vitest';
import { createEngines } from '../../../src/engines';
import * as check from '../../../src/features/value/check';
import * as count from '../../../src/features/value/count';
import * as readHash from '../../../src/features/value/read-hash';
import * as readList from '../../../src/features/value/read-list';
import * as readSet from '../../../src/features/value/read-set';
import * as readSortedSet from '../../../src/features/value/read-sorted-set';
import * as readStream from '../../../src/features/value/read-stream';
import * as readString from '../../../src/features/value/read-string';
import * as streamGroups from '../../../src/features/value/stream-groups';
import type { Json, RedisReply } from '../../../src/shared/engine-request';
import { redisCommand } from '../../../src/shared/engine-request';
import type { Context, Outcome, ReadRequest } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const servers = testServers();
const [database = 15] = servers.redisDatabases;
const id = connectionId('value-record');
const signal = (): AbortSignal => AbortSignal.timeout(20_000);
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

type Request = (context: Context, args: Json) => ReadRequest | Outcome;

/** A read recorded: the feature, its key and its arguments. */
interface Case {
  readonly name: string;
  readonly feature: string;
  readonly request: Request;
  readonly key: string | Uint8Array;
  readonly args: Json;
}

const notText = Uint8Array.from([0x00, 0xff, 0x41]);

const cases: readonly Case[] = [
  { name: 'type-hash', feature: 'value.check', request: check.request, key: 'user:7', args: null },
  { name: 'type-none', feature: 'value.check', request: check.request, key: 'gone:1', args: null },
  {
    name: 'check-hget',
    feature: 'value.check',
    request: check.request,
    key: 'user:7',
    args: {
      commands: [
        ['HGET', 'user:7', 'nickname'],
        ['HEXISTS', 'user:7', 'email'],
      ],
    },
  },
  { name: 'count-hash', feature: 'value.count', request: count.request, key: 'user:7', args: { type: 'hash' } },
  { name: 'string-length', feature: 'value.read-string', request: readString.request, key: 'orders:42', args: {} },
  {
    name: 'string-whole',
    feature: 'value.read-string',
    request: readString.request,
    key: 'orders:42',
    args: { length: 5 },
  },
  {
    name: 'string-compact',
    feature: 'value.read-string',
    request: readString.request,
    key: 'orders:42',
    args: { form: 'compact' },
  },
  {
    name: 'string-not-text',
    feature: 'value.read-string',
    request: readString.request,
    key: 'raw:1',
    args: { length: 3 },
  },
  { name: 'hash-scan', feature: 'value.read-hash', request: readHash.request, key: 'user:7', args: {} },
  {
    name: 'hash-expiry',
    feature: 'value.read-hash',
    request: readHash.request,
    key: 'user:7',
    args: { expiryOf: [{ hex: '6e69636b6e616d65' }, { hex: '6e616d65' }] },
  },
  { name: 'set-scan', feature: 'value.read-set', request: readSet.request, key: 'tags', args: {} },
  { name: 'list-head', feature: 'value.read-list', request: readList.request, key: 'queue:mail', args: {} },
  {
    name: 'list-tail',
    feature: 'value.read-list',
    request: readList.request,
    key: 'queue:mail',
    args: { from: 'tail' },
  },
  {
    name: 'list-index',
    feature: 'value.read-list',
    request: readList.request,
    key: 'queue:mail',
    args: { from: 'index', index: '2' },
  },
  { name: 'zset-lowest', feature: 'value.read-sorted-set', request: readSortedSet.request, key: 'scores', args: {} },
  {
    name: 'zset-highest',
    feature: 'value.read-sorted-set',
    request: readSortedSet.request,
    key: 'scores',
    args: { order: 'highest' },
  },
  {
    name: 'zset-range',
    feature: 'value.read-sorted-set',
    request: readSortedSet.request,
    key: 'scores',
    args: { min: '0', max: '' },
  },
  {
    name: 'zset-older',
    feature: 'value.read-sorted-set',
    request: readSortedSet.request,
    key: 'scores',
    args: { older: true, order: 'highest' },
  },
  { name: 'stream-newest', feature: 'value.read-stream', request: readStream.request, key: 'events', args: {} },
  {
    name: 'stream-oldest',
    feature: 'value.read-stream',
    request: readStream.request,
    key: 'events',
    args: { order: 'oldest' },
  },
  {
    name: 'groups',
    feature: 'value.stream-groups',
    request: streamGroups.request,
    key: 'events',
    args: { part: 'groups', group: '' },
  },
  {
    name: 'group',
    feature: 'value.stream-groups',
    request: streamGroups.request,
    key: 'events',
    args: { part: 'group', group: 'mailers' },
  },
  {
    name: 'consumer',
    feature: 'value.stream-groups',
    request: streamGroups.request,
    key: 'events',
    args: { part: 'consumer', group: 'mailers', consumer: 'worker-1' },
  },
];

/** A reply as JSON: bytes in base64, a score of `inf` as `{double}`, a map as its entries, an error as its message. */
function encoded(reply: RedisReply): unknown {
  if (reply instanceof Uint8Array) {
    return { bytes: Buffer.from(reply).toString('base64') };
  }
  if (typeof reply === 'number' && !Number.isFinite(reply)) {
    return { double: String(reply) };
  }
  if (Array.isArray(reply)) {
    return (reply as readonly RedisReply[]).map(encoded);
  }
  if (reply !== null && typeof reply === 'object' && 'kind' in reply) {
    return reply.kind === 'map'
      ? { map: reply.entries.map(([key, value]) => [encoded(key), encoded(value)]) }
      : { error: reply.message };
  }
  return reply;
}

async function seed(url: string): Promise<boolean> {
  const client = createClient({ url, database });
  await client.connect();
  try {
    await client.flushDb();
    await client.set('orders:42', 'hello');
    await client.set('raw:1', Buffer.from(notText));
    await client.hSet('user:7', { name: 'Ada Lovelace', nickname: 'Ada', age: '36' });
    const fieldExpiry = await client.sendCommand(['HPEXPIRE', 'user:7', '600000', 'FIELDS', '1', 'nickname']);
    await client.rPush('queue:mail', ['a', 'b', 'a', 'c']);
    await client.rPush('queue:mail', Buffer.from([0x00, 0xff]));
    await client.sAdd('tags', ['red', 'green', 'blue']);
    await client.sendCommand(['ZADD', 'scores', '10', 'alice', '2.5', 'bob', '+inf', 'carol', '-inf', 'dave']);
    await client.sendCommand(['XADD', 'events', '1763400000000-0', 'type', 'click', 'page', 'home']);
    await client.sendCommand(['XADD', 'events', '1763400000001-0', 'type', 'view']);
    await client.sendCommand(['XADD', 'events', '1763400000002-0', 'type', 'click', 'page', 'cart']);
    await client.sendCommand(['XGROUP', 'CREATE', 'events', 'mailers', '0']);
    await client.sendCommand(['XGROUP', 'CREATE', 'events', 'idle', '$']);
    await client.sendCommand(['XREADGROUP', 'GROUP', 'mailers', 'worker-1', 'COUNT', '2', 'STREAMS', 'events', '>']);
    return Array.isArray(fieldExpiry);
  } finally {
    client.destroy();
  }
}

async function replies(engines: ReturnType<typeof createEngines>, each: Case): Promise<unknown[]> {
  const key = typeof each.key === 'string' ? utf8(each.key) : each.key;
  const context: Context = {
    feature: featureId(each.feature),
    now: 1_763_400_000_000,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'key', connection: id, database, key },
    state: initialState,
  };
  const read = each.request(context, each.args);
  if (!('kind' in read) || read.kind !== 'engine') {
    throw new Error(`The read ${each.name} asks no engine.`);
  }
  const answers: unknown[] = [];
  for (const one of read.requests) {
    const reply = await engines.send({ connection: one.connection, request: one.request }, signal());
    answers.push(encoded(reply as RedisReply));
  }
  return answers;
}

describe('the recorded replies of the value area', () => {
  it.runIf(recording && servers.redis !== undefined)('records the reads of every type on Redis', async () => {
    const url = servers.redis ?? '';
    const fieldExpiry = await seed(url);
    const engines = createEngines();
    await engines.connect(id, { engine: 'redis', connectionString: url, connectTimeoutMs: 10_000 }, signal());
    try {
      const info = await engines.send({ connection: id, request: redisCommand(0, 'INFO', 'server') }, signal());
      const text = new TextDecoder().decode(info as Uint8Array);
      const version = /redis_version:(\d+\.\d+)/u.exec(text)?.[1] ?? 'unknown';
      const recorded: Record<string, unknown> = { fieldExpiry };
      for (const each of cases) {
        recorded[each.name] = { args: each.args, replies: await replies(engines, each) };
      }
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, `redis-${version}-values.json`), `${JSON.stringify(recorded, null, 2)}\n`);
      expect(Object.keys(recorded)).toHaveLength(cases.length + 1);
    } finally {
      await engines.disconnectAll();
    }
  });
});
