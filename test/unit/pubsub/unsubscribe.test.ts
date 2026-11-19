import { describe, expect, it } from 'vitest';
import { messagesAfter } from '../../../src/features/pubsub/keep';
import { plan as reconnect } from '../../../src/features/pubsub/reconnect';
import { pageWithout, plan } from '../../../src/features/pubsub/unsubscribe';
import type { PubSubPage, Subscription } from '../../../src/features/pubsub/types';
import { hexOf } from '../../../src/features/pubsub/types';
import type { Answers } from '../../../src/shared/feature';
import { arrived, bytes, keptWith, pageOf, pubsubContext, pubsubState, stepTexts } from './context';

function subscribed(kind: Subscription['kind'], name: string): Subscription {
  return { kind, name: bytes(name), answered: true, received: 0 };
}

const orders = subscribed('channel', 'orders');
const ordersPattern = subscribed('pattern', 'orders:*');

function unsubscribe(page: PubSubPage, answers: Answers): readonly string[] {
  return stepTexts(plan(pubsubContext('pubsub.unsubscribe', pubsubState([page])), answers));
}

function remove(subscription: Subscription): Answers {
  return { args: { kind: subscription.kind, hex: hexOf(subscription.name) } };
}

describe('pubsub.unsubscribe', () => {
  it('sends UNSUBSCRIBE orders for ✕ on the channel orders, and keeps the messages of orders already listed', () => {
    const page = pageOf({
      pageConnection: 'open',
      subscriptions: [orders, ordersPattern],
      kept: keptWith([arrived('orders', 'hello')]),
    });
    expect(unsubscribe(page, remove(orders))).toEqual([
      'remove orders from the subscriptions of the Pub/Sub page of Cache local',
      'UNSUBSCRIBE orders',
    ]);
    const after = pageWithout(page, [orders]);
    expect(after.subscriptions).toEqual([ordersPattern]);
    expect(after.kept.listed).toHaveLength(1);
  });

  it('sends PUNSUBSCRIBE orders:* for ✕ on the pattern orders:*', () => {
    const page = pageOf({ pageConnection: 'open', subscriptions: [orders, ordersPattern] });
    expect(unsubscribe(page, remove(ordersPattern))).toContain('PUNSUBSCRIBE orders:*');
  });

  it('sends UNSUBSCRIBE a b and PUNSUBSCRIBE c:* for Unsubscribe from all, then closes the page’s connection', () => {
    const page = pageOf({
      pageConnection: 'open',
      subscriptions: [subscribed('channel', 'a'), subscribed('channel', 'b'), subscribed('pattern', 'c:*')],
    });
    expect(unsubscribe(page, { args: 'all' })).toEqual([
      'remove a, b and c:* from the subscriptions of the Pub/Sub page of Cache local',
      'UNSUBSCRIBE a b',
      'PUNSUBSCRIBE c:*',
      'close the Pub/Sub connection to Cache local',
    ]);
  });

  it('removes a subscription while disconnected and sends nothing; it is not subscribed again when the connection comes back', () => {
    const page = pageOf({ pageConnection: 'disconnected', subscriptions: [orders, ordersPattern] });
    expect(unsubscribe(page, remove(orders))).toEqual([
      'remove orders from the subscriptions of the Pub/Sub page of Cache local',
    ]);
    const after = pageWithout(page, [orders]);
    const steps = stepTexts(reconnect(pubsubContext('pubsub.reconnect', pubsubState([after])), {}));
    expect(steps).toContain('PSUBSCRIBE orders:*');
    expect(steps.some((each) => each.startsWith('SUBSCRIBE'))).toBe(false);
  });

  it('keeps the messages held for a subscription removed while paused', () => {
    const paused = pageOf({ pageConnection: 'open', subscriptions: [orders], kept: { ...keptWith([]), paused: true } });
    const held = { ...paused, kept: messagesAfter(paused.kept, [arrived('orders', 'held')]) };
    expect(pageWithout(held, [orders]).kept.held).toHaveLength(1);
  });

  it('plans nothing when the page has no such subscription', () => {
    expect(unsubscribe(pageOf({ pageConnection: 'open' }), remove(orders))).toEqual([]);
  });
});
