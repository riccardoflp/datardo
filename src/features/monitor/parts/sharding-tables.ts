/**
 * The tables of the Sharding section (`monitor.sharding`): **Shards** and **Sharded collections**, with the colors of
 * the shards, the **Distribution** bar, the filter and the sorts. Ported from Mongoster's `src/webview/monitor.ts ›
 * renderShards`, `renderShardCollections`.
 */
import { balance, defaultChunkSizeMb, type Balance } from '../balance';
import { text } from '../text';
import type { Shard, ShardedCollection } from './sharding-records';
import { sortedBy, type TableSort, type Tone } from './tiles';
import { countText, holdsWithoutCase, sizeText } from './units';

/** The columns of **Shards**. */
export type ShardColumn = keyof typeof text.sharding.shards.columns;

/** The columns of **Sharded collections**. */
export type CollectionColumn = keyof typeof text.sharding.collections.columns;

/** The columns of **Sharded collections** that do not sort. */
export const unsortedColumns: readonly CollectionColumn[] = ['chunksPerShard', 'distribution'];

/** The columns of **Sharded collections** that hold numbers, which a first click sorts the largest first. */
const numberColumns: readonly CollectionColumn[] = ['chunks', 'data', 'documents', 'jumbo'];

/** Whether a column of **Sharded collections** holds words, which a first click sorts from A. */
export function isWordColumn(column: CollectionColumn): boolean {
  return !numberColumns.includes(column);
}

/** A row of **Shards**. */
export interface ShardRow {
  readonly shard: string;
  /** The index of the shard's color, in the order of the shards. */
  readonly color: number;
  readonly replicaSet: string;
  readonly members: string;
  readonly state: string;
  readonly draining: string;
  readonly zones: string;
  readonly chunks: string;
  readonly data: string;
  /** *34% of the sharded data*. */
  readonly dataTooltip: string;
  readonly documents: string;
  readonly primaryOf: string;
}

/** A segment of **Distribution**: a shard's share, in its color when the shard is still listed. */
export interface Segment {
  readonly shard: string;
  readonly color?: number;
  /** Between 0 and 1. */
  readonly share: number;
}

/** A row of **Sharded collections**. */
export interface CollectionRow {
  readonly namespace: string;
  readonly key: string;
  readonly unique: string;
  readonly balancing: string;
  readonly balancingTone: Tone;
  readonly chunks: string;
  readonly chunksPerShard: string;
  readonly data: string;
  readonly documents: string;
  readonly distribution: { readonly segments: readonly Segment[]; readonly tooltip: string };
  readonly balance: Balance;
  readonly jumbo: string;
  readonly jumboTone: Tone;
}

const shardWords = text.sharding.shards;
const collectionWords = text.sharding.collections;

/** The percent of a part of a whole, rounded: `34`. */
export function percentOf(part: number, whole: number): string {
  return whole > 0 ? String(Math.round((part / whole) * 100)) : '0';
}

/** The state of a shard: *active* for 1 (or none given), else *state 0*. */
export function shardState(shard: Shard): string {
  return shard.state === undefined || shard.state === 1 ? shardWords.active : shardWords.state(String(shard.state));
}

/** The rows of **Shards**, the share of each in the data of the sharded collections. */
export function shardRows(shards: readonly Shard[]): readonly ShardRow[] {
  const total = shards.reduce((sum, shard) => sum + (shard.dataSize ?? 0), 0);
  return shards.map((shard, color) => ({
    shard: shard.name,
    color,
    replicaSet: shard.replicaSet ?? shardWords.standalone,
    members: shard.members.join(', '),
    state: shardState(shard),
    draining: shard.draining ? shardWords.yes : '',
    zones: shard.zones.join(', '),
    chunks: shard.chunks === undefined ? '' : countText(shard.chunks),
    data: shard.dataSize === undefined ? '' : sizeText(shard.dataSize),
    dataTooltip: shard.dataSize === undefined ? '' : shardWords.share(percentOf(shard.dataSize, total)),
    documents: shard.documents === undefined ? '' : countText(shard.documents),
    primaryOf: shard.primaryOf.join(', '),
  }));
}

