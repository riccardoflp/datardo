/**
 * redis-oplog against real servers (M11's exit criterion): a write to documents through a connection linked to a Redis
 * connection publishes the events Meteor's redis-oplog expects, which a subscriber receives on the collection's channel
 * and on each document's (`oplog.publish`, `oplog.message`, `oplog.changes`), the undo of the write included.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from 'redis';
import type { Json } from '../../../src/shared/engine-request';
import type { Target } from '../../../src/shared/target';
import { testServers } from '../servers';
import { live, localId, type Live } from '../undo/live';

const servers = testServers();
const database = 'oplog_it';
const collection = 'orders';
const target: Target = { kind: 'collection', connection: localId, database, collection };
let runner: Live;
let subscriber: ReturnType<typeof createClient>;
const received: { channel: string; message: unknown }[] = [];

async function send(method: string, args: readonly Json[]): Promise<unknown> {
  return runner.engines.send(
    { connection: localId, request: { engine: 'mongodb', database, collection, method, arguments: args } },
    AbortSignal.timeout(30_000),
  );
}

/** Waits until the subscriber has `count` messages, at most 5 seconds. */
async function receivedAtLeast(count: number): Promise<void> {
  const until = Date.now() + 5000;
  while (received.length < count && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** The messages received since the last call, without the prefix of this run. */
function taken(): { channel: string; message: unknown }[] {
  return received.splice(0).map((each) => ({ ...each, channel: each.channel.slice(runner.prefix.length) }));
}

beforeAll(async () => {
  runner = await live();
  await send('drop', []).catch(() => undefined);
  await send('insertMany', [
    [
      { _id: 'a', status: 'new' },
      { _id: { $oid: '65f1c0ffee0000000000a2c1' }, status: 'new' },
    ],
  ]);
  subscriber = createClient({ url: servers.redis ?? '' });
  await subscriber.connect();
  await subscriber.pSubscribe(`${runner.prefix}*`, (message, channel) => {
    received.push({ channel, message: JSON.parse(message) as unknown });
  });
});

afterAll(async () => {
  await subscriber.pUnsubscribe();
  subscriber.destroy();
  await send('drop', []).catch(() => undefined);
  await runner.close();
});

describe('oplog.publish', () => {
  it('publishes an update to the collection’s channel and to the document’s, with the fields it changed', async () => {
    const ids = ['a', { $oid: '65f1c0ffee0000000000a2c1' }];
    await runner.start('test.update-documents', target, {
      connection: localId,
      database,
      collection,
      ids,
      set: { status: 'paid' },
    });
    await runner.published();
    await receivedAtLeast(4);
    const message = (id: unknown) => ({ e: 'u', d: { _id: id }, f: ['status'] });
    const oid = { $type: 'oid', $value: '65f1c0ffee0000000000a2c1' };
    expect(taken()).toEqual([
      { channel: 'orders', message: message('a') },
      { channel: 'orders::a', message: message('a') },
      { channel: 'orders', message: message(oid) },
      { channel: 'orders::65f1c0ffee0000000000a2c1', message: message(oid) },
    ]);
  });

  it('publishes an insert, then its undo as a removal', async () => {
    await runner.start('test.insert-documents', target, {
      connection: localId,
      database,
      collection,
      documents: [{ _id: 'b', status: 'new' }],
    });
    await runner.published();
    await receivedAtLeast(2);
    expect(taken()).toEqual([
      { channel: 'orders', message: { e: 'i', d: { _id: 'b' } } },
      { channel: 'orders::b', message: { e: 'i', d: { _id: 'b' } } },
    ]);
    await runner.start('undo.last', { kind: 'app' }, null);
    await runner.published();
    await receivedAtLeast(2);
    expect(taken()).toEqual([
      { channel: 'orders', message: { e: 'r', d: { _id: 'b' } } },
      { channel: 'orders::b', message: { e: 'r', d: { _id: 'b' } } },
    ]);
  });

  it('publishes a delete by filter for each document it matched', async () => {
    await runner.start('test.delete-documents', target, {
      connection: localId,
      database,
      collection,
      filter: { _id: 'a' },
    });
    await runner.published();
    await receivedAtLeast(2);
    expect(taken()).toEqual([
      { channel: 'orders', message: { e: 'r', d: { _id: 'a' } } },
      { channel: 'orders::a', message: { e: 'r', d: { _id: 'a' } } },
    ]);
  });
});
