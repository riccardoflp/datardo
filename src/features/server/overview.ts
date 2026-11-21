/**
 * Feature: server.overview
 *
 * The Overview section of the Server page: the server at a glance, as tiles, then the keys of each database. Each
 * number is a field of `INFO`; a field the server does not give is `—`, and its tile is still shown.
 */
import type { ConnectionId } from '../../shared/ids';
import { infoField, infoNumber, sectionFields, type InfoReport, type KeyspaceDatabase } from './read-info';
import { text } from './text';
import {
  bytesTooltip,
  countText,
  sentenceOf,
  sizeOrMissing,
  sizeText,
  startControl,
  timeOrMissing,
  timeText,
  valueOf,
  type Inspection,
  type PartRead,
  type ServerControl,
  type Tone,
  type ToneLine,
} from './types';

/**
 * The share of the memory limit as a whole percent, rounded up so it is never shown smaller than it is (the card's
 * 4,187,593,113 of 4,294,967,296 is 97.49%, shown 98%); none when there is no limit.
 */
export function memoryShare(used: number, limit: number): number | undefined {
  return limit > 0 ? Math.ceil((used / limit) * 100) : undefined;
}

/** The color of the bar of the memory: yellow from 80%, red from 95% (Datardo's choice). */
export function shareTone(percent: number): Tone {
  return percent >= 95 ? 'error' : percent >= 80 ? 'warning' : 'ordinary';
}

/** The hit rate as a percentage with one decimal: `93.4%`; `—` when there were neither hits nor misses. */
export function hitRateText(hits: number | undefined, misses: number | undefined): string {
  const total = (hits ?? 0) + (misses ?? 0);
  return hits === undefined || misses === undefined || total === 0
    ? text.missing
    : `${((hits / total) * 100).toFixed(1)}%`;
}

/** The tiles of the Overview section. */
export type OverviewTileName =
  'version' | 'mode' | 'role' | 'uptime' | 'memory' | 'clients' | 'commands' | 'hitRate' | 'keys' | 'persistence';

/** A tile: its value, the lines under it, its bar, and whether it is selected. */
export interface OverviewTile {
  readonly name: OverviewTileName;
  readonly label: string;
  readonly value: string;
  readonly tooltip?: string;
  readonly lines: readonly ToneLine[];
  readonly bar?: { readonly percent: number; readonly tone: Tone };
  readonly selected: boolean;
}

type TileContent = Omit<OverviewTile, 'name' | 'label' | 'selected'>;

/** A row of **Keys per database**, with what its double click opens (`key.show`). */
export interface DatabaseRow {
  readonly database: number;
  readonly name: string;
  readonly keys: string;
  readonly expires: string;
  readonly averageTtl: string;
  readonly selected: boolean;
  readonly open: ServerControl;
}

/** What the Overview section is drawn from. */
export interface OverviewState {
  readonly connection: ConnectionId;
  readonly info?: PartRead<InfoReport>;
  /** The time, in milliseconds since 1970, for the time since the last snapshot. */
  readonly now: number;
  readonly selected?: OverviewTileName;
  /** The row of the table selected, by its database, when no tile is. */
  readonly selectedDatabase?: number;
}

/** What the Overview section shows: the error line, the tiles, the table or *No keys.*, and the inspector island. */
export interface OverviewView {
  readonly error?: string;
  readonly tiles: readonly OverviewTile[];
  readonly databases?: {
    readonly title: string;
    readonly columns: typeof text.overview.columns;
    readonly rows: readonly DatabaseRow[];
  };
  readonly noKeys?: string;
  readonly inspector?: Inspection;
}

/** The section of `INFO` each tile shows in the inspector island. */
const tileSections: Readonly<Record<OverviewTileName, string>> = {
  version: 'Server',
  mode: 'Server',
  role: 'Replication',
  uptime: 'Server',
  memory: 'Memory',
  clients: 'Clients',
  commands: 'Stats',
  hitRate: 'Stats',
  keys: 'Keyspace',
  persistence: 'Persistence',
};

const ordinary = (line: string): ToneLine => ({ text: line, tone: 'ordinary' });

