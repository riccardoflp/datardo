/**
 * `monitor.stats`: the Stats section of a Monitor page tab, drawn from its View: the tiles of the server with their
 * lines, **Databases**, and **Collections of …** for the database a click chose, each part with its own error line.
 * A click on a header sorts its table (numbers the largest first, names from A), a second click reverses; a click on
 * a database reads its collections.
 */
import { nextSort, type TableSort } from '../../../features/monitor/parts/tiles';
import {
  isNameColumn,
  view,
  type CollectionColumn,
  type DatabaseColumn,
  type StatsColumn,
  type StatsTable,
} from '../../../features/monitor/stats';
import { text } from '../../../features/monitor/text';
import { ServerGrid, type GridColumn } from '../server/server-grid';
import { ErrorLine } from '../server/server-parts';
import { changeChoices, select } from './monitor-changes';
import { readPartOf } from './monitor-reads';
import { statsState } from './monitor-state';
import type { MonitorTab } from './monitor-store';
import { SectionTiles } from './monitor-tiles';
import styles from '../server/server-page.module.css';
import own from './monitor-page.module.css';

/** The widths of the eight columns of both tables. */
const template = 'minmax(10em, 2fr) 7em 7em 9em 7em 7em 6em 7em';

function columnsOf<Column extends DatabaseColumn | CollectionColumn>(
  columns: readonly StatsColumn<Column>[],
  sort: TableSort<Column> | undefined,
  onSort: (next: TableSort<Column>) => void,
): readonly GridColumn[] {
  return columns.map((column) => ({
    label: column.label,
    sorted: column.sorted,
    onSort: () => {
      onSort(nextSort(sort, column.column, isNameColumn));
    },
  }));
}

function Table<Column extends DatabaseColumn | CollectionColumn>(props: {
  readonly table: StatsTable<Column>;
  readonly sort: TableSort<Column> | undefined;
  readonly onSort: (next: TableSort<Column>) => void;
  readonly selected: string | undefined;
  readonly onSelect: (name: string | undefined) => void;
}): React.JSX.Element {
  const { table } = props;
  return (
    <section className={styles['part']} aria-label={table.title}>
      <h3 className={styles['title']}>{table.title}</h3>
      <ErrorLine text={table.error} />
      <ServerGrid
        label={table.title}
        columns={columnsOf(table.columns, props.sort, props.onSort)}
        template={template}
        rows={table.rows.map((row) => ({
          id: row.name,
          selected: row.name === props.selected,
          cells: row.cells.map((cell) => ({
            text: cell,
            ...(row.tooltip === undefined ? {} : { title: row.tooltip }),
          })),
        }))}
        onSelect={props.onSelect}
      />
    </section>
  );
}

/** The Stats section. */
export function StatsSection(props: { readonly tabId: string; readonly tab: MonitorTab }): React.JSX.Element {
  const { tabId, tab } = props;
  const shown = view(statsState(tab));
  const collections = shown.collections;
  return (
    <section className={`${styles['section'] ?? ''} ${own['parts'] ?? ''}`}>
      <ErrorLine text={shown.serverError} />
      <SectionTiles label={text.sections.stats} tiles={shown.tiles} />
      <Table
        table={shown.databases}
        sort={tab.choices.databaseSort}
        onSort={(databaseSort) => {
          changeChoices(tabId, (choices) => ({ ...choices, databaseSort }));
        }}
        selected={tab.choices.statsDatabase}
        onSelect={(name) => {
          if (name === undefined || name === tab.choices.statsDatabase) {
            return;
          }
          changeChoices(tabId, (choices) => ({ ...choices, statsDatabase: name }));
          select(tabId, ({ statsCollection: _dropped, ...others }) => others);
          void readPartOf(tabId, 'stats', 'collection-stats');
        }}
      />
      {collections === undefined ? null : (
        <Table
          table={collections}
          sort={tab.choices.collectionSort}
          onSort={(collectionSort) => {
            changeChoices(tabId, (choices) => ({ ...choices, collectionSort }));
          }}
          selected={tab.selected.statsCollection}
          onSelect={(name) => {
            select(tabId, ({ statsCollection: _dropped, ...others }) =>
              name === undefined ? others : { ...others, statsCollection: name },
            );
          }}
        />
      )}
    </section>
  );
}
