/**
 * The reads of `monitor.read-sharding` one after the other, as the Sharding section and the tool `sharding_status`
 * send them: `hello`; then `shardingState` in a replica set, or, through a mongos, the 13 requests of the cluster, the
 * steps `collections` of a full read (8 namespaces each), and `getShardMap` when `serverStatus` did not name the config
 * servers. Each step is given what the previous ones answered ({@link ShardingProgress}); {@link nextShardingRead}
 * says what follows, and nothing once everything is read; {@link shardingOf} puts the answers together.
 */
import type { Json } from '../../../shared/engine-request';
import type { ConnectionId } from '../../../shared/ids';
import {
  collectionSteps,
  completeCluster,
  type CollectionRead,
  type ShardingRead,
  type ShardingServer,
} from '../read-sharding';
import type { PartRead } from './failure';
import type { ShardedCluster } from './sharding-records';

/** What the reads of the cluster are for: the connection, whether the read is full, and its time. */
export interface ShardingInput {
  readonly connection: ConnectionId;
  /** A full read also asks the balancer's verdict of each collection (`monitor.read-sharding`, rule 9). */
  readonly full: boolean;
  /** When the read is made, in milliseconds since 1970: the 24 hours and the routers' pings count from it. */
  readonly at: number;
}

/** What the steps have answered so far. */
export interface ShardingProgress {
  readonly hello?: Extract<ShardingRead, { readonly step: 'hello' }>;
  readonly state?: Extract<ShardingRead, { readonly step: 'sharding-state' }>;
  readonly cluster?: Extract<ShardingRead, { readonly step: 'cluster' }>;
  /** The answers of the steps `collections`, in order. */
  readonly collections: readonly (readonly CollectionRead[])[];
  readonly shardMap?: Extract<ShardingRead, { readonly step: 'shard-map' }>;
}

/** Nothing answered yet. */
export const nothingSharded: ShardingProgress = { collections: [] };

/** What the steps gave: the kind of server, and through a mongos the cluster once it is read. */
export interface ShardingResult {
  readonly server?: PartRead<ShardingServer>;
  readonly cluster?: ShardedCluster;
}

/** The progress with the answer of a step. */
export function withShardingReply(progress: ShardingProgress, read: ShardingRead): ShardingProgress {
  switch (read.step) {
    case 'hello':
      return { ...progress, hello: read };
    case 'sharding-state':
      return { ...progress, state: read };
    case 'cluster':
      return { ...progress, cluster: read };
    case 'collections':
      return { ...progress, collections: [...progress.collections, read.collections] };
    case 'shard-map':
      return { ...progress, shardMap: read };
  }
}

/** The arguments of the next step of `monitor.read-sharding`, or `undefined` once everything is read. */
export function nextShardingRead(input: ShardingInput, progress: ShardingProgress): Json | undefined {
  const { connection } = input;
  const hello = progress.hello;
  if (hello === undefined) {
    return { connection, step: 'hello' };
  }
  if (hello.server.kind === 'failed') {
    return undefined;
  }
  const server = hello.server.value;
  if (server.kind === 'replica-set') {
    return progress.state === undefined
      ? { connection, step: 'sharding-state', ...(server.me === undefined ? {} : { me: server.me }) }
      : undefined;
  }
  if (server.kind !== 'mongos') {
    return undefined;
  }
  const cluster = progress.cluster;
  if (cluster === undefined) {
    return { connection, step: 'cluster', at: input.at };
  }
  const steps = collectionSteps(connection, cluster, input.full);
  const step = steps[progress.collections.length];
  if (step !== undefined) {
    return step;
  }
  return cluster.cluster.configServer === undefined && progress.shardMap === undefined
    ? { connection, step: 'shard-map' }
    : undefined;
}

/** What the steps gave, put together: the server as `shardingState` says, the cluster with its collections. */
export function shardingOf(progress: ShardingProgress): ShardingResult {
  const hello = progress.hello;
  if (hello === undefined) {
    return {};
  }
  const server: PartRead<ShardingServer> =
    progress.state === undefined ? hello.server : { kind: 'read', value: progress.state.server };
  const read = progress.cluster;
  if (read === undefined) {
    return { server };
  }
  const complete = completeCluster(read, progress.collections.flat());
  const configServer = complete.configServer ?? progress.shardMap?.configServer;
  return { server, cluster: configServer === undefined ? complete : { ...complete, configServer } };
}
