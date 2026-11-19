import { describe, expect, it } from 'vitest';
import { eventsPattern, noPrefixNotice, oplogLinkOf, plan } from '../../../src/features/pubsub/follow-oplog';
import { keptWithLink, messagesAfter } from '../../../src/features/pubsub/keep';
import { view as messages } from '../../../src/features/pubsub/messages';
import type { PubSubPage } from '../../../src/features/pubsub/types';
import type { ConnectionView } from '../../../src/shared/connection';
import { connectionId } from '../../../src/shared/ids';
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
  stepTexts,
} from './context';
import type { Outcome } from '../../../src/shared/feature';

function follow(
  mongo: ConnectionView = local,
  pages: readonly PubSubPage[] = [],
  saved: readonly ConnectionView[] = [cacheLocal, cacheProduction, mongo],
  args?: string,
): Outcome {
  const state = pubsubState(pages, saved);
  return plan(pubsubContext('pubsub.follow-oplog', state, mongo), args === undefined ? {} : { args });
}

describe('pubsub.follow-oplog', () => {
  it('opens the Pub/Sub tab of Cache local, sends PSUBSCRIBE app:*, and sets Events of to Local', () => {
    expect(stepTexts(follow())).toEqual([
      'open the Pub/Sub page of Cache local',
      'show the events of Local',
      'open a connection to cache:6379 for Pub/Sub',
      'HELLO 3 SETNAME datardo-pubsub',
      'add app:* to the subscriptions of the Pub/Sub page of Cache local',
      'PSUBSCRIBE app:*',
    ]);
    const steps = planOf(follow()).steps;
    expect(steps[1]).toEqual(
      expect.objectContaining({ action: 'pubsub.events-of', args: { connection: cacheLocal.id, eventsOf: local.id } }),
    );
  });

  it('adds one row update, orders, "abc", qty for an edit of qty of "abc" of shop.orders', () => {
    const update = '{"e":"u","d":{"_id":"abc"},"f":["qty"]}';
    const kept = messagesAfter(keptWithLink(keptWith([]), appLink), [
      arrived('app:orders', update, now),
      arrived('app:orders::abc', update, now + 1),
    ]);
    const rows = messages({ page: pageOf({ kept }), now }).rows;
    expect(rows.map((row) => row.cells.slice(1))).toEqual([['update', 'orders', '"abc"', 'qty']]);
  });

  it('adds a row insert, its collection and its _id for an insert made by a Meteor app', () => {
    const insert = '{"e":"i","d":{"_id":"Xq7Lm","name":"Ada"}}';
    const kept = messagesAfter(keptWithLink(keptWith([]), appLink), [arrived('app:users', insert)]);
    expect(messages({ page: pageOf({ kept }), now }).rows[0]?.cells.slice(1, 4)).toEqual([
      'insert',
      'users',
      '"Xq7Lm"',
    ]);
  });

  it('sends PSUBSCRIBE app:* once when following twice', () => {
    const page = pageOf({
      pageConnection: 'open',
      subscriptions: [{ kind: 'pattern', name: bytes('app:*'), answered: true, received: 0 }],
    });
    expect(stepTexts(follow(local, [page]))).toEqual([
      'open the Pub/Sub page of Cache local',
      'show the events of Local',
    ]);
  });

  it('escapes the prefix shop*1: as PSUBSCRIBE shop\\*1:*, which shopX1:orders does not match', () => {
    expect(eventsPattern('shop*1:')).toBe('shop\\*1:*');
    expect(eventsPattern('a?[b\\')).toBe('a\\?\\[b\\\\*');
    const shop = { ...local, oplog: { prefix: 'shop*1:', namespaces: [] } };
    expect(stepTexts(follow(shop))).toContain('PSUBSCRIBE "shop\\\\*1:*"');
  });

  it('sends PSUBSCRIBE * with an empty prefix, and the page shows the sentence about the prefix', () => {
    const bare = { ...local, oplog: { prefix: '', namespaces: [] } };
    expect(stepTexts(follow(bare))).toContain('PSUBSCRIBE *');
    expect(noPrefixNotice(bare, cacheLocal)).toBe(
      'Local has no channel prefix: the pattern * receives every message of Cache local, not only the events of redis-oplog.',
    );
    expect(noPrefixNotice(local, cacheLocal)).toBeUndefined();
  });

  it('refuses with pubsub.follow-oplog/no-link on a MongoDB connection with no linked connection', () => {
    const { publishesTo: _none, ...rest } = local;
    const unlinked: ConnectionView = { ...rest, id: connectionId('c-alone'), name: 'Alone' };
    expect(oplogLinkOf(unlinked)).toBeUndefined();
    expect(follow(unlinked)).toEqual(expect.objectContaining({ kind: 'refuse', code: 'pubsub.follow-oplog/no-link' }));
  });

  it('turns Events of off with Off, keeping the subscription and the messages', () => {
    const outcome = plan(pubsubContext('pubsub.follow-oplog', pubsubState([pageOf()])), { args: 'off' });
    expect(planOf(outcome).steps).toEqual([
      {
        kind: 'app',
        text: 'show every message as its own row on the Pub/Sub page of Cache local',
        action: 'pubsub.events-of',
        args: { connection: cacheLocal.id, eventsOf: null },
      },
    ]);
  });

  it('opens the page and lists the events with both connections read-only', () => {
    const readOnlyLocal = { ...local, readOnly: true, publishesTo: cacheProduction.id };
    const planned = planOf(follow(readOnlyLocal));
    expect(planned.steps.some((step) => step.kind === 'engine' && step.writes)).toBe(false);
    expect(stepTexts(follow(readOnlyLocal))).toContain('PSUBSCRIBE app:*');
  });

  it('connects Cache local first, then refuses with pubsub.follow-oplog/not-connected when it still is not', () => {
    const state = pubsubState([], [cacheLocal, local], [cacheLocal.id]);
    const first = planOf(plan(pubsubContext('pubsub.follow-oplog', state, local), {}));
    expect(first.after.map((after) => after.kind === 'start' && after.feature)).toEqual([
      'connection.connect',
      'pubsub.follow-oplog',
    ]);
    expect(plan(pubsubContext('pubsub.follow-oplog', state, local), { args: { connecting: 'tried' } })).toEqual(
      expect.objectContaining({ kind: 'refuse', code: 'pubsub.follow-oplog/not-connected' }),
    );
  });
});
