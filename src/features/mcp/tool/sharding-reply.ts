/**
 * The reply of the app action `monitor.sharding`, which the tool `sharding_status` writes (`mcp.deployment-tools`):
 * the sharded cluster as `monitor.read-sharding` reads it through a mongos, in full, and the recent events of
 * `monitor.read-sharding-events`. The main process makes the reads; this puts their results in the shape the tool's
 * text is written from. It writes nothing: the balancer is never started or stopped.
 */
import type { PartRead } from '../../monitor/parts/failure';
import type { ShardedCluster, ShardedCollection as ClusterCollection } from '../../monitor/parts/sharding-records';
import type { ShardingEvent as ClusterEvent } from '../../monitor/read-sharding-events';
import type { ShardedCollection, ShardInfo, ShardingEvent, ShardingReply } from './sharding';

function collectionOf(collection: ClusterCollection): ShardedCollection {
  const verdict = collection.verdict;
  return {
    ns: collection.namespace,
    key: collection.key,
    ...(collection.unique ? { unique: true } : {}),
    balancing: collection.balancing,
    totalChunks: collection.totalChunks,
    chunks: Object.fromEntries(collection.chunks),
    ...(collection.jumbo > 0 ? { jumbo: collection.jumbo } : {}),
    ...(collection.data === undefined
      ? {}
      : {
          data: Object.fromEntries(collection.data.map((each) => [each.shard, { size: each.size, count: each.count }])),
        }),
    ...(verdict === undefined ? {} : { balanced: verdict.compliant }),
    ...(verdict?.violation === undefined ? {} : { violation: verdict.violation }),
  };
}

function shardOf(shard: NonNullable<ShardedCluster['shards']>[number]): ShardInfo {
  return {
    name: shard.name,
    ...(shard.replicaSet === undefined ? {} : { replSet: shard.replicaSet }),
    members: shard.members,
    ...(shard.draining ? { draining: true } : {}),
    ...(shard.state === undefined ? {} : { state: shard.state }),
    ...(shard.chunks === undefined ? {} : { chunks: shard.chunks }),
    ...(shard.dataSize === undefined ? {} : { dataSize: shard.dataSize }),
    ...(shard.documents === undefined ? {} : { documents: shard.documents }),
    zones: shard.zones,
    primaryOf: shard.primaryOf,
  };
}

function eventOf(event: ClusterEvent): ShardingEvent {
  return {
    time: event.time === 0 ? '' : new Date(event.time).toISOString(),
    what: event.what,
    ...(event.namespace === '' ? {} : { ns: event.namespace }),
    ...(event.shard === undefined ? {} : { shard: event.shard }),
    ...(event.summary === '' ? {} : { summary: event.summary }),
    failed: event.failure,
  };
}

function eventsOf(events: PartRead<readonly ClusterEvent[]> | undefined, most: number): Partial<ShardingReply> {
  if (events === undefined || most === 0) {
    return {};
  }
  return events.kind === 'failed'
    ? { eventsError: events.failure.message }
    : { events: events.value.slice(0, most).map(eventOf) };
}

/** The reply of `sharding_status`, from the cluster of a full read and the events, `most` of them at most. */
export function shardingReply(
  cluster: ShardedCluster,
  events: PartRead<readonly ClusterEvent[]> | undefined,
  most: number,
): ShardingReply {
  const balancer = cluster.balancer;
  return {
    ...(cluster.version === undefined ? {} : { version: cluster.version }),
    ...(cluster.configServer === undefined ? {} : { configServer: cluster.configServer }),
    ...(cluster.routers === undefined ? {} : { routers: cluster.routers }),
    ...(balancer?.mode === undefined
      ? {}
      : {
          balancer: {
            enabled: balancer.mode !== 'off',
            mode: balancer.mode,
            ...(balancer.inRound === undefined ? {} : { running: balancer.inRound }),
            ...(balancer.chunkSizeMb === undefined ? {} : { chunkSizeMb: balancer.chunkSizeMb }),
          },
        }),
    ...(cluster.migrations === undefined
      ? {}
      : { migrations: { done: cluster.migrations.done, failed: cluster.migrations.failed } }),
    shards: (cluster.shards ?? []).map(shardOf),
    zones: cluster.zones,
    collections: (cluster.collections ?? []).map(collectionOf),
    ...eventsOf(events, most),
    errors: cluster.errors,
  };
}
