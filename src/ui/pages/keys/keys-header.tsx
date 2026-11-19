/**
 * The header of the table of a keys tab (`key.sort`): a click on a column's name sorts ascending, descending, then in
 * scan order again; its menu (`@column-menu`) has **Sort ascending**, **Sort descending** and **Scan order**. Sorting
 * by **Expiry** or **Size** reads first what `key.details` has not read of the loaded keys, 500 commands a pipeline.
 */
import { useState } from 'react';
import { detailsToRead, headerSorts, sortAfterClick, type KeySort, type SortColumn } from '../../../features/key/sort';
import type { KeysPageView } from '../../../features/key/show';
import { text } from '../../../features/key/text';
import { readDetails } from './keys-reads';
import { changeTab, type KeysTab } from './keys-store';
import { KeysMenu, type OpenKeysMenu } from './keys-menu';
import styles from './keys-page.module.css';

/** Sorts the table, reading first the details a sort by **Expiry** or **Size** needs. */
async function sortBy(tabId: string, tab: KeysTab, page: KeysPageView, sort: KeySort): Promise<void> {
  if (sort !== undefined) {
    const rows = page.rows.map((row) => {
      const read = tab.details.get(row.id);
      return {
        name: row.name,
        gone: row.gone,
        ...(read === undefined
          ? {}
          : { expiresAt: read.expiresAt, ...(read.size === undefined ? {} : { size: read.size }) }),
      };
    });
    for (const batch of detailsToRead(rows, sort.column)) {
      await readDetails(
        tabId,
        batch.map((row) => row.name),
      );
    }
  }
  changeTab(tabId, (state) => ({ ...state, sort }));
}

/** The header row: a column header for each column, with its button and its menu. */
export function KeysHeader(props: {
  readonly tabId: string;
  readonly tab: KeysTab;
  readonly page: KeysPageView;
}): React.JSX.Element {
  const { tabId, tab, page } = props;
  const [menu, setMenu] = useState<OpenKeysMenu | undefined>(undefined);
  const sortable = (column: SortColumn): boolean => headerSorts(column, tab.scan?.rows.length ?? 0).sorts;
  const columnMenu = (column: SortColumn, x: number, y: number): OpenKeysMenu => ({
    label: text.show.columns[column],
    x,
    y,
    items: [
      {
        label: text.sort.ascending,
        element: 'key.sort@column-menu',
        choose: () => void sortBy(tabId, tab, page, { column, direction: 'ascending' }),
      },
      {
        label: text.sort.descending,
        element: 'key.sort@column-menu',
        choose: () => void sortBy(tabId, tab, page, { column, direction: 'descending' }),
      },
      {
        label: text.sort.scanOrder,
        element: 'key.sort@column-menu',
        choose: () => void sortBy(tabId, tab, page, undefined),
      },
    ],
  });
  return (
    <div role="rowgroup" className={styles['head']}>
      <div role="row" aria-rowindex={1} className={styles['head-row']}>
        {page.columns.map((column) => (
          <div
            key={column.column}
            role="columnheader"
            className={styles['heading']}
            aria-sort={column.sorted === undefined ? 'none' : column.sorted.direction}
          >
            <button
              type="button"
              className={styles['heading-button']}
              title={column.tooltip}
              aria-disabled={sortable(column.column) ? undefined : true}
              onClick={() => {
                if (sortable(column.column)) {
                  void sortBy(tabId, tab, page, sortAfterClick(tab.sort, column.column));
                }
              }}
            >
              {column.label}
            </button>
            <button
              type="button"
              className={styles['heading-menu']}
              aria-label={text.sort.menu(column.label)}
              aria-haspopup="menu"
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                setMenu(columnMenu(column.column, box.left, box.bottom));
              }}
            >
              <span className="codicon codicon-ellipsis" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <KeysMenu
        menu={menu}
        onClose={() => {
          setMenu(undefined);
        }}
      />
    </div>
  );
}
