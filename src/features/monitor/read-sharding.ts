/**
 * Feature: monitor.read-sharding
 *
 * The kind of server and, through a mongos, its shards, sharded collections, chunks, zones, balancer and the
 * migrations of the last 24 hours. Started with `{ connection, step }`:
 *
 * - `hello` sends `db.adminCommand({ hello: 1 })`: a mongos, a config server, a standalone server, or a replica set
 *   member, which the step `sharding-state` (with `me`) tells apart from a member of a shard;
 * - `cluster` sends the 13 requests of the card, each allowed to fail alone; the 24 hours and the routers' pings are
 *   counted from `at` (milliseconds since 1970), else from the time the request is made, else, in `parse`, from the
 *   `localTime` of `serverStatus`;
 * - `collections`, on a full read only, sends `balancerCollectionStatus` for the namespaces of `verdicts` and the
 *   `$collStats` of the namespaces of `collStats`, as {@link collectionSteps} cuts them, 8 at a time;
 * - `shard-map` sends `getShardMap`, when `serverStatus` did not name the config servers.
 *
 * {@link completeCluster} puts the steps together and {@link mergeSharding} keeps, on a read that is not full, what
 * the last full read found (rule 9). Ported from Mongoster's `src/sharding.ts › shardingStatus`, `formatShardKey`,
 * `parseShardHost`.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import { date, dateOf, int, listOf, recordOf, textOf } from './parts/ejson';
import { failureOf, shortMessage, type Failure, type PartRead } from './parts/failure';
import { adminCommand, clusterTimeLimitMs, collectionCall, engineRead, splitNamespace } from './parts/requests';
import {
  balancerOf,
  collectionsOf,
  collStatsDataOf,
  configServerOf,
  distributionOf,
  migrationsOf,
  partError,
  routersOf,
  shardsOf,
  verdictOf,
  withShardData,
  zonesOf,
  type BalancerVerdict,
  type ShardData,
  type ShardedCluster,
  type ShardedCollection,
} from './parts/sharding-records';
import { text } from './text';
import { numberArg, readConnection, textArg } from './types';

/** How many collections a full read asks the balancer's verdict (and, before 6.0.3, the `$collStats`) of. */
export const collectionsAtMost = 100;

/** How many of those requests are in flight at once. */
export const collectionsAtOnce = 8;

/** A day, in milliseconds: the migrations counted are those of the last 24 hours. */
const dayMs = 24 * 60 * 60 * 1000;

/** What the server is, as `hello` and `shardingState` say. */
export type ShardingServer =
  | { readonly kind: 'mongos' }
  | { readonly kind: 'config-server'; readonly me?: string }
  | { readonly kind: 'shard-member'; readonly me?: string; readonly shard: string; readonly configServer?: string }
  | { readonly kind: 'replica-set'; readonly me?: string }
  | { readonly kind: 'standalone'; readonly me?: string };

/** What the step `collections` gives for one namespace. */
export interface CollectionRead {
  readonly namespace: string;
  readonly verdict?: PartRead<BalancerVerdict>;
  readonly data?: PartRead<readonly ShardData[]>;
}

/** What a step gives. A `replica-set` of the step `hello` is then asked `shardingState`. */
export type ShardingRead =
  | { readonly step: 'hello'; readonly server: PartRead<ShardingServer> }
  | { readonly step: 'sharding-state'; readonly server: ShardingServer }
  | { readonly step: 'cluster'; readonly cluster: ShardedCluster; readonly dataFailure?: Failure }
  | { readonly step: 'collections'; readonly collections: readonly CollectionRead[] }
  | { readonly step: 'shard-map'; readonly configServer?: string };

const parts = text.sharding.parts;

function configCall(collection: string, method: string, args: readonly Json[], timeLimitMs?: number): MongoRequest {
  return collectionCall({
    database: 'config',
    collection,
    method,
    arguments: args,
    ...(timeLimitMs === undefined ? {} : { timeLimitMs }),
  });
}

const chunkGroups: Json = [
  {
    $group: {
      _id: { uuid: '$uuid', ns: '$ns', shard: '$shard' },
      n: { $sum: int(1) },
      jumbo: { $sum: { $cond: [{ $eq: ['$jumbo', true] }, int(1), int(0)] } },
    },
  },
];

