/**
 * The six tiles of the Sharding section (`monitor.sharding`): Shards, Sharded collections, Chunks, Balancer,
 * Migrations (24 h) and Config servers. Ported from Mongoster's `src/webview/monitor.ts › renderSharding`.
 */
import { balance, defaultChunkSizeMb } from '../balance';
import { text } from '../text';
import { shardHost, type ShardedCluster } from './sharding-records';
import { tile, type Tile } from './tiles';
import { countText } from './units';

const words = text.sharding;

/** The parts of a line that are not empty, joined by ` · `. */
export function joined(parts: readonly string[]): string {
  return parts.filter((part) => part !== '').join(' · ');
}

function shardsTile(cluster: ShardedCluster): Tile {
  const shards = cluster.shards ?? [];
  const draining = shards.filter((shard) => shard.draining).length;
  const notActive = shards.filter((shard) => shard.state !== undefined && shard.state !== 1).length;
  const line = joined([
    draining > 0 ? words.tiles.draining(countText(draining)) : '',
    notActive > 0 ? words.tiles.notActive(countText(notActive)) : '',
    cluster.zones.length > 0 ? words.tiles.zones(cluster.zones.join(', ')) : words.tiles.noZones,
  ]);
  const value = cluster.shards === undefined ? words.tiles.unknown : countText(shards.length);
  return tile(words.tiles.shards, value, line, draining + notActive > 0 ? 'warning' : 'ordinary');
}

function collectionsTile(cluster: ShardedCluster, chunkSizeMb: number): Tile {
  const collections = cluster.collections ?? [];
  const off = collections.filter((collection) => !collection.balancing).length;
  const shards = cluster.shards ?? [];
  const uneven = collections.filter((collection) => balance(collection, shards, chunkSizeMb).warning).length;
  const line = joined([
    off > 0 ? words.tiles.balancingOff(countText(off)) : '',
    uneven > 0 ? words.tiles.notBalanced(countText(uneven)) : '',
  ]);
  const value = cluster.collections === undefined ? words.tiles.unknown : countText(collections.length);
  return tile(words.tiles.collections, value, line, off + uneven > 0 ? 'warning' : 'ordinary');
}

function chunksTile(cluster: ShardedCluster, chunkSizeMb: number): Tile {
  const collections = cluster.collections ?? [];
  const total = collections.reduce((sum, collection) => sum + collection.totalChunks, 0);
  const jumbo = collections.reduce((sum, collection) => sum + collection.jumbo, 0);
  const line = joined([
    jumbo > 0 ? words.tiles.jumbo(countText(jumbo)) : words.tiles.noJumbo,
    words.tiles.chunkSize(String(chunkSizeMb)),
  ]);
  const value = cluster.collections === undefined ? words.tiles.unknown : countText(total);
  return tile(words.tiles.chunks, value, line, jumbo > 0 ? 'warning' : 'ordinary');
}

/** The word of the balancer's mode: *enabled*, *disabled*, the server's own word, or `?`. */
export function balancerWord(mode: string | undefined): string {
  return mode === undefined
    ? words.tiles.unknown
    : mode === 'full'
      ? words.tiles.enabled
      : mode === 'off'
        ? words.tiles.disabled
        : mode;
}

function balancerTile(cluster: ShardedCluster): Tile {
  const balancer = cluster.balancer;
  const line = joined([
    balancer?.inRound === undefined ? '' : balancer.inRound ? words.tiles.inRound : words.tiles.idle,
    balancer?.rounds === undefined ? '' : words.tiles.rounds(countText(balancer.rounds)),
    balancer?.window === undefined ? '' : words.tiles.window(balancer.window.start, balancer.window.stop),
    balancer?.secondaryThrottle === false ? words.tiles.noThrottle : '',
  ]);
  return tile(
    words.tiles.balancer,
    balancerWord(balancer?.mode),
    line,
    balancer?.mode === 'off' ? 'warning' : 'ordinary',
  );
}

function migrationsTile(cluster: ShardedCluster): Tile {
  const migrations = cluster.migrations;
  if (migrations === undefined) {
    return tile(words.tiles.migrations, words.tiles.unknown, '');
  }
  const value = words.tiles.migrationsValue(countText(migrations.done), countText(migrations.failed));
  const line =
    migrations.failedRounds > 0 ? words.tiles.failedRounds(countText(migrations.failedRounds)) : words.tiles.seeEvents;
  return tile(
    words.tiles.migrations,
    value,
    line,
    migrations.failed + migrations.failedRounds > 0 ? 'warning' : 'ordinary',
  );
}

function configServersTile(cluster: ShardedCluster): Tile {
  const host = cluster.configServer === undefined ? undefined : shardHost(cluster.configServer);
  const routers = cluster.routers;
  const line = joined([
    host === undefined ? '' : words.tiles.members(countText(host.members.length)),
    routers === undefined ? '' : words.tiles.routers(countText(routers.active), countText(routers.total)),
    cluster.version === undefined ? '' : words.tiles.mongosVersion(cluster.version),
  ]);
  const value = host?.replicaSet ?? host?.members[0] ?? words.tiles.unknown;
  const inactive = routers !== undefined && routers.active < routers.total;
  return tile(words.tiles.configServers, value, line, inactive ? 'warning' : 'ordinary');
}

/** The six tiles of the cluster. */
export function clusterTiles(cluster: ShardedCluster): readonly Tile[] {
  const chunkSizeMb = cluster.balancer?.chunkSizeMb ?? defaultChunkSizeMb;
  return [
    shardsTile(cluster),
    collectionsTile(cluster, chunkSizeMb),
    chunksTile(cluster, chunkSizeMb),
    balancerTile(cluster),
    migrationsTile(cluster),
    configServersTile(cluster),
  ];
}
