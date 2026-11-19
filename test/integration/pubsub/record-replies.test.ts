/**
 * Records what the Pub/Sub page reads from the test Redis into `test/fixtures/replies/`, named after the server
 * version they came from (testing.md): the replies of `PUBSUB CHANNELS`, `PUBSUB NUMSUB` and `PUBSUB NUMPAT` with
 * clients subscribed (`pubsub.channels`), the reply of `PUBLISH`, the refusals of a user whose ACL denies `PUBSUB` or
 * every channel, and the messages a subscriber receives, as bytes, for a redis-oplog event published on its three
 * channels, a JSON message and a message that is not UTF-8 (`pubsub.keep`, `pubsub.event-rows`). It runs only when
 * `DATARDO_RECORD_REPLIES=1`.
 *
 * Replies are written as JSON: text as a string, bytes that are not text as `{ "$hex": … }`, a map as
 * `{ "$map": [[key, value], …] }`, an error as `{ "$error": … }` (`test/unit/console/context.ts` reads them back).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from 'redis';
import { describe, expect, it } from 'vitest';
import { createEngines } from '../../../src/engines';
import type { RedisReply } from '../../../src/shared/engine-request';
import { redisCommand } from '../../../src/shared/engine-request';
import { connectionId, type ConnectionId } from '../../../src/shared/ids';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const strict = new TextDecoder('utf-8', { fatal: true });
const prefix = 'datardo-record:';

type Engines = ReturnType<typeof createEngines>;

function asJson(reply: RedisReply | Buffer): unknown {
  if (reply instanceof Uint8Array) {
    try {
      return strict.decode(reply);
    } catch {
      return { $hex: Buffer.from(reply).toString('hex') };
    }
  }
  if (Array.isArray(reply)) {
    return (reply as readonly RedisReply[]).map(asJson);
  }
  if (reply !== null && typeof reply === 'object' && 'kind' in reply) {
    return reply.kind === 'map'
      ? { $map: reply.entries.map(([key, each]) => [asJson(key), asJson(each)]) }
      : { $error: reply.message };
  }
  return reply;
}

async function send(engines: Engines, id: ConnectionId, ...words: (string | Uint8Array)[]): Promise<RedisReply> {
  return (await engines.send(
    { connection: id, request: redisCommand(0, ...words) },
    AbortSignal.timeout(10_000),
  )) as RedisReply;
}

async function refusal(engines: Engines, id: ConnectionId, ...words: string[]): Promise<string> {
  return send(engines, id, ...words).then(
    () => 'no error',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
}

async function connected(engines: Engines, id: ConnectionId, url: string): Promise<void> {
  await engines.connect(
    id,
    { engine: 'redis', connectionString: url, connectTimeoutMs: 10_000 },
    AbortSignal.timeout(20_000),
  );
}

async function writeJson(name: string, value: unknown): Promise<void> {
  await writeFile(join(folder, name), `${JSON.stringify(value, null, 2)}\n`);
}

/** A subscriber of the `redis` package, in buffer mode, that keeps what it receives in the order it arrives. */
type Received = { channel: Buffer; pattern?: string; message: Buffer };

/** What the recorder does with a subscriber once its messages arrived. */
interface Subscriber {
  subscribe(channels: string | string[], listener: () => void): Promise<void>;
  destroy(): void;
}

async function subscriber(url: string, received: Received[] | undefined): Promise<Subscriber> {
  const client = createClient({ url });
  await client.connect();
  if (received !== undefined) {
    await client.pSubscribe(
      `${prefix}*`,
      (message: Buffer, channel: Buffer) => {
        received.push({ channel, pattern: `${prefix}*`, message });
      },
      true,
    );
  }
  return client;
}

async function deniedRefusals(engines: Engines, id: ConnectionId, url: string): Promise<Record<string, string>> {
  const users = { 'datardo-record-no-pubsub': '-pubsub', 'datardo-record-no-channel': 'resetchannels' } as const;
  const refusals: Record<string, string> = {};
  for (const [user, rule] of Object.entries(users)) {
    await send(engines, id, 'ACL', 'SETUSER', user, 'reset', 'on', '>record-only', '~*', '&*', '+@all', rule);
    const denied = createEngines();
    const deniedId = connectionId(user);
    try {
      const address = new URL(url);
      address.username = user;
      address.password = 'record-only';
      await connected(denied, deniedId, address.toString());
      refusals[user] =
        rule === '-pubsub'
          ? await refusal(denied, deniedId, 'PUBSUB', 'CHANNELS')
          : await refusal(denied, deniedId, 'PUBLISH', 'orders', 'hello');
    } finally {
      await denied.disconnectAll();
      await send(engines, id, 'ACL', 'DELUSER', user);
    }
  }
  return refusals;
}

/** What a subscriber of the prefix receives for an event of redis-oplog, a JSON message and bytes that are not text. */
async function publishAll(engines: Engines, id: ConnectionId): Promise<void> {
  const event = '{"e":"u","d":{"_id":"abc"},"f":["qty"]}';
  for (const channel of ['orders', 'tenant1::orders', 'orders::abc']) {
    await send(engines, id, 'PUBLISH', `${prefix}${channel}`, event);
  }
  await send(engines, id, 'PUBLISH', `${prefix}orders`, '{"status":"paid"}');
  await send(engines, id, 'PUBLISH', `${prefix}orders`, Uint8Array.of(0x00, 0xff, 0x41));
}

async function record(url: string): Promise<void> {
  const engines = createEngines();
  const id = connectionId('record');
  await connected(engines, id, url);
  const received: Received[] = [];
  const clients = [await subscriber(url, received), await subscriber(url, undefined), await subscriber(url, undefined)];
  try {
    const info = new TextDecoder().decode((await send(engines, id, 'INFO', 'server')) as Uint8Array);
    const version = (/redis_version:([\d.]+)/u.exec(info)?.[1] ?? 'unknown').split('.').slice(0, 2).join('.');
    const listener = (): void => undefined;
    await clients[1]?.subscribe([`${prefix}orders`, `${prefix}invoices`], listener);
    await clients[2]?.subscribe(`${prefix}orders`, listener);
    const replies = {
      channels: asJson(await send(engines, id, 'PUBSUB', 'CHANNELS', `${prefix}*`)),
      numsub: asJson(
        await send(engines, id, 'PUBSUB', 'NUMSUB', `${prefix}orders`, `${prefix}invoices`, `${prefix}none`),
      ),
      numpat: asJson(await send(engines, id, 'PUBSUB', 'NUMPAT')),
      publish: asJson(await send(engines, id, 'PUBLISH', `${prefix}orders`, 'hello')),
      publishNobody: asJson(await send(engines, id, 'PUBLISH', 'datardo-record-nobody', 'hello')),
    };
    await writeJson(`redis-${version}-pubsub-replies.json`, {
      ...replies,
      ...(await deniedRefusals(engines, id, url)),
    });
    received.length = 0;
    await publishAll(engines, id);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await writeJson(
      `redis-${version}-pubsub-messages.json`,
      received.map((each) => ({ channel: asJson(each.channel), pattern: each.pattern, message: asJson(each.message) })),
    );
    expect(received).toHaveLength(5);
  } finally {
    for (const client of clients) {
      client.destroy();
    }
    await engines.disconnectAll();
  }
}

describe('pubsub.channels', () => {
  it.runIf(recording)('records the replies of PUBSUB and PUBLISH, and the messages a subscriber receives', async () => {
    const servers = testServers();
    await mkdir(folder, { recursive: true });
    expect(servers.redis).toBeDefined();
    await record(servers.redis ?? '');
  });
});