function migrationGroups(since: Json): Json {
  return [
    { $match: { time: { $gte: since }, what: { $in: ['moveChunk.commit', 'moveChunk.from', 'moveChunk.error'] } } },
    { $group: { _id: { what: '$what', ok: { $eq: ['$details.note', 'success'] } }, n: { $sum: int(1) } } },
  ];
}

const serverStatusParts: Json = {
  serverStatus: int(1),
  repl: int(0),
  metrics: int(0),
  locks: int(0),
  opcounters: int(0),
  opcountersRepl: int(0),
  network: int(0),
  connections: int(0),
  mem: int(0),
  extra_info: int(0),
};

/** The 13 requests of a mongos, in the order of the card. */
export function clusterRequests(at: number): readonly MongoRequest[] {
  const since = date(at - dayMs);
  const errorRounds = { $or: [{ 'details.errorOccured': true }, { 'details.errorOccurred': true }] };
  return [
    adminCommand({ buildInfo: int(1) }),
    adminCommand({ listShards: int(1) }),
    adminCommand({ balancerStatus: int(1) }),
    configCall('settings', 'find', [{}]),
    configCall('collections', 'find', [{ dropped: { $ne: true } }, { sort: { _id: int(1) } }]),
    configCall('chunks', 'aggregate', [chunkGroups], clusterTimeLimitMs),
    configCall('tags', 'find', [{}, { sort: { ns: int(1), min: int(1) } }]),
    configCall('databases', 'find', [{}, { projection: { primary: int(1) } }]),
    adminCommand(serverStatusParts),
    configCall('changelog', 'aggregate', [migrationGroups(since)], clusterTimeLimitMs),
    configCall('actionlog', 'countDocuments', [{ time: { $gte: since }, ...errorRounds }], clusterTimeLimitMs),
    configCall('mongos', 'find', [{}, { projection: { ping: int(1) } }]),
    {
      engine: 'mongodb',
      database: 'admin',
      method: 'aggregate',
      arguments: [[{ $shardedDataDistribution: {} }]],
      timeLimitMs: clusterTimeLimitMs,
    },
  ];
}

function namespacesArg(args: Json, name: string): readonly string[] {
  return listOf(recordOf(args)[name]).flatMap((each) => (typeof each === 'string' ? [each] : []));
}

function collStatsCall(namespace: string): MongoRequest {
  const { database, collection } = splitNamespace(namespace);
  return collectionCall({
    database,
    collection,
    method: 'aggregate',
    arguments: [
      [
        { $collStats: { storageStats: {} } },
        { $project: { shard: int(1), 'storageStats.size': int(1), 'storageStats.count': int(1) } },
      ],
    ],
    timeLimitMs: clusterTimeLimitMs,
  });
}

/** Feature: monitor.read-sharding — the requests of the step. */
export function request(context: Context, args: Json): ReadRequest {
  const connection = readConnection(args);
  switch (textArg(args, 'step') ?? 'hello') {
    case 'sharding-state':
      return engineRead(connection, [adminCommand({ shardingState: int(1) })]);
    case 'cluster':
      return engineRead(connection, clusterRequests(numberArg(args, 'at') ?? context.now));
    case 'collections':
      return engineRead(connection, [
        ...namespacesArg(args, 'verdicts').map((namespace) => adminCommand({ balancerCollectionStatus: namespace })),
        ...namespacesArg(args, 'collStats').map(collStatsCall),
      ]);
    case 'shard-map':
      return engineRead(connection, [adminCommand({ getShardMap: int(1) })]);
    default:
      return engineRead(connection, [adminCommand({ hello: int(1) })]);
  }
}

function withMe<T extends object>(server: T, me: string | undefined): T & { readonly me?: string } {
  return me === undefined ? server : { ...server, me };
}

/** What `hello` says the server is (a replica set member until `shardingState` says more). */
export function shardingServerOf(hello: unknown): ShardingServer {
  const fields = recordOf(hello);
  const me = textOf(fields['me']);
  if (fields['msg'] === 'isdbgrid') {
    return { kind: 'mongos' };
  }
  if (fields['configsvr'] !== undefined) {
    return withMe({ kind: 'config-server' } as const, me);
  }
  return withMe({ kind: textOf(fields['setName']) === undefined ? 'standalone' : 'replica-set' } as const, me);
}