function versionTile(report: InfoReport): TileContent {
  const redisVersion = infoField(report, 'redis_version') ?? text.missing;
  const name = infoField(report, 'server_name');
  const own = name === undefined ? undefined : infoField(report, `${name}_version`);
  const port = infoField(report, 'tcp_port');
  const under = [infoField(report, 'os'), port === undefined ? undefined : text.overview.port(port)];
  return {
    value: name === undefined ? redisVersion : text.overview.namedServer(name, own ?? text.missing, redisVersion),
    lines: [ordinary(under.filter((each) => each !== undefined).join(' · ') || text.missing)],
  };
}

function roleTile(report: InfoReport): TileContent {
  const role = infoField(report, 'role');
  if (role === 'slave') {
    const address = `${infoField(report, 'master_host') ?? text.missing}:${infoField(report, 'master_port') ?? text.missing}`;
    const up = infoField(report, 'master_link_status') === 'up';
    return {
      value: text.overview.replicaOf(address),
      lines: [{ text: up ? text.overview.linkUp : text.overview.linkDown, tone: up ? 'ordinary' : 'error' }],
    };
  }
  const replicas = infoNumber(report, 'connected_slaves');
  return {
    value: role === undefined ? text.missing : role === 'master' ? text.overview.master : role,
    lines: replicas === undefined ? [] : [ordinary(text.overview.replicas(replicas))],
  };
}

function memoryTile(report: InfoReport): TileContent {
  const used = infoNumber(report, 'used_memory');
  const limit = infoNumber(report, 'maxmemory');
  const share = used === undefined || limit === undefined ? undefined : memoryShare(used, limit);
  const usedText = sizeOrMissing(used);
  const value =
    limit === undefined || limit === 0
      ? text.overview.noLimit(usedText)
      : text.overview.memoryOf(usedText, sizeText(limit), share ?? 0);
  const under = [
    text.overview.peak(sizeOrMissing(infoNumber(report, 'used_memory_peak'))),
    infoField(report, 'maxmemory_policy') ?? text.missing,
  ];
  const tooltip = bytesTooltip(used);
  return {
    value,
    ...(tooltip === undefined ? {} : { tooltip }),
    lines: [ordinary(under.join(' · '))],
    ...(share === undefined ? {} : { bar: { percent: share, tone: shareTone(share) } }),
  };
}

function clientsTile(report: InfoReport): TileContent {
  const refused = infoNumber(report, 'rejected_connections') ?? 0;
  return {
    value: text.overview.connected(countText(infoNumber(report, 'connected_clients'))),
    lines: [
      ordinary(
        text.overview.blocked(
          countText(infoNumber(report, 'blocked_clients')),
          countText(infoNumber(report, 'maxclients')),
        ),
      ),
      ...(refused > 0 ? [{ text: text.overview.refused(refused), tone: 'warning' as const }] : []),
    ],
  };
}

function rateText(kilobytes: number | undefined): string {
  return kilobytes === undefined ? text.missing : sizeText(kilobytes * 1024);
}

function commandsTile(report: InfoReport): TileContent {
  const traffic = text.overview.traffic(
    rateText(infoNumber(report, 'instantaneous_input_kbps')),
    rateText(infoNumber(report, 'instantaneous_output_kbps')),
  );
  return { value: countText(infoNumber(report, 'instantaneous_ops_per_sec')), lines: [ordinary(traffic)] };
}

function hitRateTile(report: InfoReport): TileContent {
  const hits = infoNumber(report, 'keyspace_hits');
  const misses = infoNumber(report, 'keyspace_misses');
  return {
    value: hitRateText(hits, misses),
    lines: [ordinary(text.overview.hits(countText(hits), countText(misses)))],
  };
}

function keysTile(report: InfoReport): TileContent {
  const databases = databasesWithKeys(report);
  const total = databases.reduce((sum, database) => sum + (database.keys ?? 0), 0);
  const expired = countText(infoNumber(report, 'expired_keys'));
  return {
    value: databases.length === 0 ? text.overview.noKeys : text.overview.keys(countText(total), databases.length),
    lines: [ordinary(text.overview.expired(expired, countText(infoNumber(report, 'evicted_keys'))))],
  };
}

function aofLines(report: InfoReport): readonly ToneLine[] {
  const enabled = infoField(report, 'aof_enabled');
  if (enabled !== '1') {
    return enabled === '0' ? [ordinary(text.overview.aofOff)] : [];
  }
  const failed = (field: string): boolean => (infoField(report, field) ?? 'ok') !== 'ok';
  return [
    ordinary(text.overview.aofOn),
    ...(infoField(report, 'aof_rewrite_in_progress') === '1' ? [ordinary(text.overview.rewriting)] : []),
    ...(failed('aof_last_bgrewrite_status') ? [{ text: text.overview.rewriteFailed, tone: 'error' as const }] : []),
    ...(failed('aof_last_write_status') ? [{ text: text.overview.writeFailed, tone: 'error' as const }] : []),
  ];
}

