/**
 * Feature: connection.server-info — reads the version of the server and what kind of deployment it is, for the
 * connection island, the test of the form, the Overview page and every feature that must know what the server can do.
 */
import type {
  MongoHost,
  MongoServerInfo,
  MongoTopology,
  RedisRole,
  RedisServerInfo,
  ServerInfo,
} from '../../shared/connection';
import type { EngineName, EngineRequest, Json } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import type { Outcome } from '../../shared/feature';
import { connectionById, jsonFields } from './types';

/** How long the server has to answer each request (Datardo's choice: the ping's 5 seconds). */
export const serverInfoTimeLimitMs = 5000;

/** What is read: what connecting and testing need, or also what the Overview page shows. */
export type ServerInfoDepth = 'connect' | 'overview';

function adminCommand(command: string): EngineRequest {
  return {
    engine: 'mongodb',
    database: 'admin',
    method: 'runCommand',
    arguments: [{ [command]: { $numberInt: '1' } }],
    timeLimitMs: serverInfoTimeLimitMs,
  };
}

function info(section: string): EngineRequest {
  return { ...redisCommand(0, 'INFO', section), timeLimitMs: serverInfoTimeLimitMs };
}

/** The requests that tell what a server is, in the order {@link parse} reads their replies. */
export function serverInfoRequests(engine: EngineName, depth: ServerInfoDepth): readonly EngineRequest[] {
  if (engine === 'mongodb') {
    return [adminCommand('hello'), adminCommand('buildInfo')];
  }
  return depth === 'connect'
    ? [info('server')]
    : [info('server'), info('replication'), info('memory'), info('clients')];
}

/** Feature: connection.server-info — the requests for a saved connection: `{ connection, depth }`. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const fields = jsonFields(args);
  const id = connectionId(typeof fields['connection'] === 'string' ? fields['connection'] : '');
  const connection = connectionById(context, id);
  if (connection === undefined) {
    throw new Error(`No connection is saved with the id ${id}.`);
  }
  const depth: ServerInfoDepth = fields['depth'] === 'overview' ? 'overview' : 'connect';
  return {
    kind: 'engine',
    requests: serverInfoRequests(connection.engine, depth).map((each) => ({ connection: id, request: each })),
  };
}

/** The lines of `INFO` as `name:value`; lines that start with `#` and empty lines are skipped. */
export function infoFields(text: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (line.startsWith('#') || line.trim() === '' || colon < 0) {
      continue;
    }
    fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  return fields;
}

/** The numbers of a version, compared number by number: `6.2.0` is at least `[6, 2]`, `6.0.20` is not. */
export function isVersionAtLeast(version: string, least: readonly number[]): boolean {
  const numbers = version.split('.').map((part) => Number.parseInt(part, 10));
  for (const [index, wanted] of least.entries()) {
    const number = numbers[index] ?? 0;
    if (Number.isNaN(number) || number !== wanted) {
      return !Number.isNaN(number) && number > wanted;
    }
  }
  return true;
}

function number(value: string | undefined): number | undefined {
  if (value === undefined || !/^-?\d+(\.\d+)?$/.test(value)) {
    return undefined;
  }
  return Number(value);
}

/** The fields of an object that have a value: `{ a: 1, b: undefined }` gives `{ a: 1 }`. */
function definedOnly<T extends Record<string, unknown>>(value: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, each]) => each !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

function redisRole(fields: ReadonlyMap<string, string>): RedisRole | undefined {
  const role = fields.get('role');
  if (role === 'master') {
    return { kind: 'master' };
  }
  return role === 'slave'
    ? { kind: 'replica', masterHost: fields.get('master_host') ?? '', masterPort: fields.get('master_port') ?? '' }
    : undefined;
}

