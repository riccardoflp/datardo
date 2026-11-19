/**
 * Feature: server.memory
 *
 * The Memory section of the Server page: how much memory the server uses and for what (`MEMORY STATS`), what the
 * server advises (`MEMORY DOCTOR`, as it wrote it), and the largest keys of a database (`server.largest-keys`), found
 * only with its own button. Sizes, counts and percentages are written as in the Overview section.
 */
import { largestKeysView, type LargestKeysState, type LargestKeysView } from './largest-keys';
import { statNumber, tablesBytes, type MemoryStats } from './read-memory';
import { text } from './text';
import {
  bytesTooltip,
  countText,
  sentenceOf,
  sizeOrMissing,
  sizeText,
  valueOf,
  type Inspection,
  type PartRead,
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
