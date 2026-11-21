/**
 * The table of the page of a bucket (`gridfs.show`), a page of at most 100 files: a click on **Name**, **Size** or
 * **Uploaded** sorts by it; a click on a row selects it and shows it in the inspector island (`gridfs.inspect`); on
 * the selected row `Enter` and a double click open it, `F2` renames it and `Delete` deletes it, the last two not on a
 * read-only connection; its context menu, its `…` button and `Shift+F10` open the menu of the row.
 */
import { nextSort, type ColumnView, type FileRow, type GridFsPageView } from '../../../features/gridfs/show';
import type { SortField } from '../../../features/gridfs/list';
import { text } from '../../../features/gridfs/text';
import { startControl } from './gridfs-actions';
import { readFiles } from './gridfs-reads';
import { changeTab, type GridFsTab } from './gridfs-store';
import styles from './gridfs-page.module.css';

/** What the table starts from its rows and its keys (`@table`), carried by the grid. */
const tableElements = ['gridfs.open@table', 'gridfs.rename@table', 'gridfs.delete@table'].join(' ');

/** What the table is drawn with. */
export interface GridFsTableProps {
  readonly tabId: string;
  readonly tab: GridFsTab;
  readonly page: GridFsPageView;
  readonly openRowMenu: (row: FileRow, x: number, y: number) => void;
}

function select(tabId: string, row: FileRow): void {
  changeTab(tabId, (state) => ({ ...state, selected: row.idText }));
}

/** Starts a feature of the row's menu from the table: `gridfs.open`, `gridfs.rename` or `gridfs.delete`. */
function startOnRow(row: FileRow, feature: string): boolean {
  const control = row.menu.find((each) => each.kind === 'start' && each.feature === feature);
  if (control === undefined) {
    return false;
  }
  startControl(control, 'table');
  return true;
}

const keyFeatures: Readonly<Record<string, string>> = {
  Enter: 'gridfs.open',
  F2: 'gridfs.rename',
  Delete: 'gridfs.delete',
};

function onTableKey(props: GridFsTableProps, event: React.KeyboardEvent<HTMLDivElement>): void {
  const rows = props.page.rows;
  const at = rows.findIndex((row) => row.idText === props.tab.selected);
  const current = rows[at];
  if (((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') && current !== undefined) {
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    props.openRowMenu(current, box.left + 28, box.top + 56);
    return;
  }
  const moved = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
  if (moved !== 0) {
    const next = rows[Math.max(0, Math.min(rows.length - 1, at + moved))];
    if (next !== undefined) {
      select(props.tabId, next);
      document.getElementById(rowId(props.tabId, next))?.scrollIntoView({ block: 'nearest' });
    }
    event.preventDefault();
    return;
  }
  const feature = keyFeatures[event.key];
  if (feature !== undefined && current !== undefined && startOnRow(current, feature)) {
    event.preventDefault();
  }
}

function rowId(tabId: string, row: FileRow): string {
  return `gridfs-${tabId}-${row.idText}`.replace(/[^\w-]/gu, '_');
}

function Heading(props: { readonly tabId: string; readonly column: ColumnView }): React.JSX.Element {
  const { column, tabId } = props;
  const sort = column.sorted === undefined ? undefined : column.sorted === 'ascending' ? 'ascending' : 'descending';
  return (
    <div role="columnheader" className={styles['heading']} aria-sort={sort ?? 'none'}>
      {column.sorts ? (
        <button
          type="button"
          className={styles['heading-button']}
          onClick={() => {
            changeTab(tabId, (state) => ({ ...state, sort: nextSort(state.sort, column.key as SortField), page: 0 }));
            void readFiles(tabId);
          }}
        >
          {column.label}
          {sort === undefined ? null : sort === 'ascending' ? ' ↑' : ' ↓'}
        </button>
      ) : (
        column.label
      )}
    </div>
  );
}

function Row(props: { readonly table: GridFsTableProps; readonly row: FileRow; readonly index: number }) {
  const { table, row, index } = props;
  return (
    <div
      role="row"
      id={rowId(table.tabId, row)}
      className={styles['row']}
      aria-rowindex={index + 2}
      aria-selected={table.tab.selected === row.idText}
      onClick={() => {
        select(table.tabId, row);
      }}
      onDoubleClick={() => {
        startOnRow(row, 'gridfs.open');
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        select(table.tabId, row);
        table.openRowMenu(row, event.clientX, event.clientY);
      }}
    >
      <div role="gridcell" className={styles['cell']} title={row.name}>
        {row.name}
      </div>
      <div role="gridcell" className={styles['cell']} title={row.sizeTooltip}>
        {row.size}
      </div>
      <div role="gridcell" className={styles['cell']} title={row.uploadedTooltip}>
        {row.uploaded}
      </div>
      <div role="gridcell" className={styles['cell']} title={row.type}>
        {row.type}
      </div>
      <div role="gridcell" className={`${styles['cell']} ${styles['code']}`} title={row.metadata}>
        {row.metadata}
      </div>
      <div role="gridcell" className={`${styles['cell']} ${styles['code']}`} title={row.idText}>
        {row.idText}
      </div>
      <div role="gridcell">
        <button
          type="button"
          className={styles['more']}
          aria-label={text.page.more(row.name)}
          aria-haspopup="menu"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            select(table.tabId, row);
            const box = event.currentTarget.getBoundingClientRect();
            table.openRowMenu(row, box.left, box.bottom);
          }}
        >
          …
        </button>
      </div>
    </div>
  );
}

/** The table, drawn from the View of the page. */
export function GridFsTable(props: GridFsTableProps): React.JSX.Element {
  const { page, tabId } = props;
  return (
    <div
      role="grid"
      aria-label={text.page.table}
      aria-rowcount={page.rows.length + 1}
      aria-busy={page.dimmed ? true : undefined}
      tabIndex={0}
      className={styles['grid']}
      data-dimmed={page.dimmed ? 'true' : undefined}
      data-feature="gridfs.inspect@table"
      data-key-features={tableElements}
      onKeyDown={(event) => {
        onTableKey(props, event);
      }}
    >
      <div role="rowgroup" className={styles['head']}>
        <div role="row" className={styles['head-row']} aria-rowindex={1}>
          {page.columns.map((column) => (
            <Heading key={column.key} tabId={tabId} column={column} />
          ))}
          <div role="columnheader" className={styles['heading']} aria-label={text.page.columns.menu} />
        </div>
      </div>
      <div role="rowgroup" className={styles['body']}>
        {page.rows.map((row, index) => (
          <Row key={row.idText} table={props} row={row} index={index} />
        ))}
      </div>
    </div>
  );
}