/** A member of a shard when `shardingState` says so; a replica set member otherwise, or when it is refused. */
export function shardMemberOf(reply: unknown, me: string | undefined): ShardingServer {
  const fields = recordOf(reply);
  const shard = textOf(fields['shardName']);
  if (failureOf(reply) !== undefined || fields['enabled'] !== true || shard === undefined) {
    return withMe({ kind: 'replica-set' } as const, me);
  }
  const configServer = textOf(fields['configServer']);
  return withMe({ kind: 'shard-member', shard, ...(configServer === undefined ? {} : { configServer }) } as const, me);
}

/** The cluster from the 13 replies of a mongos, read at `at` (rules 1 to 8). */
export function clusterOf(replies: readonly unknown[], at: number): ShardedCluster {
  const [build, shardList, status, settings, collectionList, chunks, tags, databases, server] = replies;
  const [changelog, actionlog, routers, distribution] = replies.slice(9);
  const data = failureOf(distribution) === undefined ? distributionOf(distribution) : undefined;
  const collections = collectionsOf(collectionList, chunks, tags, data);
  const shards = withShardData(shardsOf(shardList, { chunkGroups: chunks, databases }), collections);
  const version = failureOf(build) === undefined ? textOf(recordOf(build)['version']) : undefined;
  const configServer = configServerOf(server);
  const balancer = balancerOf(status, settings, server);
  const migrations = migrationsOf(changelog, actionlog);
  const routersRead = routersOf(routers, at);
  const optional: Partial<ShardedCluster> = {
    ...(version === undefined ? {} : { version }),
    ...(configServer === undefined ? {} : { configServer }),
    ...(balancer === undefined ? {} : { balancer }),
    ...(migrations === undefined ? {} : { migrations }),
    ...(routersRead === undefined ? {} : { routers: routersRead }),
    ...(shards === undefined ? {} : { shards }),
    ...(collections === undefined ? {} : { collections }),
  };
  const errors = [
    ...partError(parts.shards, shardList),
    ...partError(parts.balancer, status),
    ...partError(parts.settings, settings),
    ...partError(parts.collections, collectionList),
    ...partError(parts.chunks, chunks),
    ...partError(parts.zones, tags),
    ...partError(parts.migrations, changelog),
  ];
  return { ...optional, zones: zonesOf(shards, tags), errors };
}

/** What the step `collections` gives, from its replies: the verdicts first, then the `$collStats`. */
export function collectionReadsOf(replies: readonly unknown[], args: Json): readonly CollectionRead[] {
  const verdicts = namespacesArg(args, 'verdicts');
  const collStats = namespacesArg(args, 'collStats');
  const reads = new Map<string, CollectionRead>();
  verdicts.forEach((namespace, index) => {
    const reply = replies[index];
    const failure = failureOf(reply);
    const verdict: PartRead<BalancerVerdict> =
      failure === undefined ? { kind: 'read', value: verdictOf(reply) } : { kind: 'failed', failure };
    reads.set(namespace, { namespace, verdict });
  });
  collStats.forEach((namespace, index) => {
    const reply = replies[verdicts.length + index];
    const failure = failureOf(reply);
    const data: PartRead<readonly ShardData[]> =
      failure === undefined ? { kind: 'read', value: collStatsDataOf(reply) } : { kind: 'failed', failure };
    reads.set(namespace, { ...(reads.get(namespace) ?? { namespace }), data });
  });
  return [...reads.values()];
}

/** Feature: monitor.read-sharding — what the step gives. */
export function parse(replies: readonly unknown[], args: Json = null): ShardingRead {
  switch (textArg(args, 'step') ?? 'hello') {
    case 'sharding-state':
      return { step: 'sharding-state', server: shardMemberOf(replies[0], textArg(args, 'me')) };
    case 'cluster': {
      const dataFailure = failureOf(replies[12]);
      const at = numberArg(args, 'at') ?? dateOf(recordOf(replies[8])['localTime']) ?? 0;
      const cluster = clusterOf(replies, at);
      return { step: 'cluster', cluster, ...(dataFailure === undefined ? {} : { dataFailure }) };
    }
    case 'collections':
      return { step: 'collections', collections: collectionReadsOf(replies, args) };
    case 'shard-map': {
      const configServer = failureOf(replies[0]) === undefined ? configServerOf(null, replies[0]) : undefined;
      return { step: 'shard-map', ...(configServer === undefined ? {} : { configServer }) };
    }
    default: {
      const failure = failureOf(replies[0]);
      return failure === undefined
        ? { step: 'hello', server: { kind: 'read', value: shardingServerOf(replies[0]) } }
        : { step: 'hello', server: { kind: 'failed', failure } };
    }
  }
}

