/**
 * The Pub/Sub page against the test servers, for what M18's exit criteria ask beyond the console of a page: a write to
 * a document through the MongoDB connection linked to the page's Redis connection shows as one row, with its
 * collection, its `_id` and its fields (`pubsub.follow-oplog`, `pubsub.event-rows`); 5,000 messages a second are all
 * listed, and the list keeps the newest 10,000 (`pubsub.keep`); a user whose ACL denies `PUBSUB` is told so
 * (`pubsub.channels`). Redis is shared: the channels start with the prefix of the run, the ACL user is the run's own and
 * is deleted at the end.
 */
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { channelsProblem } from '../../../src/features/pubsub/channels';
import { keptMost } from '../../../src/features/pubsub/keep';
import { keptRows, nameText, type EventRow } from '../../../src/features/pubsub/types';
import type { Json } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import { testServers } from '../servers';
import { cacheId, livePubSub, localId, type LivePubSub } from './live';

vi.mock('../../../src/main/connections', () => import('../console/fake-connections'));
vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, dialog: {} }));

const database = 'm18_pubsub';
const collection = 'orders';
let live: LivePubSub;

async function mongo(method: string, args: readonly Json[]): Promise<unknown> {
  return live.engines.send(
    { connection: localId, request: { engine: 'mongodb', database, collection, method, arguments: args } },
    AbortSignal.timeout(30_000),
  );
}

beforeAll(async () => {
  live = await livePubSub();
  await mongo('drop', []).catch(() => undefined);
  await mongo('insertMany', [[{ _id: 'abc', qty: 1 }]]);
});

afterAll(async () => {
  await mongo('drop', []).catch(() => undefined);
  await live.close();
});

describe('pubsub.follow-oplog', () => {
  it('opens the page of the linked connection, subscribes to the prefix once, and shows Events of', async () => {
    expect((await live.start('pubsub.follow-oplog', localId)).kind).toBe('done');
    expect((await live.start('pubsub.follow-oplog', localId)).kind).toBe('done');
    const page = await live.until((each) => each.subscriptions[0]?.answered === true);
    expect(page.eventsOf).toBe(localId);
    expect(live.sent.filter((line) => line === `PSUBSCRIBE ${live.prefix}*`)).toHaveLength(1);
    const tab = live.state().tabs.tabs.find((each) => each.shows.kind === 'page' && each.shows.page === 'pubsub');
    expect(tab?.shows.kind === 'page' ? tab.shows.connection : undefined).toBe(cacheId);
  });

  it('shows a write made in Datardo through the linked connection as one row with its 3 channels: update, orders, "abc", qty', async () => {
    const updated = await live.startOn(
      'test.update-documents',
      { kind: 'collection', connection: localId, database, collection },
      { connection: localId, database, collection, ids: ['abc'], set: { qty: 2 } },
    );
    expect(updated).toEqual({ kind: 'done' });
    await live.published();
    const page = await live.until((each) => {
      const row = keptRows(each.kept)[0];
      return row?.kind === 'event' && row.messages.length === 3;
    });
    const rows = keptRows(page.kept);
    expect(rows).toHaveLength(1);
    const row = rows[0] as EventRow;
    expect(row.event).toMatchObject({ operation: 'update', collection: 'orders', document: '"abc"', fields: ['qty'] });
    expect(row.messages.map((each) => nameText(each.channel))).toEqual([
      `${live.prefix}orders`,
      `${live.prefix}tenant1::orders`,
      `${live.prefix}orders::abc`,
    ]);
  });

  it('with Events of › Off shows each message of the event as its own row, and keeps the subscription', async () => {
    expect((await live.start('pubsub.follow-oplog', cacheId, 'off')).kind).toBe('done');
    const page = await live.until((each) => each.kept.link === undefined);
    expect(keptRows(page.kept).map((row) => row.kind)).toEqual(['message', 'message', 'message']);
    expect(page.subscriptions).toHaveLength(1);
    expect(page.eventsOf).toBeUndefined();
  });
});

describe('pubsub.keep', () => {
  it('lists 5,000 messages published within one second, and keeps the newest 10,000', async () => {
    expect((await live.start('pubsub.clear', cacheId)).kind).toBe('done');
    const flood = `${live.prefix}flood`;
    const publish = (from: number, count: number) =>
      Promise.all(Array.from({ length: count }, (_, index) => live.command('PUBLISH', flood, String(from + index))));
    const started = Date.now();
    await publish(0, 5000);
    expect(Date.now() - started).toBeLessThan(5000);
    await live.until((each) => each.kept.listed.length === 5000, cacheId, 5000);
    await publish(5000, 5001);
    const page = await live.until(
      (each) => each.kept.dropped >= 1 && each.kept.listed.length === keptMost,
      cacheId,
      10_000,
    );
    expect(page.kept.dropped).toBe(1);
    const first = keptRows(page.kept)[0];
    expect(first?.kind === 'message' ? new TextDecoder().decode(first.message) : '').toBe('1');
  });
});

describe('pubsub.channels', () => {
  it('tells a user whose ACL denies PUBSUB that it may not run it', async () => {
    const user = `m18-${randomBytes(4).toString('hex')}`;
    const password = randomBytes(8).toString('hex');
    const limitedId = connectionId('c-m18-limited');
    const url = new URL(testServers().redis ?? '');
    url.username = user;
    url.password = password;
    await live.command('ACL', 'SETUSER', user, 'on', `>${password}`, '~m18:*', '+@all', '-pubsub');
    try {
      await live.engines.connect(
        limitedId,
        { engine: 'redis', connectionString: url.toString(), connectTimeoutMs: 10_000 },
        AbortSignal.timeout(30_000),
      );
      const result = await live.start('pubsub.channels', limitedId, { command: 'channels', filter: '', sent: 1 });
      expect(result.kind).toBe('failed');
      const message = result.kind === 'failed' ? (result.details ?? result.message) : '';
      expect(channelsProblem(message)).toMatch(/^PUBSUB CHANNELS needs a user that may run it: NOPERM/u);
    } finally {
      await live.engines.disconnect(limitedId);
      await live.command('ACL', 'DELUSER', user);
    }
  });
});
