/**
 * Feature: monitor.sharding
 *
 * The Sharding section: through a mongos, the sharded cluster's shards, its sharded collections with their chunks and
 * data per shard, the balancer, and the recent migrations and splits; on another server, the sentence of its case.
 * Ported from Mongoster's `src/webview/monitor.ts › renderSharding`, `renderShards`, `renderShardCollections`,
 * `shardCollectionDetail`, `renderShardEvents`.
 */
import type { Json } from '../../shared/engine-request';
import { balance, defaultChunkSizeMb, type Balance } from './balance';
import type { PartRead } from './parts/failure';
import type { Shard, ShardedCluster, ShardedCollection } from './parts/sharding-records';
import {
  collectionRows,
  dataOf,
  percentOf,
  shardRows,
  type CollectionColumn,
  type CollectionRow,
  type ShardRow,
} from './parts/sharding-tables';
import { clusterTiles, joined } from './parts/sharding-tiles';
import type { SectionControl, TableSort, Tile } from './parts/tiles';
import { clockText, countText, sizeText } from './parts/units';
import type { EventScope, ShardingEvent } from './read-sharding-events';
import type { ShardingServer } from './read-sharding';
import { oplogTime } from './replication';
import { text } from './text';
import type { MonitorConnection } from './types';

/** What the section is drawn from. */
export interface ShardingState {
  readonly connection: MonitorConnection;
  readonly server?: PartRead<ShardingServer>;
  /** The cluster, merged with the last full read (`mergeSharding`). */
  readonly cluster?: ShardedCluster;
  /** When the cluster was read, in milliseconds since 1970. */
  readonly readAt: number;
  readonly collectionFilter: string;
  readonly collectionSort?: TableSort<CollectionColumn>;
  /** What is selected: a shard, a sharded collection or an event, shown in the inspector island. */
  readonly chosen?: { readonly kind: 'shard' | 'collection' | 'event'; readonly key: string };
  readonly events?: PartRead<readonly ShardingEvent[]>;
  readonly eventsText: string;
  readonly eventsScope: EventScope;
}

/** A row of **Recent events**. */
export interface EventRow {
  readonly key: string;
  readonly time: string;
  readonly event: string;
  /** The warning mark of a failure. */
  readonly failure: boolean;
  readonly namespace: string;
  readonly shard: string;
  readonly details: string;
}

/** What the inspector island shows for the selection. */
export type ShardingInspector =
  | { readonly kind: 'shard'; readonly record: Json }
  | { readonly kind: 'event'; readonly entry: Json }
  | {
      readonly kind: 'collection';
      readonly balancing: SectionControl;
      /** What **Copy shard key** copies. */
      readonly key: string;
      readonly balance: Balance;
      readonly shards: readonly {
        readonly shard: string;
        readonly chunks: string;
        readonly data: string;
        readonly documents: string;
        readonly share: string;
      }[];
      readonly zones: readonly { readonly range: string; readonly shards: string }[];
      readonly noZones?: string;
      readonly record: Json;
    };

/** A table of the section, with what it says when it has no row. */
export interface SectionTable<Row> {
  readonly rows: readonly Row[];
  readonly empty?: string;
}

/** What the section shows through a mongos. */
export interface ClusterView {
  readonly kind: 'cluster';
  readonly tiles: readonly Tile[];
  /** *Not everything could be read (…):* and one line per part, when a part failed. */
  readonly errors: readonly string[];
  readonly shards: SectionTable<ShardRow> & { readonly asOf: string; readonly balancer?: SectionControl };
  readonly collections: SectionTable<CollectionRow> & { readonly count: string };
  readonly inspector?: ShardingInspector;
  readonly events: SectionTable<EventRow> & { readonly count?: string; readonly error?: string };
}

/** What the section shows. */
export type ShardingView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: string }
  | { readonly kind: 'sentence'; readonly sentence: string }
  | ClusterView;

const words = text.sharding;

function balancerControl(state: ShardingState, cluster: ShardedCluster): SectionControl | undefined {
  const mode = cluster.balancer?.mode;
  if (mode === undefined) {
    return undefined;
  }
  const stop = mode !== 'off';
  const connection = state.connection;
  return {
    label: stop ? words.shards.stopBalancer : words.shards.startBalancer,
    element: 'monitor.set-balancer@toolbar',
    feature: 'monitor.set-balancer',
    args: { connection: connection.id, balancer: stop ? 'stop' : 'start' },
    ...(connection.readOnly ? { disabledBecause: text.readOnly(connection.name) } : {}),
  };
}

function collectionInspector(
  state: ShardingState,
  collection: ShardedCollection,
  shards: readonly Shard[],
): ShardingInspector {
  const connection = state.connection;
  const chunkSizeMb = state.cluster?.balancer?.chunkSizeMb ?? defaultChunkSizeMb;
  const total = dataOf(collection)?.size ?? 0;
  const names = [
    ...new Set([...collection.chunks.map(([shard]) => shard), ...(collection.data ?? []).map((each) => each.shard)]),
  ];
  const held = names.flatMap((shard) => {
    const chunks = collection.chunks.find(([name]) => name === shard)?.[1] ?? 0;
    const data = collection.data?.find((each) => each.shard === shard);
    return chunks === 0 && (data?.size ?? 0) === 0
      ? []
      : [
          {
            shard,
            chunks: countText(chunks),
            data: data === undefined ? '' : sizeText(data.size),
            documents: data === undefined ? '' : countText(data.count),
            share: data === undefined ? '' : `${percentOf(data.size, total)}%`,
          },
        ];
  });
  const zones = collection.zones.map((zone) => {
    const holders = shards.filter((shard) => shard.zones.includes(zone.zone)).map((shard) => shard.name);
    return {
      range: words.inspector.zoneRange(zone.min, zone.max),
      shards: holders.length > 0 ? words.inspector.onShards(holders.join(', ')) : words.inspector.noShardInZone,
    };
  });
  return {
    kind: 'collection',
    balancing: {
      label: collection.balancing ? words.inspector.disable : words.inspector.enable,
      element: 'monitor.set-collection-balancing@inspector',
      feature: 'monitor.set-collection-balancing',
      args: {
        connection: connection.id,
        namespace: collection.namespace,
        balancing: collection.balancing ? 'disable' : 'enable',
      },
      ...(connection.readOnly ? { disabledBecause: text.readOnly(connection.name) } : {}),
    },
    key: collection.key,
    balance: balance(collection, shards, chunkSizeMb),
    shards: held,
    zones,
    ...(zones.length === 0 ? { noZones: words.inspector.noZoneRanges } : {}),
    record: collection.record,
  };
}

