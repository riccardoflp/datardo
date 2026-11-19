/**
 * The text of `sharding_status` (`mcp.deployment-tools`). Reading a sharded cluster (`listShards`, `balancerStatus`,
 * `balancerCollectionStatus`, `getShardMap`, the `config` database) is the monitor's (`monitor.sharding`, M30), which
 * is not on this branch: on a mongos the main process answers the app action `monitor.sharding` `{ connection,
 * events }` with a {@link ShardingReply} once it is built, and this writes it. Read only: it never starts or stops the
 * balancer.
 */
import { counted } from '../output-limits';
import { countText, percentText } from './server-status';
import { sizeText } from './units';

/** A shard. */
export interface ShardInfo {
  readonly name: string;
  readonly replSet?: string;
  readonly members: readonly string[];
  readonly draining?: boolean;
  readonly state?: number;
  readonly chunks?: number;
  readonly dataSize?: number;
  readonly documents?: number;
  readonly zones: readonly string[];
  readonly primaryOf: readonly string[];
}

/** A sharded collection. */
export interface ShardedCollection {
  readonly ns: string;
  /** The shard key in mongosh syntax. */
  readonly key: string;
  readonly unique?: boolean;
  readonly balancing: boolean;
  readonly totalChunks: number;
  readonly chunks: Readonly<Record<string, number>>;
  readonly jumbo?: number;
  readonly data?: Readonly<Record<string, { readonly size: number; readonly count: number }>>;
  /** The balancer's verdict, when it could be read, and what is wrong. */
  readonly balanced?: boolean;
  readonly violation?: string;
}

/** An event of `config.changelog` or a balancer round. */
export interface ShardingEvent {
  readonly time: string;
  readonly what: string;
  readonly ns?: string;
  readonly shard?: string;
  readonly summary?: string;
  readonly failed: boolean;
}

/** The reply of `monitor.sharding`. */
export interface ShardingReply {
  readonly version?: string;
  readonly configServer?: string;
  readonly routers?: { readonly active: number; readonly total: number };
  readonly balancer?: {
    readonly enabled: boolean;
    readonly mode?: string;
    readonly running?: boolean;
    readonly chunkSizeMb?: number;
  };
  readonly migrations?: { readonly done: number; readonly failed: number };
  readonly shards: readonly ShardInfo[];
  readonly zones: readonly string[];
  readonly collections: readonly ShardedCollection[];
  readonly events?: readonly ShardingEvent[];
  readonly eventsError?: string;
  /** What could not be read, with the role it needs. */
  readonly errors: readonly string[];
}

const violations: Readonly<Record<string, string>> = {
  chunksImbalance: 'uneven chunks',
  zoneViolation: 'zone violation',
  draining: 'a shard is draining',
  defragmentingChunks: 'defragmenting chunks',
};

function balanceText(collection: ShardedCollection): readonly string[] {
  if (collection.balanced === true) {
    return ['balanced'];
  }
  if (collection.balanced === false) {
    const why =
      violations[collection.violation ?? ''] ?? collection.violation ?? 'the balancer has chunks to move or merge';
    return [`NOT BALANCED (${why})`];
  }
  return [];
}

function shardLine(shard: ShardInfo): string {
  const parts = [
    ...(shard.draining === true ? ['DRAINING'] : []),
    ...(shard.state !== undefined && shard.state !== 1 ? [`NOT ACTIVE (state ${String(shard.state)})`] : []),
    ...(shard.chunks === undefined ? [] : [counted(shard.chunks, 'chunk')]),
    ...(shard.dataSize === undefined ? [] : [`${sizeText(shard.dataSize)} of sharded data`]),
    ...(shard.documents === undefined ? [] : [counted(shard.documents, 'document')]),
    ...(shard.zones.length === 0 ? [] : [`zones ${shard.zones.join(', ')}`]),
    ...(shard.primaryOf.length === 0 ? [] : [`primary shard of ${shard.primaryOf.join(', ')}`]),
  ];
  return `- ${shard.name} (${shard.replSet === undefined ? '' : `replica set ${shard.replSet}: `}${shard.members.join(', ')})${parts.length === 0 ? '' : `: ${parts.join(', ')}`}`;
}

