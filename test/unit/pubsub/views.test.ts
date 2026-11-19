import { describe, expect, it } from 'vitest';
import { clearedPage } from '../../../src/features/pubsub/clear';
import { view as inspect } from '../../../src/features/pubsub/inspect';
import { keptWithLink, messagesAfter } from '../../../src/features/pubsub/keep';
import { announceEveryMs, announceText, newRowsText, view as messages } from '../../../src/features/pubsub/messages';
import { pausedPage } from '../../../src/features/pubsub/pause';
import { isOffered, plan as show, pubsubTab, view as showView } from '../../../src/features/pubsub/show';
import type { ShowInput } from '../../../src/features/pubsub/show';
import { subscriptionsAfter, view as subscriptions } from '../../../src/features/pubsub/subscriptions';
import type { PubSubPage, Subscription } from '../../../src/features/pubsub/types';
import {
  appLink,
  arrived,
  bytes,
  cacheLocal,
  cacheProduction,
  keptWith,
  local,
  now,
  pageOf,
  planOf,
  pubsubContext,
  pubsubState,
} from './context';

function subscribed(kind: Subscription['kind'], name: string, received = 0): Subscription {
  return { kind, name: bytes(name), answered: true, received };
}

const orders = subscribed('channel', 'orders');
const news = subscribed('pattern', 'news:*');

function shown(page: PubSubPage, overrides: Partial<ShowInput> = {}): ReturnType<typeof showView> {
  return showView({ page, connectionName: 'Cache local', readOnly: false, linked: [], now, ...overrides });
}

describe('pubsub.show', () => {
  it('opens one tab titled Pub/Sub in Cache local’s group, which tab.open makes active when it is open already', () => {
    const planned = planOf(show(pubsubContext('pubsub.show', pubsubState()), {}));
    expect(planned.steps).toEqual([]);
    expect(planned.after).toEqual([
      {
        kind: 'start',
        feature: 'tab.open',
        target: { kind: 'connection', connection: cacheLocal.id },
        args: { shows: pubsubTab(cacheLocal.id) },
      },
    ]);
    expect(pubsubTab(cacheLocal.id)).toEqual({
      kind: 'page',
      connection: cacheLocal.id,
      page: 'pubsub',
      title: 'Pub/Sub',
    });
  });

  it('connects Cache local first when it is not connected', () => {
    const state = pubsubState([], [cacheLocal], [cacheLocal.id]);
    expect(
      planOf(show(pubsubContext('pubsub.show', state), {})).after.map(
        (after) => after.kind === 'start' && after.feature,
      ),
    ).toEqual(['connection.connect', 'tab.open']);
  });

  it('is not offered with a MongoDB connection current, and opens nothing there', () => {
    const context = pubsubContext('pubsub.show', pubsubState(), local);
    expect(isOffered(context, local.id)).toBe(false);
    expect(isOffered(context, cacheLocal.id)).toBe(true);
    expect(planOf(show(context, {})).after).toEqual([]);
  });

  it('shows ■ Not subscribed and the empty state with no subscription, and sends neither SUBSCRIBE nor PSUBSCRIBE', () => {
    const page = pageOf();
    expect(shown(page).state).toBe('■ Not subscribed');
    expect(messages({ page, now }).empty).toBe(
      'Subscribe to a channel or to a pattern to see its messages. A message published before you subscribe is not shown: Redis does not keep it.',
    );
    expect(planOf(show(pubsubContext('pubsub.show', pubsubState([page])), {})).steps).toEqual([]);
  });

  it('shows the state on one line: Listening, Paused with the messages held, Disconnected with the next try', () => {
    const listening = pageOf({ pageConnection: 'open', subscriptions: [orders] });
    expect(shown(listening).state).toBe('● Listening');
    const paused = pausedPage(listening);
    expect(shown(paused).state).toBe('❚❚ Paused');
    const held = {
      ...paused,
      kept: messagesAfter(
        paused.kept,
        Array.from({ length: 42 }, () => arrived('orders', 'x')),
      ),
    };
    expect(shown(held).state).toBe('❚❚ Paused · 42 new');
    expect(shown(held).toolbar.pause).toEqual(expect.objectContaining({ label: 'Resume (42)', args: 'resume' }));
    const disconnected = pageOf({ pageConnection: 'disconnected', subscriptions: [orders], retryAt: now + 3500 });
    expect(shown(disconnected).state).toBe('■ Disconnected · trying again in 4 s');
    expect(shown(pageOf({ pageConnection: 'not-connected' })).connect?.feature).toBe('connection.connect');
  });

  it('counts the subscriptions and the messages, and keeps the messages that arrive while another tab is active', () => {
    const page = pageOf({
      pageConnection: 'open',
      subscriptions: [orders, news],
      kept: keptWith([arrived('orders', 'x')]),
    });
    expect(shown(page).counts).toBe('2 subscriptions · 1 message');
  });

  it('restores a page with no messages, not paused', () => {
    const restored = pageOf({ subscriptions: [orders] });
    expect([restored.kept.listed.length, restored.kept.paused, restored.pageConnection]).toEqual([0, false, 'closed']);
  });

  it('disables Publish… on Cache production with The connection Cache production is read-only., and offers Subscribe', () => {
    const view = shown(pageOf({}, cacheProduction), { connectionName: 'Cache production', readOnly: true });
    expect(view.toolbar.publish.disabled).toBe('The connection Cache production is read-only.');
    expect(view.toolbar.name.subscribe.disabled).toBeUndefined();
    expect(view.readOnly).toBe('Read-only');
  });

  it('shows Events of only with a linked MongoDB connection, set to Off by default', () => {
    expect(shown(pageOf()).toolbar.eventsOf).toBeUndefined();
    const choices = shown(pageOf(), { linked: [{ id: local.id, name: 'Local' }] }).toolbar.eventsOf?.choices;
    expect(choices?.map((each) => [each.label, each.chosen])).toEqual([
      ['Off', true],
      ['Local', false],
    ]);
  });

  it('hides the inspector island with no row selected', () => {
    expect(shown(pageOf()).inspector).toBe(false);
  });
});

