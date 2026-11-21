/**
 * What the unit tests of the Pub/Sub area build their inputs from: the Redis connections Cache local (allows writes)
 * and Cache production (read-only), the MongoDB connection Local linked to Cache local with the channel prefix `app:`
 * and the namespace `tenant1`, Pub/Sub pages, messages, and the replies and messages recorded from Redis 7.4.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyKept, messagesAfter } from '../../../src/features/pubsub/keep';
import type { Arrived, Kept, Message, OplogLink, PubSubPage } from '../../../src/features/pubsub/types';
import { openedPage } from '../../../src/features/pubsub/types';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Context, Outcome, Plan } from '../../../src/shared/feature';
import { connectionId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import { contextOf, mongoConnection, redisConnection, stateWith } from '../connection/context';

export { recordedReply } from '../console/context';

/** Cache local, which allows writes. */
export const cacheLocal: ConnectionView = redisConnection();

/** Cache production, which is read-only. */
export const cacheProduction: ConnectionView = redisConnection({
  id: connectionId('c-production'),
  name: 'Cache production',
  readOnly: true,
});

/** Local, a MongoDB connection linked to Cache local with the channel prefix `app:` and the namespace `tenant1`. */
export const local: ConnectionView = mongoConnection({
  publishesTo: cacheLocal.id,
  oplog: { prefix: 'app:', namespaces: ['tenant1'] },
});

/** The link of Local. */
export const appLink: OplogLink = { prefix: 'app:', namespaces: ['tenant1'] };

/** The test's time: 2025-11-17 17:20:00 UTC. */
export const now = 1_763_400_000_000;

/** The time zone of the tests: one hour east of UTC, so that `now` is 18:20:00 on the computer's clock. */
export const offset = 60;

/** Text as bytes. */
export function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** A page of Cache local just opened, changed by `overrides`. */
export function pageOf(overrides: Partial<PubSubPage> = {}, connection: ConnectionView = cacheLocal): PubSubPage {
  return { ...openedPage(connection.id, offset), ...overrides };
}

/** The app's state with the connections connected, these pages, and what Datardo remembers. */
export function pubsubState(
  pages: readonly PubSubPage[] = [],
  saved: readonly ConnectionView[] = [cacheLocal, cacheProduction, local],
  notConnected: readonly string[] = [],
): AppState {
  const base = stateWith(saved);
  const server = { engine: 'redis', product: 'Redis', version: '7.4.1', redisVersion: '7.4.1' } as const;
  const live = Object.fromEntries(
    saved
      .filter((each) => !notConnected.includes(each.id))
      .map((each) => [each.id, { state: 'connected' as const, ...(each.engine === 'redis' ? { server } : {}) }]),
  );
  return {
    ...base,
    connections: { ...base.connections, live },
    pubsubPages: Object.fromEntries(pages.map((each) => [each.connection, each])),
  };
}

/** A context of a feature of the area started on a connection. */
export function pubsubContext(feature: string, state: AppState, connection: ConnectionView = cacheLocal): Context {
  return { ...contextOf(feature, state, { kind: 'connection', connection: connection.id }), now };
}

/** The plan of an outcome, or the test fails. */
export function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

/** The texts of the steps of an outcome's plan, as the Log writes them. */
export function stepTexts(outcome: Outcome): readonly string[] {
  return planOf(outcome).steps.map((step) => step.text);
}

/** A message that arrived on `channel`, at `receivedAt`, maybe through a pattern. */
export function arrived(
  channel: string,
  message: string | Uint8Array,
  receivedAt = now,
  pattern?: string,
): Extract<Arrived, { kind: 'message' }> {
  return {
    kind: 'message',
    receivedAt,
    channel: bytes(channel),
    message: typeof message === 'string' ? bytes(message) : message,
    ...(pattern === undefined ? {} : { pattern: bytes(pattern) }),
  };
}

/** A numbered message. */
export function messageOf(number: number, channel: string, message: string | Uint8Array, receivedAt = now): Message {
  return { ...arrived(channel, message, receivedAt), number };
}

/** The list after these messages arrived, from an empty one. */
export function keptWith(messages: readonly Arrived[], kept: Kept = emptyKept): Kept {
  return messagesAfter(kept, messages);
}

/** The messages a subscriber of `datardo-record:*` received from Redis 7.4 (`test/integration/pubsub`). */
export function recordedMessages(receivedAt = now): readonly Extract<Arrived, { kind: 'message' }>[] {
  const file = join(import.meta.dirname, '..', '..', 'fixtures', 'replies', 'redis-7.4-pubsub-messages.json');
  const records = JSON.parse(readFileSync(file, 'utf8')) as readonly {
    readonly channel: string;
    readonly pattern: string;
    readonly message: string | { readonly $hex: string };
  }[];
  return records.map((each, index) =>
    arrived(
      each.channel,
      typeof each.message === 'string' ? each.message : Uint8Array.from(Buffer.from(each.message.$hex, 'hex')),
      receivedAt + index,
      each.pattern,
    ),
  );
}
