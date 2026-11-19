import { describe, expect, it } from 'vitest';
import { messagesAfter } from '../../../src/features/pubsub/keep';
import {
  pageWithAdded,
  pageWithAnswered,
  pageWithRefused,
  plan,
  subscribeError,
  typedNames,
} from '../../../src/features/pubsub/subscribe';
import { subscriptionsAfter } from '../../../src/features/pubsub/subscriptions';
import type { NameKind, PubSubPage, Subscription } from '../../../src/features/pubsub/types';
import type { EngineStep, Outcome } from '../../../src/shared/feature';
import { commandArguments } from '../../../src/features/console/parse-line';
import {
  arrived,
  bytes,
  cacheLocal,
  cacheProduction,
  pageOf,
  planOf,
  pubsubContext,
  pubsubState,
  recordedReply,
  stepTexts,
} from './context';
import type { ConnectionView } from '../../../src/shared/connection';

function subscribe(
  names: string,
  kind: NameKind = 'auto',
  page: PubSubPage = pageOf({ pageConnection: 'open' }),
  connection: ConnectionView = cacheLocal,
): Outcome {
  const state = pubsubState([page]);
  return plan(pubsubContext('pubsub.subscribe', state, connection), { args: { names, kind } });
}

function subscribed(...names: readonly string[]): readonly Subscription[] {
  return names.map((name) => ({
    kind: /[*?[]/u.test(name) ? ('pattern' as const) : ('channel' as const),
    name: bytes(name),
    answered: true,
    received: 0,
  }));
}

function engineCommands(outcome: Outcome): readonly string[] {
  return planOf(outcome)
    .steps.filter((step): step is EngineStep => step.kind === 'engine')
    .map((step) => step.text);
}

describe('pubsub.subscribe', () => {
  it('sends SUBSCRIBE orders for orders with Auto, and PSUBSCRIBE orders:* for orders:*', () => {
    expect(engineCommands(subscribe('orders'))).toEqual(['SUBSCRIBE orders']);
    expect(engineCommands(subscribe('orders:*'))).toEqual(['PSUBSCRIBE orders:*']);
  });

  it('sends SUBSCRIBE orders:* for orders:* with the kind Channel', () => {
    expect(engineCommands(subscribe('orders:*', 'channel'))).toEqual(['SUBSCRIBE orders:*']);
  });

  it('sends one SUBSCRIBE and one PSUBSCRIBE for orders invoices "my channel" news:*, and adds four subscriptions', () => {
    const outcome = subscribe('orders invoices "my channel" news:*');
    expect(engineCommands(outcome)).toEqual(['SUBSCRIBE orders invoices "my channel"', 'PSUBSCRIBE news:*']);
    const read = typedNames('orders invoices "my channel" news:*', 'auto');
    const added = pageWithAdded(pageOf(), read.kind === 'names' ? read.names : []);
    expect(added.subscriptions.map((each) => [each.kind, new TextDecoder().decode(each.name)])).toEqual([
      ['channel', 'orders'],
      ['channel', 'invoices'],
      ['channel', 'my channel'],
      ['pattern', 'news:*'],
    ]);
  });

  it('reads the bytes the steps send as console.parse-line reads the line typed', () => {
    const step = planOf(subscribe('"a\\xffb"')).steps.find((each) => each.kind === 'engine');
    const read = commandArguments('"a\\xffb"');
    expect(step?.kind === 'engine' && step.request.engine === 'redis' ? step.request.command[1] : undefined).toEqual(
      read.kind === 'arguments' ? read.arguments[0] : undefined,
    );
  });

  it('lists one message of orders after SUBSCRIBE orders, with the channel orders and the message hello', () => {
    const page = pageWithAnswered(pageWithAdded(pageOf(), subscribed('orders')), subscribed('orders'));
    const message = arrived('orders', 'hello');
    const kept = messagesAfter(page.kept, [message]);
    expect(kept.listed).toEqual([expect.objectContaining({ channel: bytes('orders'), message: bytes('hello') })]);
    expect(subscriptionsAfter(page.subscriptions, [message])[0]?.received).toBe(1);
  });

  it('opens the page’s connection, named datardo-pubsub, with the first subscription only', () => {
    expect(stepTexts(subscribe('orders', 'auto', pageOf()))).toEqual([
      'open a connection to cache:6379 for Pub/Sub',
      'HELLO 3 SETNAME datardo-pubsub',
      'add orders to the subscriptions of the Pub/Sub page of Cache local',
      'SUBSCRIBE orders',
    ]);
    const second = pageOf({ pageConnection: 'open', subscriptions: subscribed('orders') });
    expect(stepTexts(subscribe('invoices', 'auto', second))).toEqual([
      'add invoices to the subscriptions of the Pub/Sub page of Cache local',
      'SUBSCRIBE invoices',
    ]);
  });

  it('says HELLO with the user and *** for the password, and falls back to AUTH and CLIENT SETNAME', () => {
    const secured = { ...cacheLocal, address: 'redis://app@cache', secrets: { ...cacheLocal.secrets, password: true } };
    const steps = planOf(
      plan(pubsubContext('pubsub.subscribe', pubsubState([pageOf()], [secured]), secured), {
        args: { names: 'orders' },
      }),
    ).steps;
    expect(steps[1]?.text).toBe('HELLO 3 AUTH app *** SETNAME datardo-pubsub');
    const fallback = steps[1]?.onFailure;
    expect(fallback?.kind === 'instead' ? fallback.steps.map((each) => each.text) : []).toEqual([
      'AUTH app ***',
      'CLIENT SETNAME datardo-pubsub',
    ]);
  });

  it('refuses orders a second time with pubsub.subscribe/already-subscribed', () => {
    const page = pageOf({ pageConnection: 'open', subscriptions: subscribed('orders') });
    expect(subscribe('orders', 'auto', page)).toEqual(
      expect.objectContaining({ kind: 'refuse', code: 'pubsub.subscribe/already-subscribed' }),
    );
    expect(engineCommands(subscribe('orders invoices', 'auto', page))).toEqual(['SUBSCRIBE invoices']);
  });

  it('makes orders as a channel and orders as a pattern two subscriptions', () => {
    const page = pageOf({ pageConnection: 'open', subscriptions: subscribed('orders') });
    expect(engineCommands(subscribe('orders', 'pattern', page))).toEqual(['PSUBSCRIBE orders']);
  });

  it('refuses one more than 100 subscriptions with pubsub.subscribe/too-many and sends nothing', () => {
    const page = pageOf({
      pageConnection: 'open',
      subscriptions: subscribed(...Array.from({ length: 100 }, (_, index) => `c${String(index)}`)),
    });
    expect(subscribe('orders', 'auto', page)).toEqual(
      expect.objectContaining({ kind: 'refuse', code: 'pubsub.subscribe/too-many' }),
    );
  });

  it('sends SUBSCRIBE orders on Cache production, a read-only connection', () => {
    const page = pageOf({ pageConnection: 'open' }, cacheProduction);
    expect(engineCommands(subscribe('orders', 'auto', page, cacheProduction))).toEqual(['SUBSCRIBE orders']);
    expect(
      planOf(subscribe('orders', 'auto', page, cacheProduction)).steps.some(
        (step) => step.kind === 'engine' && step.writes,
      ),
    ).toBe(false);
  });

  it('shows The user of this connection may not subscribe to orders: … and leaves orders out of Subscriptions', () => {
    const message = new TextDecoder().decode(
      recordedReply('redis-7.4-pubsub-replies', 'datardo-record-no-channel') as Uint8Array,
    );
    const names = subscribed('orders');
    expect(subscribeError(names, message)).toBe(`The user of this connection may not subscribe to orders: ${message}`);
    expect(pageWithRefused(pageWithAdded(pageOf(), names), names).subscriptions).toEqual([]);
    const step = planOf(subscribe('orders')).steps.find((each) => each.kind === 'engine');
    expect(step?.onFailure).toEqual({ kind: 'go-on' });
  });

  it('shows a subscription dimmed until the server answers its command', () => {
    const added = pageWithAdded(pageOf(), subscribed('orders'));
    expect(added.subscriptions[0]?.answered).toBe(false);
    expect(pageWithAnswered(added, subscribed('orders')).subscriptions[0]?.answered).toBe(true);
  });

  it('writes PSUBSCRIBE orders:* as the Log has it, [pubsub.subscribe] coming from the runner', () => {
    expect(stepTexts(subscribe('orders:*'))).toContain('PSUBSCRIBE orders:*');
  });

  it('refuses a text that cannot be read with pubsub.subscribe/invalid-name', () => {
    expect(subscribe('"orders')).toEqual(
      expect.objectContaining({ kind: 'refuse', code: 'pubsub.subscribe/invalid-name' }),
    );
  });

  it('refuses on a connection that is not connected with pubsub.subscribe/not-connected', () => {
    const state = pubsubState([pageOf()], [cacheLocal], [cacheLocal.id]);
    expect(plan(pubsubContext('pubsub.subscribe', state), { args: { names: 'orders' } })).toEqual(
      expect.objectContaining({ kind: 'refuse', code: 'pubsub.subscribe/not-connected' }),
    );
  });

  it('asks for the channel or pattern and its kind from Go to, Auto by default', () => {
    const outcome = plan(pubsubContext('pubsub.subscribe', pubsubState([pageOf()])), {});
    expect(outcome.kind === 'ask' ? outcome.question.fields.map((field) => [field.key, field.default]) : []).toEqual([
      ['names', undefined],
      ['kind', 'auto'],
    ]);
    expect(
      engineCommands(plan(pubsubContext('pubsub.subscribe', pubsubState([pageOf()])), { names: 'x', kind: 'pattern' })),
    ).toEqual(['PSUBSCRIBE x']);
  });

  it('only adds the names while the page is disconnected: pubsub.reconnect subscribes to them with the others', () => {
    expect(stepTexts(subscribe('orders', 'auto', pageOf({ pageConnection: 'disconnected' })))).toEqual([
      'add orders to the subscriptions of the Pub/Sub page of Cache local',
    ]);
  });
});