function collectionLine(collection: ShardedCollection): string {
  const perShard = Object.entries(collection.chunks)
    .sort((one, other) => other[1] - one[1])
    .map(([shard, chunks]) => `${shard} ${countText(chunks)}`)
    .join(', ');
  const data = Object.entries(collection.data ?? {}).sort((one, other) => other[1].size - one[1].size);
  const total = data.reduce((sum, [, each]) => sum + each.size, 0);
  const dataText = data
    .map(
      ([shard, each]) =>
        `${shard} ${sizeText(each.size)} / ${countText(each.count)} docs (${percentText(each.size, total)})`,
    )
    .join(', ');
  const parts = [
    `key ${collection.key}${collection.unique === true ? ' unique' : ''}`,
    collection.balancing ? 'balancing on' : 'BALANCING OFF',
    `${counted(collection.totalChunks, 'chunk')}${perShard === '' ? '' : ` (${perShard})`}`,
    ...(collection.jumbo ? [`${countText(collection.jumbo)} JUMBO`] : []),
    ...(dataText === '' ? [] : [`data ${dataText}`]),
    ...balanceText(collection),
  ];
  return `- ${collection.ns}: ${parts.join('; ')}`;
}

function balancerLine(reply: ShardingReply): readonly string[] {
  const balancer = reply.balancer;
  if (balancer === undefined) {
    return [];
  }
  const parts = [
    balancer.enabled
      ? `Balancer: enabled${balancer.mode !== undefined && balancer.mode !== 'full' ? ` (mode ${balancer.mode})` : ''}`
      : 'Balancer: DISABLED',
    ...(balancer.running === undefined ? [] : [balancer.running ? 'a round is running now' : 'no round running now']),
    ...(balancer.chunkSizeMb === undefined ? [] : [`chunk size ${String(balancer.chunkSizeMb)} MB`]),
  ];
  return [`${parts.join(', ')}.`];
}

function eventLines(reply: ShardingReply): readonly string[] {
  if (reply.events === undefined && reply.eventsError === undefined) {
    return [];
  }
  const sorted = [...(reply.events ?? [])].sort(
    (one, other) => Number(other.failed) - Number(one.failed) || other.time.localeCompare(one.time),
  );
  const failed = sorted.filter((each) => each.failed).length;
  return [
    '',
    `Recent events (config.changelog and balancer rounds), failures first${failed > 0 ? ` (${String(failed)} failed)` : ''}:`,
    ...(reply.eventsError === undefined ? [] : [`- could not be read: ${reply.eventsError}`]),
    ...(reply.eventsError === undefined && sorted.length === 0 ? ['- none'] : []),
    ...sorted.map(
      (each) =>
        `- ${each.time} ${each.failed ? 'FAILED ' : ''}${each.what}${each.ns === undefined ? '' : ` ${each.ns}`}${each.shard === undefined ? '' : ` on ${each.shard}`}${each.summary === undefined ? '' : `: ${each.summary}`}`,
    ),
  ];
}

/** The text of `sharding_status` on a mongos. */
export function shardingText(reply: ShardingReply): string {
  const routers = reply.routers;
  return [
    `Sharded cluster${reply.version === undefined ? '' : ` (mongos ${reply.version})`}${reply.configServer === undefined ? '' : `, config servers ${reply.configServer}`}${routers === undefined ? '' : `, ${String(routers.active)} of ${counted(routers.total, 'mongos router')} active in the last minute`}.`,
    ...balancerLine(reply),
    ...(reply.migrations === undefined
      ? []
      : [
          `Last 24 hours: ${counted(reply.migrations.done, 'migration')} done, ${countText(reply.migrations.failed)} failed.`,
        ]),
    '',
    `Shards (${String(reply.shards.length)})${reply.zones.length === 0 ? '' : `, zones ${reply.zones.join(', ')}`}:`,
    ...reply.shards.map(shardLine),
    '',
    `Sharded collections (${String(reply.collections.length)}):`,
    ...(reply.collections.length === 0 ? ['- none'] : reply.collections.map(collectionLine)),
    ...eventLines(reply),
    ...(reply.errors.length === 0
      ? []
      : ['', 'Could not be read (missing roles, usually clusterMonitor):', ...reply.errors.map((each) => `- ${each}`)]),
  ].join('\n');
}
