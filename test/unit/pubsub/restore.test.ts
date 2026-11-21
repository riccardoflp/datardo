/**
 * What the Pub/Sub tab keeps and restores (`pubsub.show`, `tab.restore`), the step that keeps the kind of the field and
 * the filter with the tab, and the events the main process sends the window as messages arrive (`pubsub.keep`): only
 * the rows added, replaced and dropped cross the bridge, and the window's list ends equal to the main process's.
 */
import { describe, expect, it } from 'vitest';
import { messagesAfter, pausedKept, resumedKept } from '../../../src/features/pubsub/keep';
import { choicesAsked, pageChoices, plan, restoredPage } from '../../../src/features/pubsub/show';
import { subscriptionArgs, type PubSubPage } from '../../../src/features/pubsub/types';
import { reduce } from '../../../src/shared/state';
import { keptAfter, keptChange, rowsChange } from '../../../src/shared/state/pubsub';
import {
  appLink,
  arrived,
  bytes,
  cacheLocal,
  keptWith,
  local,
  offset,
  pageOf,
  planOf,
  pubsubContext,
  pubsubState,
  stepTexts,
} from './context';

const subscribed: PubSubPage = pageOf({
  subscriptions: [
    { kind: 'channel', name: bytes('orders'), answered: true, received: 3 },
    { kind: 'pattern', name: bytes('news:*'), answered: true, received: 0 },
  ],
  nameKind: 'pattern',
  filter: { text: 'paid', subscription: { kind: 'channel', name: bytes('orders') } },
  eventsOf: local.id,
  lastChannel: 'orders',
  kept: keptWith([arrived('orders', 'a'), arrived('orders', 'b')]),
});

describe('pubsub.show', () => {
  it('keeps the subscriptions, the kind, the filter, Events of and the last channel with the tab, not the messages', () => {
    const kept = pageChoices(subscribed);
    expect(JSON.parse(kept['subscriptions'] ?? '')).toEqual([
      subscriptionArgs({ kind: 'channel', name: bytes('orders') }),
      subscriptionArgs({ kind: 'pattern', name: bytes('news:*') }),
    ]);
    expect(kept).toMatchObject({ nameKind: 'pattern', filter: 'paid', eventsOf: local.id, lastChannel: 'orders' });
    expect(JSON.stringify(kept)).not.toContain('"a"');
  });

  it('restores the same subscriptions, not answered yet, with no message and not paused', () => {
    const restored = restoredPage(cacheLocal.id, pageChoices(subscribed), offset, appLink);
    expect(restored.subscriptions.map((each) => [each.kind, new TextDecoder().decode(each.name)])).toEqual([
      ['channel', 'orders'],
      ['pattern', 'news:*'],
    ]);
    expect(restored.subscriptions.every((each) => !each.answered && each.received === 0)).toBe(true);
    expect(restored.kept.listed).toEqual([]);
    expect(restored.kept.paused).toBe(false);
    expect(restored.kept.link).toEqual(appLink);
    expect(restored.filter.text).toBe('paid');
    expect(restored.filter.subscription?.kind).toBe('channel');
    expect(restored).toMatchObject({ nameKind: 'pattern', eventsOf: local.id, lastChannel: 'orders' });
  });

  it('restores no Events of when the MongoDB connection is no longer linked, and nothing from a broken memory', () => {
    expect(restoredPage(cacheLocal.id, pageChoices(subscribed), offset, undefined).eventsOf).toBeUndefined();
    const broken = restoredPage(cacheLocal.id, { subscriptions: '[not json' }, offset, undefined);
    expect(broken.subscriptions).toEqual([]);
  });

  it('keeps the kind and the filter the page asks to keep with one app step, and reads them back', () => {
    const state = pubsubState([subscribed]);
    const choices = { nameKind: 'channel', filter: 'refund', filterSubscription: { kind: 'pattern', hex: '6e2a' } };
    const outcome = plan(pubsubContext('pubsub.show', state), { args: { choices } });
    expect(stepTexts(outcome)).toEqual([
      'keep the kind and the filter of the Pub/Sub page of Cache local with its tab',
    ]);
    expect(planOf(outcome).steps[0]).toMatchObject({ kind: 'app', action: 'pubsub.choices' });
    expect(choicesAsked(choices)).toEqual({
      nameKind: 'channel',
      filter: { text: 'refund', subscription: { kind: 'pattern', name: bytes('n*') } },
    });
    expect(choicesAsked({})).toBeUndefined();
  });
});

describe('pubsub.keep', () => {
  function sent(before: PubSubPage['kept'], after: PubSubPage['kept']): PubSubPage['kept'] {
    const page = { ...subscribed, kept: before };
    const state = reduce(pubsubState([page]), {
      slice: 'pubsub',
      type: 'kept',
      connection: page.connection,
      change: keptChange(before, after),
    });
    return state.pubsubPages[page.connection]?.kept ?? before;
  }

  it('sends only the rows added, and the window’s list ends equal to the main process’s', () => {
    const before = keptWith([arrived('orders', '1'), arrived('orders', '2')]);
    const after = messagesAfter(before, [arrived('orders', '3')]);
    const change = rowsChange(before.listed, after.listed);
    expect(change.drop).toBe(0);
    expect(change.added.map((row) => row.number)).toEqual([3]);
    expect(sent(before, after)).toEqual(after);
  });

  it('sends the rows dropped by the limit as a count, and a pause and a resume as they are', () => {
    const before = keptWith([arrived('orders', '1'), arrived('orders', '2'), arrived('orders', '3')]);
    const after = messagesAfter(before, [arrived('orders', '4')], 3);
    expect(rowsChange(before.listed, after.listed)).toMatchObject({ drop: 1, replaced: [] });
    expect(sent(before, after)).toEqual(after);
    const held = messagesAfter(pausedKept(after), [arrived('orders', '5')]);
    expect(sent(after, held)).toEqual(held);
    expect(sent(held, resumedKept(held))).toEqual(resumedKept(held));
    expect(keptAfter(held, keptChange(held, resumedKept(held)))).toEqual(resumedKept(held));
  });
});
