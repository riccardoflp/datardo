/**
 * Feature: tree.redis-databases
 *
 * Reads how many databases a Redis server has (`CONFIG GET databases`) and how many keys each holds (`INFO
 * keyspace`): the counts the server keeps, with no key scanned. When `CONFIG` is refused, the number of databases is
 * the highest of `INFO keyspace` plus one, and at least 16; no error is shown.
 */
import type { Json, RedisRequest } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { failureOf, isObject, textArg, type RedisDatabase, type RedisDatabases } from './types';

/** How many databases a Redis server has unless it says otherwise. */
export const defaultDatabaseCount = 16;

/** How long the server may take for each request, in ms (R9.2; Datardo's choice). */
export const redisTimeLimitMs = 5000;

/** `INFO keyspace`, then `CONFIG GET databases`. */
export function redisDatabasesRequests(): readonly RedisRequest[] {
  return [
    { ...redisCommand(0, 'INFO', 'keyspace'), timeLimitMs: redisTimeLimitMs },
    { ...redisCommand(0, 'CONFIG', 'GET', 'databases'), timeLimitMs: redisTimeLimitMs },
  ];
}

/** Feature: tree.redis-databases — the requests for `args.connection`. */
export function request(_context: Context, args: Json): ReadRequest {
  const connection = connectionId(textArg(args, 'connection'));
  return { kind: 'engine', requests: redisDatabasesRequests().map((each) => ({ connection, request: each })) };
}

const decoder = new TextDecoder();

function textOf(reply: unknown): string {
  return reply instanceof Uint8Array ? decoder.decode(reply) : typeof reply === 'string' ? reply : '';
}

function wholeNumber(value: string | undefined): number {
  const number = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(number) ? number : 0;
}

/** The databases `INFO keyspace` names: `db0:keys=1204,expires=310,avg_ttl=86400000` and parts it does not know. */
export function keyspaceOf(info: string): readonly RedisDatabase[] {
  return info.split(/\r?\n/u).flatMap((line): RedisDatabase[] => {
    const match = /^db(\d+):(.*)$/u.exec(line.trim());
    if (match === null) {
      return [];
    }
    const fields = new Map(
      (match[2] ?? '').split(',').map((part) => {
        const equals = part.indexOf('=');
        return [part.slice(0, equals).trim(), part.slice(equals + 1).trim()] as const;
      }),
    );
    return [
      {
        number: Number(match[1]),
        keys: wholeNumber(fields.get('keys')),
        expires: wholeNumber(fields.get('expires')),
        averageTtlMs: wholeNumber(fields.get('avg_ttl')),
      },
    ];
  });
}

/** The value of `CONFIG GET databases`, as an array (RESP2) or a map (RESP3); `undefined` when refused. */
export function configuredCount(reply: unknown): number | undefined {
  if (failureOf(reply) !== undefined) {
    return undefined;
  }
  const pairs: readonly (readonly [unknown, unknown])[] = Array.isArray(reply)
    ? reply.flatMap((each: unknown, index: number) => (index % 2 === 0 ? [[each, reply[index + 1]] as const] : []))
    : isObject(reply) && reply['kind'] === 'map' && Array.isArray(reply['entries'])
      ? (reply['entries'] as readonly (readonly [unknown, unknown])[])
      : [];
  const value = pairs.find(([name]) => textOf(name) === 'databases')?.[1];
  const count = Number(textOf(value) || Number.NaN);
  return Number.isInteger(count) && count > 0 ? count : undefined;
}

/**
 * Feature: tree.redis-databases — every database from 0 to the number the server has, with its keys, its keys with an
 * expiry and their average time to live; a database `INFO keyspace` does not name has 0 keys.
 */
export function parse(replies: readonly unknown[]): RedisDatabases {
  const [info, config] = replies;
  const failure = failureOf(info);
  if (failure !== undefined) {
    throw new Error(failure);
  }
  const named = keyspaceOf(textOf(info));
  const highest = Math.max(-1, ...named.map((each) => each.number));
  const count = configuredCount(config) ?? Math.max(defaultDatabaseCount, highest + 1);
  const byNumber = new Map(named.map((each) => [each.number, each]));
  const databases = Array.from(
    { length: Math.max(count, highest + 1) },
    (_, number): RedisDatabase => byNumber.get(number) ?? { number, keys: 0, expires: 0, averageTtlMs: 0 },
  );
  return { count: databases.length, databases };
}