function inspectorOf(state: ShardingState, cluster: ShardedCluster): ShardingInspector | undefined {
  const chosen = state.chosen;
  const shards = cluster.shards ?? [];
  switch (chosen?.kind) {
    case 'shard': {
      const shard = shards.find((each) => each.name === chosen.key);
      return shard === undefined ? undefined : { kind: 'shard', record: shard.record };
    }
    case 'collection': {
      const collection = cluster.collections?.find((each) => each.namespace === chosen.key);
      return collection === undefined ? undefined : collectionInspector(state, collection, shards);
    }
    case 'event': {
      const events = state.events?.kind === 'read' ? state.events.value : [];
      const event = events.find((each) => each.key === chosen.key);
      return event === undefined ? undefined : { kind: 'event', entry: event.entry };
    }
    case undefined:
      return undefined;
  }
}

function eventsTable(state: ShardingState): ClusterView['events'] {
  const read = state.events;
  if (read === undefined) {
    return { rows: [] };
  }
  if (read.kind === 'failed') {
    return { rows: [], error: read.failure.message };
  }
  const rows = read.value.map((event): EventRow => ({
    key: event.key,
    time: event.time === 0 ? '' : oplogTime(event.time, state.readAt),
    event: event.what,
    failure: event.failure,
    namespace: event.namespace,
    shard: event.shard ?? '',
    details: event.summary,
  }));
  if (rows.length === 0) {
    return { rows, empty: state.eventsText.trim() === '' ? words.events.empty : words.events.nothingForNamespace };
  }
  const failures = rows.filter((row) => row.failure).length;
  const count = joined([
    words.events.count(countText(rows.length)),
    failures > 0 ? words.events.withErrors(countText(failures)) : '',
  ]);
  return { rows, count };
}

function collectionsTable(state: ShardingState, cluster: ShardedCluster): ClusterView['collections'] {
  const collections = cluster.collections;
  if (collections === undefined) {
    return { rows: [], count: '', empty: words.collections.failed };
  }
  const rows = collectionRows(collections, {
    shards: cluster.shards ?? [],
    ...(cluster.balancer?.chunkSizeMb === undefined ? {} : { chunkSizeMb: cluster.balancer.chunkSizeMb }),
    filter: state.collectionFilter,
    ...(state.collectionSort === undefined ? {} : { sort: state.collectionSort }),
  });
  const limited =
    cluster.dataLimitedTo === undefined ? '' : ` ${words.collections.limited(countText(cluster.dataLimitedTo))}`;
  const count = `${words.collections.count(countText(rows.length), countText(collections.length))}${limited}`;
  const empty =
    rows.length > 0 ? undefined : collections.length === 0 ? words.collections.empty : words.collections.nothingMatches;
  return { rows, count, ...(empty === undefined ? {} : { empty }) };
}

function clusterView(state: ShardingState, cluster: ShardedCluster): ClusterView {
  const shards = cluster.shards;
  const balancer = balancerControl(state, cluster);
  const inspector = inspectorOf(state, cluster);
  const shardsEmpty = shards === undefined ? words.shards.failed : shards.length === 0 ? words.shards.empty : undefined;
  return {
    kind: 'cluster',
    tiles: clusterTiles(cluster),
    errors: cluster.errors.length === 0 ? [] : [words.notEverything, ...cluster.errors],
    shards: {
      asOf: words.shards.asOf(clockText(state.readAt)),
      rows: shardRows(shards ?? []),
      ...(shardsEmpty === undefined ? {} : { empty: shardsEmpty }),
      ...(balancer === undefined ? {} : { balancer }),
    },
    collections: collectionsTable(state, cluster),
    ...(inspector === undefined ? {} : { inspector }),
    events: eventsTable(state),
  };
}

/** The sentence of a server that is not a mongos. */
export function serverSentence(server: Exclude<ShardingServer, { readonly kind: 'mongos' }>): string {
  const me = server.me ?? words.thisServer;
  switch (server.kind) {
    case 'standalone':
      return words.standalone(me);
    case 'replica-set':
      return words.replicaSet(me);
    case 'config-server':
      return words.configServer(me);
    case 'shard-member':
      return words.shardMember(me, server.shard, server.configServer ?? words.tiles.unknown);
  }
}

/** Feature: monitor.sharding — what the section shows, by the kind of server. */
export function view(state: ShardingState): ShardingView {
  const server = state.server;
  if (server === undefined) {
    return { kind: 'loading' };
  }
  if (server.kind === 'failed') {
    return { kind: 'error', error: server.failure.message };
  }
  if (server.value.kind !== 'mongos') {
    return { kind: 'sentence', sentence: serverSentence(server.value) };
  }
  return state.cluster === undefined ? { kind: 'loading' } : clusterView(state, state.cluster);
}
