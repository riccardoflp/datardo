/**
 * Feature: pubsub.subscriptions
 *
 * The list **Subscriptions** at the left of the Pub/Sub page: the channels and the patterns the page is subscribed to,
 * in the order they were made, each with a mark for its kind, the number of messages received through it since it was
 * made, and `✕`. A subscription whose command the server has not answered yet is dimmed, *Subscribing…*
 */
import type { Json } from '../../shared/engine-request';
import { text } from './text';
import type { Message, Subscription } from './types';
import { isThrough, nameText, subscriptionArgs } from './types';

/** An entry of a context menu, with the feature it starts, or the text it copies. */
export interface MenuEntry {
  readonly label: string;
  readonly feature?: string;
  readonly element?: string;
  readonly args?: Json;
  /** The text **Copy name** puts in the clipboard. */
  readonly copies?: string;
  /** Why it is disabled, as its tooltip. */
  readonly disabled?: string;
}

/** One item of the list. */
export interface SubscriptionItem {
  readonly kind: Subscription['kind'];
  /** **channel** or **pattern**, also said by its tooltip. */
  readonly mark: string;
  readonly name: string;
  readonly received: number;
  /** *Subscribing…*, while the server has not answered. */
  readonly subscribing?: string;
  readonly remove: MenuEntry;
  readonly menu: readonly MenuEntry[];
}

/** What the list shows. */
export interface SubscriptionsView {
  readonly header: string;
  readonly count: number;
  readonly unsubscribeAll?: MenuEntry;
  readonly items: readonly SubscriptionItem[];
  readonly empty?: string;
}

/** What the list is drawn from. */
export interface SubscriptionsInput {
  readonly subscriptions: readonly Subscription[];
  /** The tooltip of **Publish to this channel…** on a read-only connection. */
  readonly readOnly?: string;
}

function menuOf(subscription: Subscription, readOnly: string | undefined): readonly MenuEntry[] {
  const args = subscriptionArgs(subscription);
  const name = nameText(subscription.name);
  const publish: MenuEntry = {
    label: text.subscriptions.publishTo,
    feature: 'pubsub.publish',
    element: 'pubsub.publish@item-menu',
    args: { channel: name },
    ...(readOnly === undefined ? {} : { disabled: readOnly }),
  };
  return [
    { label: text.subscriptions.showOnly, feature: 'pubsub.filter', args: { subscription: args } },
    ...(subscription.kind === 'channel' ? [publish] : []),
    { label: text.subscriptions.copyName, copies: name },
    {
      label: text.subscriptions.unsubscribe,
      feature: 'pubsub.unsubscribe',
      element: 'pubsub.unsubscribe@item-menu',
      args,
    },
  ];
}

function itemOf(subscription: Subscription, readOnly: string | undefined): SubscriptionItem {
  return {
    kind: subscription.kind,
    mark: text.subscriptions.kinds[subscription.kind],
    name: nameText(subscription.name),
    received: subscription.received,
    ...(subscription.answered ? {} : { subscribing: text.subscriptions.subscribing }),
    remove: {
      label: text.subscriptions.unsubscribe,
      feature: 'pubsub.unsubscribe',
      element: 'pubsub.unsubscribe@list',
      args: subscriptionArgs(subscription),
    },
    menu: menuOf(subscription, readOnly),
  };
}

/** Feature: pubsub.subscriptions — what the list **Subscriptions** shows. */
export function view(input: SubscriptionsInput): SubscriptionsView {
  const count = input.subscriptions.length;
  return {
    header: text.subscriptions.header,
    count,
    ...(count >= 2
      ? {
          unsubscribeAll: {
            label: text.subscriptions.unsubscribeAll,
            feature: 'pubsub.unsubscribe',
            element: 'pubsub.unsubscribe@list',
            args: 'all',
          },
        }
      : {}),
    items: input.subscriptions.map((each) => itemOf(each, input.readOnly)),
    ...(count === 0 ? { empty: text.subscriptions.none } : {}),
  };
}

/** The subscriptions once messages arrived: each counts those that came through it. */
export function subscriptionsAfter(
  subscriptions: readonly Subscription[],
  arrived: readonly Pick<Message, 'channel' | 'pattern'>[],
): readonly Subscription[] {
  return subscriptions.map((each) => {
    const more = arrived.filter((message) => isThrough(message, each)).length;
    return more === 0 ? each : { ...each, received: each.received + more };
  });
}