describe('pubsub.subscriptions', () => {
  it('lists orders then news:*, marked channel then pattern', () => {
    const view = subscriptions({ subscriptions: [orders, news] });
    expect(view.items.map((each) => [each.name, each.mark])).toEqual([
      ['orders', 'channel'],
      ['news:*', 'pattern'],
    ]);
    expect(view.unsubscribeAll?.args).toBe('all');
  });

  it('counts 3 for three messages of orders, and 0 again after pubsub.clear', () => {
    const after = subscriptionsAfter(
      [orders, news],
      [arrived('orders', 'a'), arrived('orders', 'b'), arrived('orders', 'c')],
    );
    expect(subscriptions({ subscriptions: after }).items.map((each) => each.received)).toEqual([3, 0]);
    const cleared = clearedPage(pageOf({ subscriptions: after }));
    expect(cleared.subscriptions.map((each) => each.received)).toEqual([0, 0]);
  });

  it('shows a subscription not answered yet as Subscribing…', () => {
    const view = subscriptions({ subscriptions: [{ ...orders, answered: false }] });
    expect(view.items[0]?.subscribing).toBe('Subscribing…');
  });

  it('has no Publish to this channel… in the menu of a pattern', () => {
    const view = subscriptions({ subscriptions: [orders, news] });
    expect(view.items[0]?.menu.map((each) => each.label)).toContain('Publish to this channel…');
    expect(view.items[1]?.menu.map((each) => each.label)).not.toContain('Publish to this channel…');
  });

  it('shows No subscriptions. with no subscription', () => {
    expect(subscriptions({ subscriptions: [] }).empty).toBe('No subscriptions.');
  });
});

