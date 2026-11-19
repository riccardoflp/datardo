/**
 * The sharded cluster as `monitor.read-sharding` reads it through a mongos: the balancer, the migrations of the last
 * 24 hours, the routers, the shards, the sharded collections with their chunks, data and zones, and the parts that
 * could not be read (its rules 1 to 8). Ported from Mongoster's `src/sharding.ts › shardingStatus`, `parseShardHost`.
 */
import type { Json } from '../../../shared/engine-request';
import { indexKeyOf, indexKeyText } from '../types';
import { shellText } from '../oplog-summary';
import { dateOf, listOf, numberOf, recordOf, sameJson, textOf, type JsonRecord } from './ejson';
import { failureOf, shortMessage } from './failure';

/** The balancer of the cluster (glossary, "balancer"). */
export interface BalancerState {
  /** `full`, `off`, or the server's own word; absent when neither the status nor the settings say it. */
  readonly mode?: string;
  readonly inRound?: boolean;
  readonly rounds?: number;
  readonly window?: { readonly start: string; readonly stop: string };
  readonly chunkSizeMb?: number;
  /** Whether the balancer waits for secondaries, when the settings say it. */
  readonly secondaryThrottle?: boolean;
  readonly settings?: Json;
}

/** The data of a collection on one shard. */
export interface ShardData {
  readonly shard: string;
  readonly size: number;
  readonly count: number;
}

/** A zone range of a sharded collection, its bounds in mongosh syntax. */
export interface ZoneRange {
  readonly zone: string;
  readonly min: string;
  readonly max: string;
}

/** The balancer's verdict on a collection, from `balancerCollectionStatus`. */
export interface BalancerVerdict {
  readonly compliant: boolean;
  readonly violation?: string;
}

/** A sharded collection. */
export interface ShardedCollection {
  readonly namespace: string;
  /** The shard key in mongosh syntax: `{ customerId: 1, _id: "hashed" }`. */
  readonly key: string;
  readonly unique: boolean;
  /** Whether the balancer may move its chunks: on unless `noBalance` is true. */
  readonly balancing: boolean;
  /** The chunks per shard, in the order the shards appear. */
  readonly chunks: readonly (readonly [string, number])[];
  readonly totalChunks: number;
  readonly jumbo: number;
  readonly data?: readonly ShardData[];
  readonly zones: readonly ZoneRange[];
  readonly verdict?: BalancerVerdict;
  /** Its document of `config.collections`. */
  readonly record: Json;
}

/** A shard of the cluster (glossary, "shard"). */
export interface Shard {
  readonly name: string;
  readonly host: string;
  readonly replicaSet?: string;
  readonly members: readonly string[];
  readonly state?: number;
  readonly draining: boolean;
  readonly zones: readonly string[];
  readonly chunks?: number;
  /** The sums of the sharded collections' data on it; absent when no collection's data was read. */
  readonly dataSize?: number;
  readonly documents?: number;
  readonly primaryOf: readonly string[];
  readonly record: Json;
}

/** The sharded cluster behind a mongos. */
export interface ShardedCluster {
  readonly version?: string;
  readonly configServer?: string;
  readonly balancer?: BalancerState;
  readonly migrations?: { readonly done: number; readonly failed: number; readonly failedRounds: number };
  readonly routers?: { readonly active: number; readonly total: number };
  readonly shards?: readonly Shard[];
  readonly collections?: readonly ShardedCollection[];
  readonly zones: readonly string[];
  /** The parts that could not be read, as `<part> (<what>): <the server's message>`. */
  readonly errors: readonly string[];
  /** Set when the data per shard is of the first 100 collections only. */
  readonly dataLimitedTo?: number;
}

/** A router is active when its ping is less than this old, in milliseconds. */
export const routerPingMs = 60_000;

/** The replica set and the members of a shard's host: `rs0/a:27018,b:27018`, or `a:27018` alone. */
export function shardHost(host: string): { readonly replicaSet?: string; readonly members: readonly string[] } {
  const slash = host.indexOf('/');
  const list = slash >= 0 ? host.slice(slash + 1) : host;
  const members = list.split(',').filter((member) => member !== '');
  return slash >= 0 ? { replicaSet: host.slice(0, slash), members } : { members };
}

/** The line of a part whose read failed: `chunks (config.chunks): not authorized on config`. */
export function partError(part: string, reply: unknown): readonly string[] {
  const failure = failureOf(reply);
  return failure === undefined ? [] : [`${part}: ${shortMessage(failure.message)}`];
}

function documents(reply: unknown): readonly JsonRecord[] {
  return failureOf(reply) === undefined ? listOf(reply).map(recordOf) : [];
}