/** The data of a collection in all, when known. */
export function dataOf(collection: ShardedCollection): { readonly size: number; readonly count: number } | undefined {
  return collection.data?.reduce((sum, each) => ({ size: sum.size + each.size, count: sum.count + each.count }), {
    size: 0,
    count: 0,
  });
}

/** **Distribution**: by data, else by chunks; a shard no longer listed has no color. */
export function distribution(
  collection: ShardedCollection,
  shards: readonly Shard[],
): { readonly segments: readonly Segment[]; readonly tooltip: string } {
  const byData = collection.data !== undefined && (dataOf(collection)?.size ?? 0) > 0;
  const amounts: readonly (readonly [string, number])[] = byData
    ? (collection.data ?? []).map((each) => [each.shard, each.size] as const)
    : collection.chunks;
  const total = amounts.reduce((sum, [, amount]) => sum + amount, 0);
  const shown = amounts.filter(([, amount]) => amount > 0);
  const segments = shown.map(([shard, amount]): Segment => {
    const color = shards.findIndex((each) => each.name === shard);
    return { shard, share: total > 0 ? amount / total : 0, ...(color < 0 ? {} : { color }) };
  });
  const tooltip = shown
    .map(([shard, amount]) =>
      collectionWords.portion(shard, byData ? sizeText(amount) : countText(amount), percentOf(amount, total)),
    )
    .join('\n');
  return { segments, tooltip };
}

/** The row of a sharded collection. */
export function collectionRow(
  collection: ShardedCollection,
  shards: readonly Shard[],
  chunkSizeMb?: number,
): CollectionRow {
  const data = dataOf(collection);
  return {
    namespace: collection.namespace,
    key: collection.key,
    unique: collection.unique ? collectionWords.yes : '',
    balancing: collection.balancing ? collectionWords.on : collectionWords.off,
    balancingTone: collection.balancing ? 'ordinary' : 'warning',
    chunks: countText(collection.totalChunks),
    chunksPerShard: collection.chunks.map(([shard, count]) => `${shard} ${countText(count)}`).join(' · '),
    data: data === undefined ? '' : sizeText(data.size),
    documents: data === undefined ? '' : countText(data.count),
    distribution: distribution(collection, shards),
    balance: balance(collection, shards, chunkSizeMb ?? defaultChunkSizeMb),
    jumbo: collection.jumbo > 0 ? countText(collection.jumbo) : '',
    jumboTone: collection.jumbo > 0 ? 'warning' : 'ordinary',
  };
}

/** Whether a collection's namespace or shard key holds the filter's text. */
export function matchesFilter(collection: ShardedCollection, filter: string): boolean {
  const typed = filter.trim();
  return typed === '' || holdsWithoutCase(collection.namespace, typed) || holdsWithoutCase(collection.key, typed);
}

function sortValue(
  collection: ShardedCollection,
  row: CollectionRow,
  column: CollectionColumn,
): number | string | undefined {
  switch (column) {
    case 'chunks':
      return collection.totalChunks;
    case 'data':
      return dataOf(collection)?.size;
    case 'documents':
      return dataOf(collection)?.count;
    case 'jumbo':
      return collection.jumbo;
    case 'balance':
      return row.balance.word;
    case 'key':
    case 'unique':
    case 'balancing':
      return row[column];
    case 'namespace':
    case 'chunksPerShard':
    case 'distribution':
      return collection.namespace;
  }
}

/** The collections the filter keeps, as rows, in the order of the sort (by **Namespace** to start with). */
export function collectionRows(
  collections: readonly ShardedCollection[],
  context: {
    readonly shards: readonly Shard[];
    readonly chunkSizeMb?: number;
    readonly filter: string;
    readonly sort?: TableSort<CollectionColumn>;
  },
): readonly CollectionRow[] {
  const sort = context.sort ?? { column: 'namespace', descending: false };
  const rows = collections
    .filter((collection) => matchesFilter(collection, context.filter))
    .map((collection) => ({ collection, row: collectionRow(collection, context.shards, context.chunkSizeMb) }));
  return sortedBy(rows, (each) => sortValue(each.collection, each.row, sort.column), sort.descending).map(
    (each) => each.row,
  );
}
