/**
 * Feature: pubsub.follow-oplog
 *
 * Opens the Pub/Sub page of the Redis connection a MongoDB connection is linked to, subscribed to the channels of its
 * redis-oplog events (the channel prefix followed by `*`), and shows each event with its operation, its collection and
 * its document: the writes made in Datardo and those of the Meteor apps, as they reach Redis. Allowed on read-only
 * connections: nothing is written. Started on the Redis page with `'off'`, it turns **Events of** off and keeps the
 * subscription and the messages.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { After, Answers, AppStep, Context, Outcome, Step } from '../../shared/feature';
import { noDanger, refuse, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { connectionState, savedConnection } from '../../shared/state/connections';
import { isSubscribed, newSubscriptionSteps } from './subscribe';
import { text } from './text';
import type { OplogLink, PubSubPage } from './types';
import { bytesOf, openedPage, pageConnectionOf, pubsubPageOf, startArgs } from './types';

/** The pattern of the events of a channel prefix: the prefix with `\` before each `*`, `?`, `[` and `\`, then `*`. */
export function eventsPattern(prefix: string): string {
  return `${prefix.replace(/[*?[\\]/gu, (character) => `\\${character}`)}*`;
}

function textField(value: Json | undefined, name: string): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as { readonly [key: string]: Json })[name]
    : undefined;
}

/**
 * The link a MongoDB connection publishes with (`connection.link-redis`): its channel prefix and its namespaces, from
 * the redis-oplog options saved with it (`prefix`, `namespaces`, as Mongoster keeps them); undefined with no linked
 * connection.
 */
export function oplogLinkOf(connection: ConnectionView): OplogLink | undefined {
  if (connection.engine !== 'mongodb' || connection.publishesTo === undefined) {
    return undefined;
  }
  const prefix = textField(connection.oplog, 'prefix');
  const namespaces = textField(connection.oplog, 'namespaces');
  return {
    prefix: typeof prefix === 'string' ? prefix : '',
    namespaces: Array.isArray(namespaces) ? namespaces.filter((each) => typeof each === 'string') : [],
  };
}

function appStep(stepText: string, action: string, args: Json): AppStep {
  return { kind: 'app', text: stepText, action, args };
}

/** **Events of › Off**: every message its own row again, on the Pub/Sub page of the Redis connection. */
function offPlan(context: Context): Outcome {
  const id = pageConnectionOf(context);
  const redis = id === undefined ? undefined : savedConnection(context.state.connections, id);
  return run({
    title: text.follow.offTitle,
    steps:
      redis === undefined
        ? []
        : [appStep(text.follow.offStep(redis.name), 'pubsub.events-of', { connection: redis.id, eventsOf: null })],
    danger: noDanger,
    undo: { cannot: text.follow.cannotUndo },
    publishes: false,
    after: [],
  });
}

/** Connects the linked connection, then follows again; a second failure is refused (`/not-connected`). */
function connectFirst(mongo: ConnectionView, redis: ConnectionView): Outcome {
  const after: After[] = [
    { kind: 'start', feature: featureId('connection.connect'), target: { kind: 'connection', connection: redis.id } },
    {
      kind: 'start',
      feature: featureId('pubsub.follow-oplog'),
      target: { kind: 'connection', connection: mongo.id },
      args: { connecting: 'tried' },
    },
  ];
  return run({
    title: text.follow.title(mongo.name),
    steps: [],
    danger: noDanger,
    undo: { cannot: text.follow.cannotUndo },
    publishes: false,
    after,
  });
}

function followSteps(mongo: ConnectionView, redis: ConnectionView, page: PubSubPage, link: OplogLink): readonly Step[] {
  const pattern = { kind: 'pattern' as const, name: bytesOf(eventsPattern(link.prefix)) };
  return [
    appStep(text.follow.openPage(redis.name), 'pubsub.open-page', { connection: redis.id }),
    appStep(text.follow.showEvents(mongo.name), 'pubsub.events-of', { connection: redis.id, eventsOf: mongo.id }),
    ...(isSubscribed(page, pattern) ? [] : newSubscriptionSteps(redis, page, [pattern])),
  ];
}

/** Feature: pubsub.follow-oplog — started on the MongoDB connection: the page opened, its events shown, `PSUBSCRIBE`. */
export function plan(context: Context, answers: Answers): Outcome {
  if (answers['args'] === 'off') {
    return offPlan(context);
  }
  const id = pageConnectionOf(context);
  const mongo = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const link = mongo === undefined ? undefined : oplogLinkOf(mongo);
  const redis =
    mongo?.publishesTo === undefined ? undefined : savedConnection(context.state.connections, mongo.publishesTo);
  if (mongo === undefined || link === undefined || redis === undefined) {
    return refuse('pubsub.follow-oplog/no-link', text.follow.noLink(mongo?.name ?? ''));
  }
  if (connectionState(context.state.connections, redis.id) !== 'connected') {
    return startArgs(answers)['connecting'] === 'tried'
      ? refuse('pubsub.follow-oplog/not-connected', text.follow.notConnected(redis.name))
      : connectFirst(mongo, redis);
  }
  const page = pubsubPageOf(context.state, redis.id) ?? openedPage(redis.id, 0);
  return run({
    title: text.follow.title(mongo.name),
    steps: followSteps(mongo, redis, page, link),
    danger: noDanger,
    undo: { cannot: text.follow.cannotUndo },
    publishes: false,
    after: [],
  });
}

/** The sentence over the list when the prefix is empty: the pattern `*` receives every message of the connection. */
export function noPrefixNotice(mongo: ConnectionView, redis: ConnectionView): string | undefined {
  return oplogLinkOf(mongo)?.prefix === '' ? text.show.noPrefix(mongo.name, redis.name) : undefined;
}