describe('pubsub.messages', () => {
  it('adds a row at the top for PUBLISH orders hello, with the time, orders and hello', () => {
    const page = pageOf({ kept: keptWith([arrived('orders', 'first', now - 1000), arrived('orders', 'hello', now)]) });
    expect(messages({ page, now }).rows[0]?.cells).toEqual(['18:20:00.000', 'orders', 'hello']);
  });

  it('shows {"a":"b"} as it is and the 3 bytes 00 FF 41 in hexadecimal', () => {
    const page = pageOf({
      kept: keptWith([arrived('orders', '{"a":"b"}'), arrived('orders', Uint8Array.of(0, 255, 65))]),
    });
    expect(messages({ page, now }).rows.map((row) => row.cells[2])).toEqual(['00 ff 41', '{"a":"b"}']);
  });

  it('shows 200 of 5,000 characters and …, and the inspector the whole message', () => {
    const long = 'x'.repeat(5000);
    const page = pageOf({ kept: keptWith([arrived('orders', long)]), inspected: 1 });
    expect(messages({ page, now }).rows[0]?.cells[2]).toBe(`${'x'.repeat(200)}…`);
    const inspected = inspect({ page });
    expect(inspected?.kind === 'message' ? inspected.value.bytes.length : 0).toBe(5000);
  });

  it('lists two rows for one message through orders:1 and orders:*, one with the tooltip through the pattern orders:*', () => {
    const page = pageOf({ kept: keptWith([arrived('orders:1', 'x'), arrived('orders:1', 'x', now, 'orders:*')]) });
    expect(messages({ page, now }).rows.map((row) => row.tooltip)).toEqual(['through the pattern orders:*', undefined]);
  });

  it('shows the date for a message of another day', () => {
    const page = pageOf({ kept: keptWith([arrived('orders', 'x', now - 86_400_000)]) });
    expect(messages({ page, now }).rows[0]?.cells[0]).toBe('11-16 18:20:00.000');
  });

  it('draws only the rows of the range, and says 12 new and 12 new messages', () => {
    const page = pageOf({ kept: keptWith(Array.from({ length: 50 }, (_, index) => arrived('orders', String(index)))) });
    const view = messages({ page, now, range: { start: 10, count: 5 } });
    expect([view.rows.length, view.shown, view.rows[0]?.cells[2]]).toEqual([5, 50, '39']);
    expect([newRowsText(12), announceText(12), announceEveryMs]).toEqual(['12 new', '12 new messages', 5000]);
  });

  it('shows 37 rows with a filter that matches 37, so that Ctrl+A selects 37', () => {
    const all = Array.from({ length: 100 }, (_, index) => arrived('orders', index < 37 ? 'paid' : 'new'));
    const view = messages({ page: pageOf({ kept: keptWith(all), filter: { text: 'paid' } }), now });
    expect([view.shown, view.counts]).toEqual([37, '37 of 100 messages']);
  });

  it('shows the columns of events with Events of on, and puts back Time, Channel, Message with Off', () => {
    const event = '{"e":"u","d":{"_id":"abc"},"f":["qty"]}';
    const kept = messagesAfter(keptWithLink(keptWith([]), appLink), [arrived('app:orders', event)]);
    const view = messages({ page: pageOf({ kept }), now });
    expect(view.columns).toEqual(['Time', 'Operation', 'Collection', 'Document', 'Fields']);
    expect(view.rows[0]?.cells).toEqual(['18:20:00.000', 'update', 'orders', '"abc"', 'qty']);
    const off = messages({ page: pageOf({ kept: keptWithLink(kept, undefined) }), now });
    expect(off.columns).toEqual(['Time', 'Channel', 'Message']);
    expect(off.rows[0]?.cells.slice(1)).toEqual(['app:orders', event]);
  });

  it('offers Subscribe to this channel for a message that came through a pattern, and the selection bar', () => {
    const page = pageOf({ kept: keptWith([arrived('orders:1', 'x', now, 'orders:*')]), selected: [1] });
    const view = messages({ page, now });
    expect(view.rows[0]?.menu.map((each) => each.label)).toContain('Subscribe to this channel');
    expect(view.selection?.text).toBe('1 selected');
    expect(view.selection?.export.element).toBe('pubsub.export@selection-bar');
  });
});

describe('pubsub.inspect', () => {
  const event = '{"e":"u","d":{"_id":"abc"},"f":["qty"]}';

  it('shows the title app:orders, 39 bytes and the JSON for a click on an event message', () => {
    const page = pageOf({ kept: keptWith([arrived('app:orders', event)]), inspected: 1 });
    const view = inspect({ page });
    expect(view?.kind === 'message' ? [view.title, view.size.value] : []).toEqual(['app:orders', '39 bytes']);
    expect(view?.kind === 'message' ? view.value.choices.find((each) => each.chosen)?.format : undefined).toBe('json');
  });

  it('shows 00 FF 41 with Hexadecimal chosen, Text and JSON disabled, and 3 bytes', () => {
    const page = pageOf({ kept: keptWith([arrived('orders', Uint8Array.of(0, 255, 65))]), inspected: 1 });
    const view = inspect({ page });
    expect(
      view?.kind === 'message' ? view.value.choices.map((each) => [each.format, each.chosen, each.enabled]) : [],
    ).toEqual([
      ['text', false, false],
      ['json', false, false],
      ['hex', true, true],
    ]);
    expect(view?.kind === 'message' ? view.size.value : '').toBe('3 bytes');
  });

  it('shows the operation and the channels of an event row', () => {
    const kept = messagesAfter(keptWithLink(keptWith([]), appLink), [
      arrived('app:orders', event, now),
      arrived('app:orders::abc', event, now + 1),
    ]);
    const view = inspect({ page: pageOf({ kept, inspected: 1 }) });
    expect(view?.kind === 'message' ? view.channels?.items.map((each) => each.channel) : []).toEqual([
      'app:orders',
      'app:orders::abc',
    ]);
    expect(view?.kind === 'message' ? view.event?.[0]?.value : '').toBe('update');
  });

  it('empties the island when the message is dropped by the limit or by Clear', () => {
    const page = pageOf({ kept: keptWith([arrived('orders', 'a'), arrived('orders', 'b')], undefined), inspected: 1 });
    expect(inspect({ page: { ...page, kept: messagesAfter(page.kept, [arrived('orders', 'c')], 2) } })).toBeUndefined();
    expect(inspect({ page: clearedPage(page) })).toBeUndefined();
  });

  it('shows nothing with no row selected', () => {
    expect(inspect({ page: pageOf({ kept: keptWith([arrived('orders', 'a')]) }) })).toBeUndefined();
  });

  it('disables Publish again… on a read-only connection', () => {
    const page = pageOf({ kept: keptWith([arrived('orders', 'a')]), inspected: 1 });
    const view = inspect({ page, readOnly: 'The connection Cache production is read-only.' });
    expect(view?.kind === 'message' ? view.publishAgain.disabled : undefined).toBe(
      'The connection Cache production is read-only.',
    );
  });
});