/** The balancer, from `balancerStatus`, the documents of `config.settings` and `serverStatus` (rule 1). */
export function balancerOf(status: unknown, settings: unknown, server: unknown): BalancerState | undefined {
  const read = failureOf(status) === undefined ? recordOf(status) : undefined;
  const documentsOf = documents(settings);
  const balancer = documentsOf.find((each) => each['_id'] === 'balancer');
  const chunkSize = documentsOf.find((each) => each['_id'] === 'chunksize');
  if (read === undefined && balancer === undefined) {
    return undefined;
  }
  const window = recordOf(balancer?.['activeWindow']);
  const start = textOf(window['start']);
  const stop = textOf(window['stop']);
  const mode =
    textOf(read?.['mode']) ??
    (balancer === undefined ? undefined : balancer['stopped'] === true || balancer['mode'] === 'off' ? 'off' : 'full');
  const maxBytes = numberOf(recordOf(recordOf(server)['sharding'])['maxChunkSizeInBytes']);
  const chunkSizeMb = numberOf(chunkSize?.['value']) ?? (maxBytes === undefined ? undefined : maxBytes / 1024 / 1024);
  const throttle = balancer?.['_secondaryThrottle'];
  const parts: Record<string, unknown> = {
    mode,
    inRound: typeof read?.['inBalancerRound'] === 'boolean' ? read['inBalancerRound'] : undefined,
    rounds: numberOf(read?.['numBalancerRounds']),
    window: start !== undefined && stop !== undefined ? { start, stop } : undefined,
    chunkSizeMb,
    secondaryThrottle: throttle === undefined ? undefined : throttle !== false,
    settings: balancer,
  };
  return Object.fromEntries(Object.entries(parts).filter(([, value]) => value !== undefined));
}

/** Done and failed migrations, from the groups of `config.changelog`, and the rounds with errors (rule 2). */
export function migrationsOf(groups: unknown, rounds: unknown): ShardedCluster['migrations'] {
  if (failureOf(groups) !== undefined) {
    return undefined;
  }
  const list = documents(groups);
  const count = (what: string, ok?: boolean): number =>
    list
      .filter((group) => {
        const id = recordOf(group['_id']);
        return id['what'] === what && (ok === undefined || id['ok'] === ok);
      })
      .reduce((sum, group) => sum + (numberOf(group['n']) ?? 0), 0);
  return {
    done: count('moveChunk.commit'),
    failed: Math.max(count('moveChunk.error'), count('moveChunk.from', false)),
    failedRounds: failureOf(rounds) === undefined ? (numberOf(rounds) ?? 0) : 0,
  };
}

/** The routers and how many pinged less than 60 seconds before `at` (rule 3). */
export function routersOf(reply: unknown, at: number): ShardedCluster['routers'] {
  if (failureOf(reply) !== undefined) {
    return undefined;
  }
  const pings = documents(reply).map((router) => dateOf(router['ping']) ?? 0);
  return { active: pings.filter((ping) => at - ping < routerPingMs).length, total: pings.length };
}

/** The data per shard of each namespace, from `$shardedDataDistribution`. */
export function distributionOf(reply: unknown): ReadonlyMap<string, readonly ShardData[]> {
  return new Map(
    documents(reply).map((each) => [
      textOf(each['ns']) ?? '',
      listOf(each['shards']).map((shard) => {
        const fields = recordOf(shard);
        return {
          shard: textOf(fields['shardName']) ?? '',
          size: numberOf(fields['ownedSizeBytes']) ?? 0,
          count: numberOf(fields['numOwnedDocuments']) ?? 0,
        };
      }),
    ]),
  );
}

function chunksOf(
  record: JsonRecord,
  groups: readonly JsonRecord[],
): Pick<ShardedCollection, 'chunks' | 'totalChunks' | 'jumbo'> {
  const namespace = textOf(record['_id']) ?? '';
  const chunks = new Map<string, number>();
  let jumbo = 0;
  for (const group of groups) {
    const id = recordOf(group['_id']);
    const uuid = id['uuid'];
    const mine = uuid !== undefined && uuid !== null ? sameJson(uuid, record['uuid']) : id['ns'] === namespace;
    if (mine) {
      const shard = textOf(id['shard']) ?? '';
      chunks.set(shard, (chunks.get(shard) ?? 0) + (numberOf(group['n']) ?? 0));
      jumbo += numberOf(group['jumbo']) ?? 0;
    }
  }
  const list = [...chunks];
  return { chunks: list, totalChunks: list.reduce((sum, [, count]) => sum + count, 0), jumbo };
}

/**
 * The sharded collections, from `config.collections`, the groups of chunks, the zone ranges and the data per shard
 * (rule 4); without the data (its read failed), no collection has any.
 */
