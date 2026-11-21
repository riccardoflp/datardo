/**
 * A table of the Indexes section, for the indexes and for the search indexes: a click selects a row and shows it in
 * the inspector island; the arrows move the selection, `Esc` clears it, `Enter` edits the row and `Delete` drops it
 * (`@table`), and the context menu, `Shift+F10` and the row's `…` button open its menu (`@row-menu`). A collection has
 * at most 64 indexes: every row is drawn.
 */
import type { ReactNode } from 'react';
import type { RowAction } from '../../../features/index/show';
import { text } from '../../../features/index/text';
import styles from './index.module.css';

/** A column header; one that sorts says how, and what a click does. */
export interface GridHeader {
  readonly label: string;
  readonly sorted?: 'ascending' | 'descending' | 'none' | undefined;
  readonly onSort?: () => void;
}

/** A row, by its name. */
export interface GridRow {
  readonly name: string;
  readonly cells: readonly ReactNode[];
  readonly selected: boolean;
  readonly dimmed?: boolean;
  readonly menu: readonly RowAction[];
  /** What `Enter` and `Delete` start on the selected row (`index.edit@table`, `index.drop@table`). */
  readonly enter?: string;
  readonly delete?: string;
}

/** What a table is drawn with. */
export interface IndexGridProps {
  readonly label: string;
  readonly headers: readonly GridHeader[];
  readonly rows: readonly GridRow[];
  readonly onSelect: (name: string | undefined) => void;
  readonly onAction: (name: string, element: string) => void;
  readonly onMenu: (name: string, x: number, y: number) => void;
}

function moveSelection(props: IndexGridProps, current: number, by: number): void {
  const next = props.rows[Math.max(0, Math.min(props.rows.length - 1, current + by))];
  if (next !== undefined) {
    props.onSelect(next.name);
  }
}

function onGridKey(props: IndexGridProps, event: React.KeyboardEvent<HTMLTableElement>): void {
  const current = props.rows.findIndex((row) => row.selected);
  const row = props.rows[current];
  if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
    if (row !== undefined && row.menu.length > 0) {
      const box = event.currentTarget.getBoundingClientRect();
      props.onMenu(row.name, box.left + 32, box.top + 32);
    }
  } else if (event.key === 'Enter' && row?.enter !== undefined) {
    props.onAction(row.name, row.enter);
  } else if (event.key === 'Delete' && row?.delete !== undefined) {
    props.onAction(row.name, row.delete);
  } else if (event.key === 'Escape' && row !== undefined) {
    props.onSelect(undefined);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    moveSelection(props, current, event.key === 'ArrowDown' ? 1 : -1);
  } else {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function Row({ props, row }: { readonly props: IndexGridProps; readonly row: GridRow }): React.JSX.Element {
  return (
    <tr
      aria-selected={row.selected}
      className={styles['row']}
      data-dimmed={row.dimmed === true}
      data-name={row.name}
      onClick={() => {
        props.onSelect(row.name);
      }}
      onDoubleClick={() => {
        if (row.enter !== undefined) {
          props.onAction(row.name, row.enter);
        }
      }}
      onContextMenu={(event) => {
        if (row.menu.length > 0) {
          event.preventDefault();
          props.onSelect(row.name);
          props.onMenu(row.name, event.clientX, event.clientY);
        }
      }}
    >
      {row.cells.map((cell, index) => (
        <td key={index} className={styles['cell']}>
          {cell}
        </td>
      ))}
      <td className={styles['cell']}>
        {row.menu.length === 0 ? null : (
          <button
            type="button"
            className={styles['row-button']}
            aria-label={text.show.actions(row.name)}
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              const box = event.currentTarget.getBoundingClientRect();
              props.onSelect(row.name);
              props.onMenu(row.name, box.left, box.bottom);
            }}
          >
            …
          </button>
        )}
      </td>
    </tr>
  );
}

/** The table. */
export function IndexGrid(props: IndexGridProps): React.JSX.Element {
  return (
    <table
      role="grid"
      data-feature="index.inspect@table"
      aria-label={props.label}
      tabIndex={0}
      className={styles['grid']}
      onKeyDown={(event) => {
        onGridKey(props, event);
      }}
    >
      <thead>
        <tr>
          {props.headers.map((header) => (
            <th key={header.label} className={styles['heading-cell']} aria-sort={header.sorted}>
              {header.onSort === undefined ? (
                header.label
              ) : (
                <button type="button" className={styles['sort']} onClick={header.onSort}>
                  {header.label}
                  {header.sorted === 'ascending' ? ' ↑' : header.sorted === 'descending' ? ' ↓' : ''}
                </button>
              )}
            </th>
          ))}
          <th className={styles['heading-cell']}>
            <span className={styles['hidden-label']}>{text.show.actionsColumn}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <Row key={row.name} props={props} row={row} />
        ))}
      </tbody>
    </table>
  );
}
