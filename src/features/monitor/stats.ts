/**
 * Feature: monitor.stats
 *
 * The Stats section: the server at a glance in tiles (with the lines of `monitor.rates`), then the size of each
 * database and, for the chosen one, of each collection. Each of the three parts has its own error line. Ported from
 * Mongoster's `src/webview/monitor.ts › renderServer`, `renderDatabases`, `renderCollections`, `sortableTable`; the
 * lines drawn in the tiles are new in Datardo.
 */
import { valueOfPart, type PartRead } from './parts/failure';
import { sortedBy, tile, type TableSort, type Tile } from './parts/tiles';
import { countText, rateText, sizeText, spanText } from './parts/units';
import { linePoints, type RatesResult } from './rates';
import type { CollectionStats } from './read-collection-stats';
import type { DatabaseStats } from './read-database-stats';
import { operationCounters, type ServerStatus } from './read-server-status';
import { text } from './text';

/** The columns of **Databases**. */
export type DatabaseColumn = keyof typeof text.statistics.databases.columns;

/** The columns of **Collections of …**. */
export type CollectionColumn = keyof typeof text.statistics.collections.columns;

/** What the section is drawn from. */
export interface StatsState {
  readonly server?: PartRead<ServerStatus>;
  /** What `monitor.rates` gave at the last read of the server. */
  readonly rates?: RatesResult;
  readonly databases?: PartRead<readonly DatabaseStats[]>;
  readonly databaseSort?: TableSort<DatabaseColumn>;
  readonly chosenDatabase?: string;
  readonly collections?: PartRead<readonly CollectionStats[]>;
  readonly collectionSort?: TableSort<CollectionColumn>;
}

/** A column of a table, with whether it is the one sorted by. */
export interface StatsColumn<Column extends string> {
  readonly column: Column;
  readonly label: string;
  readonly sorted?: 'ascending' | 'descending';
}

/** A row of a table: its name, its cells in the order of the columns, and the server's message as tooltip. */
export interface StatsRow {
  readonly name: string;
  readonly cells: readonly string[];
  readonly tooltip?: string;
  readonly chosen?: boolean;
}

/** A table of the section, or its error line. */
export interface StatsTable<Column extends string> {
  readonly title: string;
  readonly columns: readonly StatsColumn<Column>[];
  readonly rows: readonly StatsRow[];
  readonly error?: string;
}

/** What the section shows. */
export interface StatsView {
  readonly tiles: readonly Tile[];
  readonly serverError?: string;
  readonly databases: StatsTable<DatabaseColumn>;
  readonly collections?: StatsTable<CollectionColumn>;
}

const words = text.statistics;

function withPoints(shown: Tile, points: readonly number[] | undefined): Tile {
  const line = linePoints(points ?? []);
  return line.length === 0 ? shown : { ...shown, points: line };
}

function operationsTile(server: ServerStatus, result: RatesResult | undefined): Tile {
  const rates = result?.rates;
  if (rates === undefined) {
    const total = operationCounters.reduce((sum, name) => sum + server.counters[name], 0);
    return tile(words.tiles.operations, countText(total), words.tiles.sinceStart);
  }
  const line = operationCounters.map((name) => `${name} ${rateText(rates.counters[name])}`).join(' · ');
  return withPoints(tile(words.tiles.operationsPerSecond, rateText(rates.total), line), result?.history.operations);
}

function networkTile(result: RatesResult | undefined): readonly Tile[] {
  const rates = result?.rates;
  if (rates?.bytesIn === undefined || rates.bytesOut === undefined) {
    return [];
  }
  const shown = tile(
    words.tiles.network,
    words.tiles.bytesIn(sizeText(rates.bytesIn)),
    words.tiles.bytesOut(sizeText(rates.bytesOut)),
  );
  return [withPoints(shown, result?.history.bytesIn)];
}

/** The tiles of the server: Server, Uptime, Connections, Operations, Network (from the second read), Memory. */
export function serverTiles(server: ServerStatus, result: RatesResult | undefined): readonly Tile[] {
  const connections = server.connections;
  return [
    tile(words.tiles.server, server.version, server.host),
    tile(words.tiles.uptime, spanText(server.uptime), ''),
    withPoints(
      tile(
        words.tiles.connections,
        countText(connections.current),
        words.tiles.connectionsLine(countText(connections.available), countText(connections.totalCreated)),
      ),
      result?.history.connections,
    ),
    operationsTile(server, result),
    ...networkTile(result),
    ...(server.memory === undefined
      ? []
      : [
          tile(
            words.tiles.memory,
            words.tiles.megabytes(countText(server.memory.resident)),
            words.tiles.virtual(countText(server.memory.virtual)),
          ),
        ]),
  ];
}

