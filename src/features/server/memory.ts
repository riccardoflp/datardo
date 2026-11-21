/**
 * Feature: server.memory
 *
 * The Memory section of the Server page: how much memory the server uses and for what (`MEMORY STATS`), what the
 * server advises (`MEMORY DOCTOR`, as it wrote it), and the largest keys of a database (`server.largest-keys`), found
 * only with its own button. Sizes, counts and percentages are written as in the Overview section.
 */
import type { ConnectionView } from '../../shared/connection';
import { databaseWithMostKeys, keyName, searchLine, type LargestKeysSearch } from './largest-keys';
import type { RankedKey } from './rank-keys';
import type { KeyspaceDatabase } from './read-info';
import { statNumber, tablesBytes, type MemoryStats } from './read-memory';
import { text } from './text';
import {
  bytesTooltip,
  connectionTarget,
  countText,
  hexOf,
  sentenceOf,
  sizeOrMissing,
  sizeText,
  startControl,
  valueOf,
  type Inspection,
  type PartRead,
  type ServerControl,
  type Tone,
  type ToneLine,
} from './types';

/** The tiles of the Memory section. */
export type MemoryTileName = 'allocated' | 'peak' | 'data' | 'overhead' | 'keys' | 'fragmentation';

/** A tile: its value, its tooltip, the line under it. */
export interface MemoryTile {
  readonly name: MemoryTileName;
  readonly label: string;
  readonly value: string;
  readonly tone: Tone;
  readonly tooltip?: string;
  readonly lines: readonly ToneLine[];
  readonly selected: boolean;
}

/** The fragmentation from which it is yellow (Datardo's choice). */
export const highFragmentation = 1.5;

function line(textOfLine: string): ToneLine {
  return { text: textOfLine, tone: 'ordinary' };
}

function percentLine(value: number | undefined, write: (percent: number) => string): readonly ToneLine[] {
  return value === undefined ? [] : [line(write(Math.round(value)))];
}

function sizeTile(
  name: MemoryTileName,
  bytes: number | undefined,
  lines: readonly ToneLine[] = [],
): Omit<MemoryTile, 'selected'> {
  const tooltip = bytesTooltip(bytes);
  return {
    name,
    label: text.memory.tiles[name],
    value: sizeOrMissing(bytes),
    tone: 'ordinary',
    ...(tooltip === undefined ? {} : { tooltip }),
    lines,
  };
}

function fragmentationTile(stats: MemoryStats): Omit<MemoryTile, 'selected'> {
  const ratio = statNumber(stats, 'fragmentation');
  const bytes = statNumber(stats, 'fragmentation.bytes');
  const under =
    bytes === undefined
      ? []
      : [line(bytes < 0 ? text.memory.less(sizeText(-bytes)) : text.memory.more(sizeText(bytes)))];
  return {
    name: 'fragmentation',
    label: text.memory.tiles.fragmentation,
    value: ratio === undefined ? text.missing : ratio.toFixed(2),
    tone: ratio !== undefined && ratio >= highFragmentation ? 'warning' : 'ordinary',
    lines: under,
  };
}

/** The tiles, in their order, from `MEMORY STATS`. */
export function memoryTiles(stats: MemoryStats): readonly Omit<MemoryTile, 'selected'>[] {
  const perKey = statNumber(stats, 'keys.bytes-per-key');
  return [
    sizeTile('allocated', statNumber(stats, 'total.allocated')),
    sizeTile(
      'peak',
      statNumber(stats, 'peak.allocated'),
      percentLine(statNumber(stats, 'peak.percentage'), text.memory.ofPeak),
    ),
    sizeTile(
      'data',
      statNumber(stats, 'dataset.bytes'),
      percentLine(statNumber(stats, 'dataset.percentage'), text.memory.ofAllocated),
    ),
    sizeTile('overhead', statNumber(stats, 'overhead.total')),
    {
      name: 'keys',
      label: text.memory.tiles.keys,
      value: countText(statNumber(stats, 'keys.count')),
      tone: 'ordinary',
      lines: perKey === undefined ? [] : [line(text.memory.each(sizeText(perKey)))],
    },
    fragmentationTile(stats),
  ];
}