/** What a Redis server is, from the text of its `INFO` sections. */
export function redisServerInfo(texts: readonly string[]): RedisServerInfo {
  const fields = new Map(texts.flatMap((text) => [...infoFields(text)]));
  const redisVersion = fields.get('redis_version') ?? '';
  const valkey = fields.get('valkey_version');
  const mode = fields.get('redis_mode');
  const role = redisRole(fields);
  const uptimeSeconds = number(fields.get('uptime_in_seconds'));
  const memory = definedOnly({
    used: number(fields.get('used_memory')),
    peak: number(fields.get('used_memory_peak')),
    limit: number(fields.get('maxmemory')),
    policy: fields.get('maxmemory_policy'),
  });
  const clients = definedOnly({
    connected: number(fields.get('connected_clients')),
    blocked: number(fields.get('blocked_clients')),
    limit: number(fields.get('maxclients')),
  });
  return {
    engine: 'redis',
    product: valkey === undefined ? 'Redis' : 'Valkey',
    version: valkey ?? redisVersion,
    redisVersion,
    ...(mode === undefined ? {} : { mode }),
    ...(role === undefined ? {} : { role }),
    ...(uptimeSeconds === undefined ? {} : { uptimeSeconds }),
    ...(Object.keys(memory).length === 0 ? {} : { memory }),
    ...(Object.keys(clients).length === 0 ? {} : { clients }),
  };
}

type Document = Readonly<Record<string, Json>>;

function strings(value: Json | undefined): readonly string[] {
  return Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : [];
}

function mongoTopology(hello: Document): MongoTopology {
  if (hello['msg'] === 'isdbgrid') {
    return { kind: 'sharded' };
  }
  const setName = hello['setName'];
  return typeof setName === 'string' ? { kind: 'replica-set', name: setName } : { kind: 'standalone' };
}

function mongoHosts(hello: Document, topology: MongoTopology, written: readonly string[]): readonly MongoHost[] {
  switch (topology.kind) {
    case 'replica-set': {
      const arbiters = strings(hello['arbiters']);
      const members = [...strings(hello['hosts']), ...strings(hello['passives']), ...arbiters];
      return members.map((host) => ({
        host,
        role: host === hello['primary'] ? 'primary' : arbiters.includes(host) ? 'arbiter' : 'secondary',
      }));
    }
    case 'sharded':
      return written.map((host) => ({ host, role: 'mongos' }));
    case 'standalone':
      return written.slice(0, 1).map((host) => ({ host, role: 'standalone' }));
  }
}

/** What a MongoDB server is, from its `hello` and its `buildInfo` (canonical Extended JSON); `written` are the hosts of the connection string. */
export function mongoServerInfo(
  hello: Document,
  buildInfo: Document,
  written: readonly string[] = [],
): MongoServerInfo {
  const version = buildInfo['version'];
  const topology = mongoTopology(hello);
  return {
    engine: 'mongodb',
    version: typeof version === 'string' ? version : '',
    topology,
    hosts: mongoHosts(hello, topology, written),
  };
}

function isDocument(value: unknown): value is Document {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array);
}

/**
 * Feature: connection.server-info — what the server is, from the replies to {@link serverInfoRequests}: MongoDB's
 * `hello` and `buildInfo`, or the text of Redis's `INFO` sections. `args.hosts` are the hosts of the connection
 * string, for a standalone and a sharded cluster.
 */
export function parse(replies: readonly unknown[], args: Json = null): ServerInfo {
  const [first, second] = replies;
  if (isDocument(first) && isDocument(second)) {
    const hosts = isDocument(args) && typeof args['hosts'] === 'string' ? args['hosts'].split(',') : [];
    return mongoServerInfo(
      first,
      second,
      hosts.filter((host) => host !== ''),
    );
  }
  const decoder = new TextDecoder();
  return redisServerInfo(
    replies.map((reply) =>
      reply instanceof Uint8Array ? decoder.decode(reply) : typeof reply === 'string' ? reply : '',
    ),
  );
}

function topologyText(info: MongoServerInfo): string {
  switch (info.topology.kind) {
    case 'replica-set':
      return info.topology.name;
    case 'sharded':
      return 'sharded cluster';
    case 'standalone':
      return 'standalone';
  }
}

/** The version with its first two numbers: `8.0`, `7.4`. */
export function shortVersion(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}

/** What the connection island shows: **MongoDB 8.0 · rs0**, **Redis 7.4 · replica**. */
export function serverText(info: ServerInfo): string {
  if (info.engine === 'mongodb') {
    return `MongoDB ${shortVersion(info.version)} · ${topologyText(info)}`;
  }
  return `${info.product} ${shortVersion(info.version)} · ${info.role?.kind === 'replica' ? 'replica' : 'standalone'}`;
}