/**
 * The arguments of the steps `collections` of a full read: the first 100 sharded collections, 8 at a time, with their
 * `$collStats` too when `$shardedDataDistribution` failed. A read that is not full has none.
 */
export function collectionSteps(
  connection: ConnectionId,
  read: Extract<ShardingRead, { readonly step: 'cluster' }>,
  full: boolean,
): readonly Json[] {
  if (!full) {
    return [];
  }
  const namespaces = (read.cluster.collections ?? []).slice(0, collectionsAtMost).map((each) => each.namespace);
  const steps: Json[] = [];
  for (let start = 0; start < namespaces.length; start += collectionsAtOnce) {
    const batch = namespaces.slice(start, start + collectionsAtOnce);
    steps.push({
      connection,
      step: 'collections',
      verdicts: [...batch],
      collStats: read.dataFailure === undefined ? [] : [...batch],
    });
  }
  return steps;
}

function shardsPart(shards: ShardedCluster['shards']): Pick<ShardedCluster, 'shards'> {
  return shards === undefined ? {} : { shards };
}

function failureLine(part: string, reads: readonly (PartRead<unknown> | undefined)[]): readonly string[] {
  const asked = reads.filter((read) => read !== undefined);
  const failures = asked.flatMap((read) => (read.kind === 'failed' ? [read.failure] : []));
  const first = failures[0];
  return asked.length > 0 && failures.length === asked.length && first !== undefined
    ? [`${part}: ${shortMessage(first.message)}`]
    : [];
}

/** The cluster of a full read: its collections with their verdicts and the data `$collStats` gave (rules 4, 5, 8). */
export function completeCluster(
  read: Extract<ShardingRead, { readonly step: 'cluster' }>,
  reads: readonly CollectionRead[],
): ShardedCluster {
  const byNamespace = new Map(reads.map((each) => [each.namespace, each]));
  const collections = read.cluster.collections?.map((collection): ShardedCollection => {
    const found = byNamespace.get(collection.namespace);
    const verdict = found?.verdict?.kind === 'read' ? found.verdict.value : undefined;
    const data = collection.data ?? (found?.data?.kind === 'read' ? found.data.value : undefined);
    return { ...collection, ...(verdict === undefined ? {} : { verdict }), ...(data === undefined ? {} : { data }) };
  });
  const errors = [
    ...read.cluster.errors,
    ...(read.dataFailure === undefined
      ? []
      : failureLine(
          parts.data,
          reads.map((each) => each.data),
        )),
    ...failureLine(
      parts.verdicts,
      reads.map((each) => each.verdict),
    ),
  ];
  const limited = read.dataFailure !== undefined && (collections?.length ?? 0) > collectionsAtMost;
  return {
    ...read.cluster,
    ...(collections === undefined ? {} : { collections }),
    ...shardsPart(withShardData(read.cluster.shards, collections)),
    errors,
    ...(limited ? { dataLimitedTo: collectionsAtMost } : {}),
  };
}

/** The cluster of a read that is not full, with the verdicts, the data and the two errors of the last full read. */
export function mergeSharding(previous: ShardedCluster | undefined, current: ShardedCluster): ShardedCluster {
  if (previous === undefined) {
    return current;
  }
  const kept = new Map((previous.collections ?? []).map((each) => [each.namespace, each]));
  const collections = current.collections?.map((collection): ShardedCollection => {
    const last = kept.get(collection.namespace);
    const verdict = last?.verdict;
    const data = collection.data ?? last?.data;
    return { ...collection, ...(verdict === undefined ? {} : { verdict }), ...(data === undefined ? {} : { data }) };
  });
  const lastErrors = previous.errors.filter(
    (line) => line.startsWith(`${parts.data}:`) || line.startsWith(`${parts.verdicts}:`),
  );
  const fromLast = current.collections?.some((each) => each.data === undefined) === true;
  return {
    ...current,
    ...(collections === undefined ? {} : { collections }),
    ...shardsPart(withShardData(current.shards, collections)),
    errors: [...current.errors, ...lastErrors],
    ...(fromLast && previous.dataLimitedTo !== undefined ? { dataLimitedTo: previous.dataLimitedTo } : {}),
  };
}
