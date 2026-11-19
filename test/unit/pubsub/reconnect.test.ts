import { describe, expect, it } from 'vitest';
import { messagesAfter } from '../../../src/features/pubsub/keep';
import { pausedPage } from '../../../src/features/pubsub/pause';
import {
  bannerOf,
  disconnectedPage,
  gapText,
  notConnectedPage,
  plan,
  reconnectedPage,
  retryDelayMs,
  retryFailedPage,
  secondsToRetry,
} from '../../../src/features/pubsub/reconnect';
import { stateText } from '../../../src/features/pubsub/show';
import type { PubSubPage, Subscription } from '../../../src/features/pubsub/types';
import { arrived, bytes, cacheLocal, now, offset, pageOf, pubsubContext, pubsubState, stepTexts } from './context';

function subscribed(kind: Subscription['kind'], name: string): Subscription {
  return { kind, name: bytes(name), answered: true, received: 0 };
}

const listening: PubSubPage = pageOf({
  pageConnection: 'open',
  subscriptions: [subscribed('channel', 'orders'), subscribed('channel', 'invoices'), subscribed('pattern', 'news:*')],
});

function reconnect(page: PubSubPage, notConnected: readonly string[] = []): readonly string[] {
  const state = pubsubState([page], undefined, notConnected);
  return stepTexts(plan(pubsubContext('pubsub.reconnect', state), {}));
}

describe('pubsub.reconnect', () => {
  it('shows the banner with the time the connection closed, then Listening again with a row Disconnected from … to …', () => {
    const closed = disconnectedPage(listening, now);
    expect(bannerOf(closed)).toEqual([
      'The Pub/Sub connection closed at 18:20:00. Messages published since then are not received: Redis does not keep them.',
    ]);
    const back = reconnectedPage(closed, now + 1500);
    expect(stateText(back, now + 1500)).toBe('● Listening');
    expect(bannerOf(back)).toBeUndefined();
    const gap = back.kept.listed[0];
    expect(gap?.kind === 'gap' ? gapText(gap, offset) : '').toBe(
      'Disconnected from 18:20:00 to 18:20:01: messages published in between were not received.',
    );
  });

  it('subscribes again to every channel and pattern the page had', () => {
    expect(reconnect(disconnectedPage(listening, now))).toEqual([
      'open a connection to cache:6379 for Pub/Sub',
      'HELLO 3 SETNAME datardo-pubsub',
      'SUBSCRIBE orders invoices',
      'PSUBSCRIBE news:*',
    ]);
  });

  it('tries 1, 2, 4, 8 and 16 seconds apart, then every 30 seconds', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(retryDelayMs)).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]);
    let page = disconnectedPage(listening, now);
    expect(page.retryAt).toBe(now + 1000);
    page = retryFailedPage(page, now + 1000, 'connect ECONNREFUSED 127.0.0.1:6379');
    expect([page.retryAt, secondsToRetry(page, now + 1000)]).toEqual([now + 3000, 2]);
    expect(bannerOf(page)?.[1]).toBe('connect ECONNREFUSED 127.0.0.1:6379');
  });

  it('never lists a message published while disconnected: the gap row stands for it', () => {
    const back = reconnectedPage(disconnectedPage(listening, now), now + 5000);
    expect(back.kept.listed.map((row) => row.kind)).toEqual(['gap']);
  });

  it('makes no try after connection.disconnect, and subscribes again after connection.connect', () => {
    const page = notConnectedPage(listening, now);
    expect(page.retryAt).toBeUndefined();
    expect(stateText(page, now)).toBe('■ Not connected');
    expect(reconnect(page, [cacheLocal.id])).toEqual([]);
    expect(reconnect(page)).toContain('SUBSCRIBE orders invoices');
  });

  it('plans nothing for a page with no subscription', () => {
    expect(reconnect(disconnectedPage(pageOf({ pageConnection: 'open' }), now))).toEqual([]);
  });

  it('ends a pause when the connection closes, the messages it held listed', () => {
    const paused = pausedPage(listening);
    const held = { ...paused, kept: messagesAfter(paused.kept, [arrived('orders', 'x')]) };
    const closed = disconnectedPage(held, now);
    expect([closed.kept.paused, closed.kept.listed.length]).toEqual([false, 1]);
  });

  it('dims every subscription until the server answers again', () => {
    expect(disconnectedPage(listening, now).subscriptions.every((each) => !each.answered)).toBe(true);
  });
});
