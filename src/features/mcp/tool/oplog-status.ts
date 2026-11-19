/**
 * `redis_oplog_status` (`mcp.data-model-tools`): whether a MongoDB connection publishes Datardo's writes to its linked
 * Redis connection for redis-oplog, what is published and on which channels, with the rules of `oplog.scope` and
 * `oplog.publish`. Those cards (M27) are not built yet: the options are read from the connection's `oplog` as
 * `{ enabled, prefix, namespaces, patterns, lastError }`, and the tool says nothing it cannot read there. The linked
 * connection is named, never its connection string: any `redis://` or `rediss://` text becomes a placeholder.
 */
import type { ConnectionView } from '../../../shared/connection';
import { savedConnection } from '../../../shared/state/connections';
import { withoutSecrets } from '../../runner/error';
import { boolArg, stringArg, toolConnection } from '../arguments';
import { isFailed } from '../types';
import { listOf, recordOf, textIn } from './mongo';
import type { ToolSession } from './program';
import { redisCall, replyText } from './redis';

/** The redis-oplog options of a connection, as far as they can be read. */
export interface OplogOptions {
  readonly enabled: boolean;
  readonly prefix: string;
  readonly namespaces: readonly string[];
  readonly patterns: readonly string[];
  readonly lastError?: string;
}

/** The options of a connection's `oplog`. */
export function oplogOptions(connection: ConnectionView): OplogOptions {
  const oplog = recordOf(connection.oplog);
  const lastError = textIn(oplog['lastError']);
  return {
    enabled: oplog['enabled'] === true,
    prefix: textIn(oplog['prefix']) ?? '',
    namespaces: listOf(oplog['namespaces']).filter((each): each is string => typeof each === 'string'),
    patterns: listOf(oplog['patterns']).filter((each): each is string => typeof each === 'string'),
    ...(lastError === undefined ? {} : { lastError }),
  };
}

/** A text with any Redis connection string written `<Redis connection string>`, and other passwords masked. */
export function withoutRedisString(text: string): string {
  return withoutSecrets(text).replace(/rediss?:\/\/\S+/giu, '<Redis connection string>');
}

function matches(pattern: string, name: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*');
  return new RegExp(`^${escaped}$`, 'u').test(name);
}

/** Whether a write on `database.collection` is published (`oplog.scope`): no pattern publishes everything. */
export function inScope(patterns: readonly string[], database: string, collection: string): boolean {
  if (patterns.length === 0) {
    return true;
  }
  return patterns.some((pattern) => {
    const dot = pattern.indexOf('.');
    return dot < 0
      ? matches(pattern, database)
      : matches(pattern.slice(0, dot), database) && matches(pattern.slice(dot + 1), collection);
  });
}

/** The channels of a write on a collection, with `<_id>` in place of the document's id. */
export function channelsOf(options: OplogOptions, collection: string): readonly string[] {
  return [
    `${options.prefix}${collection}`,
    ...options.namespaces.map((namespace) => `${options.prefix}${namespace}::${collection}`),
    `${options.prefix}${collection}::<_id>`,
  ];
}

function scopeLines(session: ToolSession, options: OplogOptions): readonly string[] {
  const database = stringArg(session.args, 'database');
  const collection = stringArg(session.args, 'collection');
  if (database === undefined || collection === undefined) {
    return [];
  }
  return inScope(options.patterns, database, collection)
    ? [`The writes on ${database}.${collection} go to the channels ${channelsOf(options, collection).join(', ')}.`]
    : [`The writes on ${database}.${collection} are not published (no pattern matches).`];
}

function checkLine(session: ToolSession, linked: ConnectionView): string {
  const [reply] = session.send([redisCall(linked.id, 0, ['PING'])]);
  if (isFailed(reply)) {
    return `Redis does not answer: ${withoutRedisString(reply.message)}`;
  }
  return replyText(reply) === 'PONG' ? 'Redis answers (PING).' : 'Redis gave an unexpected answer to PING.';
}

/** `redis_oplog_status`. */
export function redisOplogStatus(session: ToolSession): string {
  const connection = toolConnection(session, 'mongodb');
  const options = oplogOptions(connection);
  const readOnly = connection.readOnly
    ? [`${connection.name} is read-only: Datardo makes no writes through it, so nothing is published.`]
    : [];
  if (!options.enabled) {
    return [
      `${connection.name} doesn't publish Datardo's writes to Redis for redis-oplog (it can be turned on in the connection form).`,
      ...readOnly,
    ].join('\n');
  }
  const linked =
    connection.publishesTo === undefined
      ? undefined
      : savedConnection(session.context.state.connections, connection.publishesTo);
  const lines = [
    `${connection.name} publishes Datardo's writes to Redis for redis-oplog.`,
    ...readOnly,
    linked === undefined
      ? 'Linked connection: missing: nothing can be published until a Redis connection is linked again in the connection form.'
      : `Linked connection: ${linked.name}.`,
    `Channel prefix: ${options.prefix === '' ? 'none' : options.prefix}.`,
    `Namespaces: ${options.namespaces.length === 0 ? 'none' : options.namespaces.join(', ')}.`,
    `Published: ${options.patterns.length === 0 ? 'every database and collection' : options.patterns.join(', ')}.`,
    ...scopeLines(session, options),
    ...(options.lastError === undefined ? [] : [`Last publishing error: ${withoutRedisString(options.lastError)}`]),
  ];
  if (boolArg(session.args, 'check', false) && linked !== undefined) {
    lines.push(checkLine(session, linked));
  }
  return lines.join('\n');
}
