/**
 * The Pub/Sub page against the test Redis (M18): its own connection named `datardo-pubsub`, subscribing and
 * unsubscribing, the messages as they arrive with the pause, **Clear** and the export, publishing with the number of
 * clients the server answers, the active channels, a read-only connection, and what happens when the page's
 * connection is closed by the server. Redis is shared: every channel and pattern starts with the prefix of the run, and
 * the only client closed is the page's own.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ChannelsRead } from '../../../src/features/pubsub/channels';
import {
  keptRows,
  nameText,
  subscriptionArgs,
  type Message,
  type PubSubPage,
} from '../../../src/features/pubsub/types';
import { bytesOf } from '../../../src/features/pubsub/types';
import { tabId } from '../../../src/shared/ids';
import { cacheId, livePubSub, pageClientId, readOnlyId, type LivePubSub } from './live';

vi.mock('../../../src/main/connections', () => import('../console/fake-connections'));
vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, dialog: {} }));

const decoder = new TextDecoder();
let live: LivePubSub;

function channel(name: string): string {
  return `${live.prefix}${name}`;
}

function messages(page: PubSubPage): readonly Message[] {
  return keptRows(page.kept).filter((row): row is Message => row.kind === 'message');
}

function texts(page: PubSubPage): readonly string[] {
  return messages(page).map((each) => `${nameText(each.channel)} ${decoder.decode(each.message)}`);
}

async function clientLine(id: number): Promise<string> {
  return decoder.decode((await live.command('CLIENT', 'LIST', 'ID', String(id))) as Uint8Array).trim();
}

async function subscribe(names: string, kind = 'auto', connection = cacheId): Promise<void> {
  const result = await live.start('pubsub.subscribe', connection, { names, kind });
  expect(result.kind).toBe('done');
}

function logText(): string {
  return live
    .state()
    .runner.log.map((line) => line.text)
    .join('\n');
}

function notified(): readonly string[] {
  return live.state().runner.notifications.map((each) => each.text);
}

beforeAll(async () => {
  live = await livePubSub();
});

afterAll(async () => {
  await live.close();
});

describe('pubsub.show', () => {
  it('opens one tab titled Pub/Sub, not subscribed, and sends neither SUBSCRIBE nor PSUBSCRIBE', async () => {
    await live.openTab();
    await live.openTab();
    const tabs = live.state().tabs.tabs.filter((tab) => tab.shows.kind === 'page' && tab.shows.page === 'pubsub');
    expect(tabs.map((tab) => tab.shows.kind === 'page' && tab.shows.title)).toEqual(['Pub/Sub']);
    expect(live.page().subscriptions).toEqual([]);
    expect(live.sent.filter((line) => /^P?SUBSCRIBE/u.test(line))).toEqual([]);
  });
});

describe('pubsub.subscribe', () => {
  it('subscribes on a connection of its own named datardo-pubsub, a channel and a pattern in that order', async () => {
    await subscribe(channel('orders'));
    await subscribe(channel('news:*'));
    const page = await live.until((each) => each.subscriptions.every((one) => one.answered));
    expect(page.subscriptions.map((each) => [each.kind, nameText(each.name)])).toEqual([
      ['channel', channel('orders')],
      ['pattern', channel('news:*')],
    ]);
    expect(live.sent).toContain(`SUBSCRIBE ${channel('orders')}`);
    expect(live.sent).toContain(`PSUBSCRIBE ${channel('news:*')}`);
    expect(page.pageConnection).toBe('open');
    expect(await clientLine(await pageClientId(live))).toContain('name=datardo-pubsub');
  });

  it('keeps the subscriptions with the tab, to subscribe again once restored', () => {
    const tab = live.state().tabs.tabs.find((each) => each.shows.kind === 'page' && each.shows.page === 'pubsub');
    const kept = JSON.parse(tab?.memory?.choices?.['subscriptions'] ?? '[]') as unknown;
    expect(kept).toEqual(live.page().subscriptions.map(subscriptionArgs));
  });
});

describe('pubsub.messages', () => {
  it('lists a message published by another client, with its channel, and one more through a pattern', async () => {
    await live.command('PUBLISH', channel('orders'), 'hello');
    await live.command('PUBLISH', channel('news:today'), bytesOf('{"a":"b"}'));
    const page = await live.until((each) => messages(each).length >= 2);
    expect(texts(page)).toEqual([`${channel('orders')} hello`, `${channel('news:today')} {"a":"b"}`]);
    expect(
      messages(page)[1]?.pattern === undefined ? '' : nameText(messages(page)[1]?.pattern ?? new Uint8Array()),
    ).toBe(channel('news:*'));
    expect(page.subscriptions.map((each) => each.received)).toEqual([1, 1]);
  });

  it('keeps the bytes of a message that is not text', async () => {
    await live.command('PUBLISH', channel('orders'), new Uint8Array([0x00, 0xff, 0x41]));
    const page = await live.until((each) => messages(each).length >= 3);
    expect([...(messages(page)[2]?.message ?? [])]).toEqual([0x00, 0xff, 0x41]);
  });
});

describe('pubsub.pause', () => {
  it('holds the messages while paused, sends nothing, and lists them on resume with the times they arrived', async () => {
    const before = live.sent.length;
    expect((await live.start('pubsub.pause', cacheId)).kind).toBe('done');
    await live.command('PUBLISH', channel('orders'), 'held');
    const paused = await live.until((each) => each.kept.held.length === 1);
    expect(messages({ ...paused, kept: { ...paused.kept, held: [] } }).length).toBe(3);
    expect((await live.start('pubsub.pause', cacheId, 'resume')).kind).toBe('done');
    const resumed = await live.until((each) => !each.kept.paused);
    expect(texts(resumed).at(-1)).toBe(`${channel('orders')} held`);
    expect(live.sent.slice(before)).toEqual([]);
  });
});

describe('pubsub.export', () => {
  it('writes the messages as JSON Lines, the older first, to the file chosen', async () => {
    live.answers = { messages: 'all', format: 'jsonl' };
    live.file = join(tmpdir(), 'pubsub-m18.jsonl');
    const result = await live.start('pubsub.export', cacheId);
    expect(result.kind).toBe('done');
    const lines = (live.files.get(live.file) ?? '').trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ channel: channel('orders'), message: 'hello' });
    expect(JSON.parse(lines[2] ?? '{}')).toMatchObject({ messageHex: '00ff41' });
  });

  it('writes no file when the file dialog is cancelled', async () => {
    live.file = null;
    const written = live.files.size;
    await live.start('pubsub.export', cacheId);
    expect(live.files.size).toBe(written);
  });
});

describe('pubsub.clear', () => {
  it('empties the list and the counts, sends nothing, and the page stays subscribed', async () => {
    const before = live.sent.length;
    expect((await live.start('pubsub.clear', cacheId)).kind).toBe('done');
    expect(keptRows(live.page().kept)).toEqual([]);
    expect(live.page().subscriptions.map((each) => each.received)).toEqual([0, 0]);
    expect(live.sent.slice(before)).toEqual([]);
    await live.command('PUBLISH', channel('orders'), 'after');
    expect(texts(await live.until((each) => messages(each).length === 1))).toEqual([`${channel('orders')} after`]);
  });
});

describe('pubsub.publish', () => {
  it('publishes from the form and says how many clients received the message', async () => {
    live.answers = { channel: channel('orders'), message: '{"status":"paid"}', sendAs: 'text' };
    expect((await live.start('pubsub.publish', cacheId)).kind).toBe('done');
    expect(notified()).toContain(`Published to ${channel('orders')}: 1 client received it.`);
    expect(logText()).toContain(`PUBLISH ${channel('orders')} "{\\"status\\":\\"paid\\"}"`);
    const page = await live.until((each) => texts(each).includes(`${channel('orders')} {"status":"paid"}`));
    expect(page.lastChannel).toBe(channel('orders'));
  });

  it('says that nobody received a message of a channel nobody follows', async () => {
    live.answers = { channel: channel('nobody'), message: '', sendAs: 'text' };
    expect((await live.start('pubsub.publish', cacheId)).kind).toBe('done');
    expect(notified()).toContain(`Published to ${channel('nobody')}: no client is subscribed, so nobody received it.`);
  });

  it('is refused on a read-only connection, where subscribing works', async () => {
    live.answers = { channel: channel('orders'), message: 'x', sendAs: 'text' };
    const before = live.sent.length;
    const refused = await live.start('pubsub.publish', readOnlyId);
    expect(refused).toMatchObject({ kind: 'refused', code: 'pubsub.publish/read-only' });
    expect(live.sent.slice(before).filter((line) => line.startsWith('PUBLISH'))).toEqual([]);
    await live.openTab(readOnlyId);
    await subscribe(channel('orders'), 'channel', readOnlyId);
    await live.until((each) => each.subscriptions[0]?.answered === true, readOnlyId);
    await live.command('PUBLISH', channel('orders'), 'both');
    await live.until((each) => texts(each).includes(`${channel('orders')} both`), readOnlyId);
  });
});

describe('pubsub.channels', () => {
  async function read(args: Record<string, unknown>): Promise<ChannelsRead> {
    const result = await live.start('pubsub.channels', cacheId, args as never);
    if (result.kind !== 'read') {
      throw new Error(`The read gave ${result.kind}.`);
    }
    return result.result as ChannelsRead;
  }

  it('lists the channels of the run with the pattern typed, and counts their subscribers by name', async () => {
    const before = live.sent.length;
    const listed = await read({ command: 'channels', filter: `${live.prefix}*`, sent: 1 });
    expect(live.sent.slice(before)).toEqual([`PUBSUB CHANNELS ${live.prefix}*`]);
    expect(listed.command === 'channels' ? listed.names.map((each) => nameText(each)) : []).toEqual([
      channel('orders'),
    ]);
    const counted = await read({
      command: 'numsub',
      channels: [Buffer.from(channel('orders')).toString('hex')],
      sent: 1,
    });
    expect(counted.command === 'numsub' ? counted.counts.map(([, count]) => count) : []).toEqual([2]);
    const patterns = await read({ command: 'numpat', sent: 1 });
    expect(patterns.command === 'numpat' ? patterns.patterns : 0).toBeGreaterThanOrEqual(1);
  });
});

describe('pubsub.reconnect', () => {
  it('shows the banner when the server closes the page’s connection, then listens again with a row for the gap', async () => {
    const id = await pageClientId(live);
    await live.command('CLIENT', 'KILL', 'ID', String(id));
    const disconnected = await live.until((each) => each.pageConnection === 'disconnected');
    expect(disconnected.disconnectedAt).toBeTypeOf('number');
    const again = await live.until((each) => each.pageConnection === 'open', cacheId, 4000);
    expect(keptRows(again.kept).some((row) => row.kind === 'gap')).toBe(true);
    await live.until((each) => each.subscriptions.every((one) => one.answered));
    await live.command('PUBLISH', channel('news:later'), 'back');
    await live.until((each) => texts(each).includes(`${channel('news:later')} back`));
  });
});

describe('pubsub.unsubscribe', () => {
  it('sends UNSUBSCRIBE and PUNSUBSCRIBE, keeps the messages listed, and closes the connection with none left', async () => {
    const id = await pageClientId(live);
    const listed = messages(live.page()).length;
    const result = await live.start('pubsub.unsubscribe', cacheId, 'all');
    expect(result.kind).toBe('done');
    expect(live.sent).toContain(`UNSUBSCRIBE ${channel('orders')}`);
    expect(live.sent).toContain(`PUNSUBSCRIBE ${channel('news:*')}`);
    const page = await live.until((each) => each.subscriptions.length === 0);
    expect(messages(page).length).toBe(listed);
    expect(await clientLine(id)).toBe('');
  });

  it('closes the page’s connection when its tab is closed', async () => {
    const id = await pageClientId(live, readOnlyId);
    const tab = live
      .state()
      .tabs.tabs.find((each) => each.shows.kind === 'page' && each.shows.connection === readOnlyId);
    live.dispatch({ slice: 'tabs', type: 'closed', tab: tabId(tab?.id ?? ''), at: Date.now() });
    for (let waited = 0; waited < 5000 && (await clientLine(id)) !== ''; waited += 50) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(await clientLine(id)).toBe('');
  });
});