function persistenceTile(report: InfoReport, now: number): TileContent {
  const savedAt = infoNumber(report, 'rdb_last_save_time');
  const ago = savedAt === undefined ? text.missing : timeText(now / 1000 - savedAt);
  const snapshotStatus = infoField(report, 'rdb_last_bgsave_status');
  const lines: ToneLine[] = [
    ...(infoField(report, 'loading') === '1' ? [{ text: text.overview.loading, tone: 'warning' as const }] : []),
    ...(infoField(report, 'rdb_bgsave_in_progress') === '1' ? [ordinary(text.overview.saving)] : []),
    ...(snapshotStatus !== undefined && snapshotStatus !== 'ok'
      ? [{ text: text.overview.snapshotFailed, tone: 'error' as const }]
      : []),
    ordinary(text.overview.lastSnapshot(ago, countText(infoNumber(report, 'rdb_changes_since_last_save')))),
    ...aofLines(report),
  ];
  return { value: '', lines };
}

/** The tiles, in their order, from `INFO`. */
export function overviewTiles(report: InfoReport, now: number): readonly Omit<OverviewTile, 'selected'>[] {
  const contents: readonly (readonly [OverviewTileName, TileContent])[] = [
    ['version', versionTile(report)],
    ['mode', { value: infoField(report, 'redis_mode') ?? text.missing, lines: [] }],
    ['role', roleTile(report)],
    ['uptime', { value: timeOrMissing(infoNumber(report, 'uptime_in_seconds')), lines: [] }],
    ['memory', memoryTile(report)],
    ['clients', clientsTile(report)],
    ['commands', commandsTile(report)],
    ['hitRate', hitRateTile(report)],
    ['keys', keysTile(report)],
    ['persistence', persistenceTile(report, now)],
  ];
  return contents.map(([name, content]) => ({ name, label: text.overview.tiles[name], ...content }));
}

/** The databases that have keys. */
export function databasesWithKeys(report: InfoReport): readonly KeyspaceDatabase[] {
  return report.databases.filter((database) => (database.keys ?? 0) > 0);
}

function databaseRow(connection: ConnectionId, database: KeyspaceDatabase, selected?: number): DatabaseRow {
  const ttl = database.averageTtlMs;
  return {
    database: database.database,
    name: database.name,
    keys: countText(database.keys),
    expires: countText(database.expires),
    averageTtl: ttl === undefined || ttl === 0 ? text.missing : timeText(ttl / 1000),
    selected: database.database === selected,
    open: startControl(text.overview.openKeys, undefined, 'key.show', {
      target: { kind: 'redis-database', connection, database: database.database },
    }),
  };
}

/** Feature: server.overview — what the Overview section shows. */
export function view(state: OverviewState): OverviewView {
  const error = sentenceOf(state.info);
  const report = valueOf(state.info);
  const errorPart = error === undefined ? {} : { error };
  if (report === undefined) {
    return { ...errorPart, tiles: [] };
  }
  const databases = databasesWithKeys(report);
  const selected = state.selected;
  return {
    ...errorPart,
    tiles: overviewTiles(report, state.now).map((tile) => ({ ...tile, selected: tile.name === selected })),
    ...(databases.length === 0
      ? { noKeys: text.overview.noKeys }
      : {
          databases: {
            title: text.overview.databases,
            columns: text.overview.columns,
            rows: databases.map((database) => databaseRow(state.connection, database, state.selectedDatabase)),
          },
        }),
    ...inspection(report, state),
  };
}

/** What the inspector island shows: the fields of the section of the tile selected, or the pairs of a database. */
function inspection(report: InfoReport, state: OverviewState): { inspector?: Inspection } {
  const selected = state.selected;
  if (selected !== undefined) {
    return {
      inspector: { title: text.overview.tiles[selected], fields: sectionFields(report, tileSections[selected]) },
    };
  }
  const database = report.databases.find((each) => each.database === state.selectedDatabase);
  return database === undefined ? {} : { inspector: { title: database.name, fields: database.pairs } };
}