/** A row of **Where the overhead goes**. */
export interface OverheadRow {
  readonly part: string;
  readonly size: string;
  readonly tooltip?: string;
}

const overheadParts: readonly (readonly [keyof typeof text.memory.parts, string])[] = [
  ['startup', 'startup.allocated'],
  ['backlog', 'replication.backlog'],
  ['replicas', 'clients.slaves'],
  ['clients', 'clients.normal'],
  ['aof', 'aof.buffer'],
  ['scripts', 'lua.caches'],
  ['functions', 'functions.caches'],
];

/** The rows of **Where the overhead goes**: each part, then the tables of each database. */
export function overheadRows(stats: MemoryStats): readonly OverheadRow[] {
  const sized = (part: string, bytes: number | undefined): OverheadRow => {
    const tooltip = bytesTooltip(bytes);
    return { part, size: sizeOrMissing(bytes), ...(tooltip === undefined ? {} : { tooltip }) };
  };
  return [
    ...overheadParts.map(([part, name]) => {
      const label = text.memory.parts[part];
      return sized(typeof label === 'string' ? label : '', statNumber(stats, name));
    }),
    ...stats.databases.map((tables) =>
      sized(text.memory.parts.tables(`db${String(tables.database)}`), tablesBytes(tables)),
    ),
  ];
}

/** What the Memory section is drawn from. */
export interface MemoryState {
  readonly stats?: PartRead<MemoryStats>;
  readonly doctor?: PartRead<string>;
  readonly selected?: MemoryTileName;
  readonly largest: LargestKeysState;
}

/** What the Memory section shows. */
export interface MemoryView {
  readonly error?: string;
  readonly tiles: readonly MemoryTile[];
  readonly overhead?: { readonly title: string; readonly rows: readonly OverheadRow[] };
  readonly advice: { readonly title: string; readonly text?: string; readonly error?: string };
  readonly largestKeys: LargestKeysView;
  readonly inspector?: Inspection;
}

function statsInspection(stats: MemoryStats, tile: MemoryTileName): Inspection {
  const written = (value: MemoryStats['values'][number][1]): string =>
    typeof value === 'number' || typeof value === 'string'
      ? String(value)
      : value.map(([name, each]) => `${name}=${written(each)}`).join(', ');
  return {
    title: text.memory.tiles[tile],
    fields: stats.values.map(([name, value]) => [name, written(value)] as const),
  };
}

/** Feature: server.memory — what the Memory section shows. */
export function view(state: MemoryState): MemoryView {
  const error = sentenceOf(state.stats);
  const stats = valueOf(state.stats);
  const selected = state.selected;
  const advice = valueOf(state.doctor);
  const adviceError = sentenceOf(state.doctor);
  return {
    ...(error === undefined ? {} : { error }),
    tiles: stats === undefined ? [] : memoryTiles(stats).map((tile) => ({ ...tile, selected: tile.name === selected })),
    ...(stats === undefined ? {} : { overhead: { title: text.memory.overheadTable, rows: overheadRows(stats) } }),
    advice: {
      title: text.memory.advice,
      ...(advice === undefined ? {} : { text: advice }),
      ...(adviceError === undefined ? {} : { error: adviceError }),
    },
    largestKeys: largestKeysView(state.largest),
    ...(stats === undefined || selected === undefined ? {} : { inspector: statsInspection(stats, selected) }),
  };
}

/** What the part of the largest keys is drawn from. */
export interface LargestKeysState {
  readonly connection: ConnectionView;
  /** The databases of `# Keyspace` of `INFO`, for the **Database** menu. */
  readonly databases: readonly KeyspaceDatabase[];
  /** The database chosen in the menu; the one with the most keys to start with. */
  readonly chosen?: number;
  readonly search?: LargestKeysSearch;
  /** The key selected, by the hexadecimal of its name. */
  readonly selected?: string;
}