function columnsOf<Column extends string>(
  labels: Readonly<Record<Column, string>>,
  sort: TableSort<Column> | undefined,
): readonly StatsColumn<Column>[] {
  return (Object.keys(labels) as Column[]).map((column) => ({
    column,
    label: labels[column],
    ...(sort?.column === column ? { sorted: sort.descending ? ('descending' as const) : ('ascending' as const) } : {}),
  }));
}

function databaseValue(row: DatabaseStats, column: DatabaseColumn): number | string | undefined {
  const numbers = row.numbers;
  switch (column) {
    case 'name':
      return row.name;
    case 'collections':
      return numbers?.collections;
    case 'views':
      return numbers?.views;
    case 'documents':
      return numbers?.objects;
    case 'data':
      return numbers?.dataSize;
    case 'storage':
      return numbers?.storageSize;
    case 'indexes':
      return numbers?.indexes;
    case 'indexSize':
      return numbers?.indexSize;
  }
}

function databaseRow(row: DatabaseStats, chosen: string | undefined): StatsRow {
  const numbers = row.numbers;
  const base = { name: row.name, ...(row.name === chosen ? { chosen: true } : {}) };
  if (numbers === undefined) {
    return { ...base, cells: [row.name], ...(row.failure === undefined ? {} : { tooltip: row.failure.message }) };
  }
  return {
    ...base,
    cells: [
      row.name,
      countText(numbers.collections),
      countText(numbers.views),
      countText(numbers.objects),
      sizeText(numbers.dataSize),
      sizeText(numbers.storageSize),
      countText(numbers.indexes),
      sizeText(numbers.indexSize),
    ],
  };
}

function databasesTable(state: StatsState): StatsTable<DatabaseColumn> {
  const sort = state.databaseSort;
  const read = valueOfPart(state.databases) ?? [];
  const rows = sort === undefined ? read : sortedBy(read, (row) => databaseValue(row, sort.column), sort.descending);
  return {
    title: words.databases.title,
    columns: columnsOf(words.databases.columns, sort),
    rows: rows.map((row) => databaseRow(row, state.chosenDatabase)),
    ...(state.databases?.kind === 'failed' ? { error: state.databases.failure.message } : {}),
  };
}

function collectionValue(row: CollectionStats, column: CollectionColumn): number | string | undefined {
  const numbers = row.numbers;
  switch (column) {
    case 'name':
      return row.name;
    case 'type':
      return row.type;
    case 'documents':
      return numbers?.count;
    case 'averageSize':
      return numbers?.avgObjSize;
    case 'data':
      return numbers?.size;
    case 'storage':
      return numbers?.storageSize;
    case 'indexes':
      return numbers?.nindexes;
    case 'indexSize':
      return numbers?.totalIndexSize;
  }
}

function collectionRow(row: CollectionStats): StatsRow {
  const numbers = row.numbers;
  const cells =
    numbers === undefined
      ? [row.name, row.type, '', '', '', '', '', '']
      : [
          row.name,
          row.type,
          countText(numbers.count),
          sizeText(numbers.avgObjSize),
          sizeText(numbers.size),
          sizeText(numbers.storageSize),
          countText(numbers.nindexes),
          sizeText(numbers.totalIndexSize),
        ];
  return { name: row.name, cells, ...(row.failure === undefined ? {} : { tooltip: row.failure.message }) };
}

function collectionsTable(state: StatsState, database: string): StatsTable<CollectionColumn> {
  const sort = state.collectionSort;
  const read = valueOfPart(state.collections) ?? [];
  const rows = sort === undefined ? read : sortedBy(read, (row) => collectionValue(row, sort.column), sort.descending);
  return {
    title: words.collections.title(database),
    columns: columnsOf(words.collections.columns, sort),
    rows: rows.map(collectionRow),
    ...(state.collections?.kind === 'failed' ? { error: state.collections.failure.message } : {}),
  };
}

/** Whether a column of a table holds names, which a first click sorts from A. */
export function isNameColumn(column: DatabaseColumn | CollectionColumn): boolean {
  return column === 'name' || column === 'type';
}

/** Feature: monitor.stats — the tiles, the databases and the collections of the chosen database. */
export function view(state: StatsState): StatsView {
  const server = valueOfPart(state.server);
  return {
    tiles: server === undefined ? [] : serverTiles(server, state.rates),
    ...(state.server?.kind === 'failed' ? { serverError: state.server.failure.message } : {}),
    databases: databasesTable(state),
    ...(state.chosenDatabase === undefined ? {} : { collections: collectionsTable(state, state.chosenDatabase) }),
  };
}