export function collectionsOf(
  reply: unknown,
  chunkGroups: unknown,
  tags: unknown,
  data: ReadonlyMap<string, readonly ShardData[]> | undefined,
): readonly ShardedCollection[] | undefined {
  if (failureOf(reply) !== undefined) {
    return undefined;
  }
  const groups = documents(chunkGroups);
  const ranges = documents(tags);
  return documents(reply).map((record): ShardedCollection => {
    const namespace = textOf(record['_id']) ?? '';
    const shardData = data === undefined ? undefined : (data.get(namespace) ?? []);
    return {
      namespace,
      key: indexKeyText(indexKeyOf(record['key'])),
      unique: record['unique'] === true,
      balancing: record['noBalance'] !== true,
      ...chunksOf(record, groups),
      ...(shardData === undefined ? {} : { data: shardData }),
      zones: ranges
        .filter((range) => range['ns'] === namespace)
        .map((range) => ({
          zone: textOf(range['tag']) ?? '',
          min: shellText(range['min'] ?? null),
          max: shellText(range['max'] ?? null),
        })),
      record,
    };
  });
}

/** The shards, with their chunks, the sums of the collections' data on them and the databases they are primary of. */
export function shardsOf(
  reply: unknown,
  context: {
    readonly chunkGroups: unknown;
    readonly databases: unknown;
    readonly collections?: readonly ShardedCollection[];
  },
): readonly Shard[] | undefined {
  if (failureOf(reply) !== undefined) {
    return undefined;
  }
  const chunksRead = failureOf(context.chunkGroups) === undefined;
  const chunks = new Map<string, number>();
  for (const group of documents(context.chunkGroups)) {
    const shard = textOf(recordOf(group['_id'])['shard']) ?? '';
    chunks.set(shard, (chunks.get(shard) ?? 0) + (numberOf(group['n']) ?? 0));
  }
  const primaries = new Map<string, string[]>();
  for (const database of documents(context.databases)) {
    const primary = textOf(database['primary']) ?? '';
    primaries.set(primary, [...(primaries.get(primary) ?? []), textOf(database['_id']) ?? '']);
  }
  return listOf(recordOf(reply)['shards']).map((each): Shard => {
    const record = recordOf(each);
    const name = textOf(record['_id']) ?? '';
    const host = textOf(record['host']) ?? '';
    const state = numberOf(record['state']);
    return {
      name,
      host,
      ...shardHost(host),
      ...(state === undefined ? {} : { state }),
      draining: record['draining'] === true,
      zones: listOf(record['tags']).flatMap((tag) => (typeof tag === 'string' ? [tag] : [])),
      ...(chunksRead ? { chunks: chunks.get(name) ?? 0 } : {}),
      primaryOf: [...(primaries.get(name) ?? [])].sort(),
      record,
    };
  });
}

/** The shards with the sums of the data of the sharded collections on each; unknown when no data was read. */
export function withShardData(
  shards: readonly Shard[] | undefined,
  collections: readonly ShardedCollection[] | undefined,
): readonly Shard[] | undefined {
  const known = (collections ?? []).some((collection) => collection.data !== undefined);
  return shards?.map((shard) => {
    const { dataSize: _size, documents: _documents, ...rest } = shard;
    if (!known) {
      return rest;
    }
    const on = (collections ?? [])
      .flatMap((collection) => collection.data ?? [])
      .filter((data) => data.shard === shard.name);
    return {
      ...rest,
      dataSize: on.reduce((sum, data) => sum + data.size, 0),
      documents: on.reduce((sum, data) => sum + data.count, 0),
    };
  });
}

/** The distinct zones of the shards and of the ranges, sorted (rule 6). */
export function zonesOf(shards: readonly Shard[] | undefined, tags: unknown): readonly string[] {
  const zones = [
    ...(shards ?? []).flatMap((shard) => shard.zones),
    ...documents(tags).flatMap((range) => {
      const zone = textOf(range['tag']);
      return zone === undefined ? [] : [zone];
    }),
  ];
  return [...new Set(zones)].sort();
}

/** The balancer's verdict on a collection, from the reply of `balancerCollectionStatus`. */
export function verdictOf(reply: unknown): BalancerVerdict {
  const fields = recordOf(reply);
  const violation = textOf(fields['firstComplianceViolation']);
  return { compliant: fields['balancerCompliant'] === true, ...(violation === undefined ? {} : { violation }) };
}

/** The data per shard of a collection, from its `$collStats`: one document per shard. */
export function collStatsDataOf(reply: unknown): readonly ShardData[] {
  return documents(reply).map((each) => {
    const storage = recordOf(each['storageStats']);
    return {
      shard: textOf(each['shard']) ?? '',
      size: numberOf(storage['size']) ?? 0,
      count: numberOf(storage['count']) ?? 0,
    };
  });
}

/** The config servers: `configsvrConnectionString` of `serverStatus`, else the `config` entry of `getShardMap` (rule 7). */
export function configServerOf(server: unknown, shardMap?: unknown): string | undefined {
  const fromStatus = textOf(recordOf(recordOf(server)['sharding'])['configsvrConnectionString']);
  return fromStatus ?? textOf(recordOf(recordOf(shardMap)['map'])['config']);
}