/** A row of the table of the largest keys. */
export interface LargestKeyRow {
  readonly rank: number;
  readonly key: string;
  readonly type: string;
  readonly memory: string;
  readonly memoryTooltip: string;
  readonly selected: boolean;
  /** A click shows the key in the inspector island (`key.inspect`); a double click opens its key tab (`key.open`). */
  readonly click: ServerControl;
  readonly open: ServerControl;
  /** **Open key**, **Copy name**, **Delete key…**. */
  readonly menu: readonly ServerControl[];
}

/** What the part of the largest keys shows. */
export interface LargestKeysView {
  readonly title: string;
  readonly database: {
    readonly label: string;
    readonly value?: number;
    readonly choices: readonly { readonly database: number; readonly label: string }[];
  };
  readonly find: ServerControl;
  /** What the part shows until **Find largest keys** is pressed. */
  readonly before?: string;
  readonly line?: string;
  readonly more?: ServerControl;
  readonly table?: {
    readonly element: 'server.largest-keys@table';
    readonly menuElement: 'server.largest-keys@row-menu';
    readonly columns: typeof text.largestKeys.columns;
    readonly rows: readonly LargestKeyRow[];
    readonly note: string;
  };
}

function keyRow(state: LargestKeysState, search: LargestKeysSearch, key: RankedKey, index: number): LargestKeyRow {
  const hex = hexOf(key.name);
  const name = keyName(key.name);
  const target = { kind: 'key', connection: state.connection.id, database: search.database, key: key.name } as const;
  return {
    rank: index + 1,
    key: name,
    type: search.types?.[hex] ?? text.missing,
    memory: sizeText(key.bytes),
    memoryTooltip: bytesTooltip(key.bytes) ?? '',
    selected: hex === state.selected,
    click: startControl(name, 'key.inspect@table', 'key.inspect', { target }),
    open: startControl(text.largestKeys.openKey, 'key.open@table', 'key.open', { target }),
    menu: [
      startControl(text.largestKeys.openKey, 'key.open@row-menu', 'key.open', { target }),
      { kind: 'copy', label: text.largestKeys.copyName, text: name },
      startControl(text.largestKeys.deleteKey, 'key.delete@row-menu', 'key.delete', { target }),
    ],
  };
}

/** What the part of the largest keys shows, in the Memory section. */
export function largestKeysView(state: LargestKeysState): LargestKeysView {
  const chosen = state.chosen ?? databaseWithMostKeys(state.databases);
  const search = state.search;
  const args = { connection: state.connection.id, database: chosen ?? 0 };
  const target = connectionTarget(state.connection.id);
  const resumable = search?.ended === 'bound' || search?.ended === 'cancelled';
  return {
    title: text.memory.largestKeys,
    database: {
      label: text.largestKeys.database,
      ...(chosen === undefined ? {} : { value: chosen }),
      choices: state.databases.map((each) => ({
        database: each.database,
        label: text.largestKeys.databaseChoice(each.name, each.keys ?? 0),
      })),
    },
    find: startControl(text.largestKeys.find, 'server.largest-keys@toolbar', 'server.largest-keys', {
      target,
      args,
      busy: search !== undefined && search.ended === undefined,
    }),
    ...(search === undefined ? { before: text.largestKeys.before } : { line: searchLine(search) }),
    ...(resumable
      ? {
          more: startControl(text.largestKeys.more, 'server.largest-keys@toolbar', 'server.largest-keys', {
            target,
            args: { ...args, database: search.database, more: true },
          }),
        }
      : {}),
    ...(search === undefined || search.ranking.keys.length === 0
      ? {}
      : {
          table: {
            element: 'server.largest-keys@table',
            menuElement: 'server.largest-keys@row-menu',
            columns: text.largestKeys.columns,
            rows: search.ranking.keys.map((key, index) => keyRow(state, search, key, index)),
            note: text.largestKeys.estimate,
          },
        }),
  };
}
