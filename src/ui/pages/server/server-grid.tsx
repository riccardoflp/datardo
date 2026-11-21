/**
 * A table of the Server page (the clients, the slow log, the configuration, the databases, the replicas, the largest
 * keys): only the rows on screen are drawn, so that 10,000 clients scroll as 10. A click selects a row and shows it in
 * the inspector island; the arrows move the selection, `Esc` clears it, `Enter` and a double click open the row when
 * it opens something, and the context menu, `Shift+F10` and the row's `…` button open its menu (`@row-menu`).
 */
import { useRef, useState } from 'react';
import type { SortDirection } from '../../../features/server/clients';
import type { Tone } from '../../../features/server/types';
import styles from './server-page.module.css';

/** The height of a row, in px. */
export const rowHeight = 28;

/** A column header; one that sorts says how. */
export interface GridColumn {
  readonly label: string;
  readonly sorted?: SortDirection | undefined;
  readonly onSort?: () => void;
}

/** A cell: its text, its tooltip, its color, and the marks after its text (**Datardo**, **this page**). */
export interface GridCell {
  readonly text: string;
  readonly title?: string | undefined;
  readonly tone?: Tone | 'dim' | undefined;
  readonly marks?: readonly string[];
}

/** A row, by what names it. */
export interface GridRow {
  readonly id: string;
  readonly cells: readonly GridCell[];
  readonly selected: boolean;
}

/** What a table is drawn with. */
export interface ServerGridProps {
  readonly label: string;
  /** The identifiers of what the table starts, carried by the grid (`server.largest-keys@table`). */
  readonly element?: string;
  readonly columns: readonly GridColumn[];
  /** The widths of the columns, as CSS writes them. */
  readonly template: string;
  readonly rows: readonly GridRow[];
  /** Whether the table takes the rest of the height of its section; otherwise it shows up to 10 rows. */
  readonly fill?: boolean;
  readonly onSelect: (id: string | undefined) => void;
  readonly onOpen?: (id: string) => void;
  readonly onMenu?: (id: string, x: number, y: number) => void;
  /** The name of the `…` button of each row, when its rows have one. */
  readonly menuButton?: string;
}

function onGridKey(props: ServerGridProps, event: React.KeyboardEvent<HTMLDivElement>, current: number): void {
  const row = props.rows[current];
  if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
    if (row !== undefined && props.onMenu !== undefined) {
      const box = event.currentTarget.getBoundingClientRect();
      props.onMenu(row.id, box.left + rowHeight, box.top + rowHeight * 2);
    }
  } else if (event.key === 'Enter' && row !== undefined && props.onOpen !== undefined) {
    props.onOpen(row.id);
  } else if (event.key === 'Escape') {
    props.onSelect(undefined);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const moved = event.key === 'ArrowDown' ? 1 : -1;
    const next = props.rows[Math.max(0, Math.min(props.rows.length - 1, current + moved))];
    if (next !== undefined) {
      props.onSelect(next.id);
      const scroller = event.currentTarget;
      const at = (current + moved + 1) * rowHeight;
      if (at < scroller.scrollTop + rowHeight || at > scroller.scrollTop + scroller.clientHeight - rowHeight) {
        scroller.scrollTop = Math.max(0, at - scroller.clientHeight / 2);
      }
    }
  } else {
    return;
  }
  event.preventDefault();
}

function Header(props: { readonly grid: ServerGridProps }): React.JSX.Element {
  return (
    <div role="rowgroup" className={styles['head']}>
      <div
        role="row"
        aria-rowindex={1}
        className={styles['head-row']}
        style={{ gridTemplateColumns: props.grid.template }}
      >
        {props.grid.columns.map((column) => (
          <div
            key={column.label}
            role="columnheader"
            className={styles['heading']}
            aria-sort={column.sorted ?? (column.onSort === undefined ? undefined : 'none')}
          >
            {column.onSort === undefined ? (
              <span className={styles['heading-text']}>{column.label}</span>
            ) : (
              <button type="button" className={styles['heading-button']} onClick={column.onSort}>
                {column.label}
                {column.sorted === undefined ? null : column.sorted === 'ascending' ? ' ↑' : ' ↓'}
              </button>
            )}
          </div>
        ))}
        {props.grid.menuButton === undefined ? null : <div role="columnheader" className={styles['heading']} />}
      </div>
    </div>
  );
}

function Row(props: { readonly grid: ServerGridProps; readonly row: GridRow; readonly index: number }) {
  const { grid, row, index } = props;
  return (
    <div
      role="row"
      className={styles['row']}
      aria-rowindex={index + 2}
      aria-selected={row.selected}
      style={{ top: index * rowHeight, height: rowHeight, gridTemplateColumns: grid.template }}
      onClick={() => {
        grid.onSelect(row.id);
      }}
      onDoubleClick={() => grid.onOpen?.(row.id)}
      onContextMenu={(event) => {
        if (grid.onMenu !== undefined) {
          event.preventDefault();
          grid.onSelect(row.id);
          grid.onMenu(row.id, event.clientX, event.clientY);
        }
      }}
    >
      {row.cells.map((cell, column) => (
        <div
          key={column}
          role="gridcell"
          className={styles['cell']}
          title={cell.title ?? cell.text}
          data-tone={cell.tone}
        >
          {cell.text}
          {(cell.marks ?? []).map((mark) => (
            <span key={mark} className={styles['mark']}>
              {mark}
            </span>
          ))}
        </div>
      ))}
      {grid.menuButton === undefined ? null : (
        <div role="gridcell" className={styles['cell']}>
          <button
            type="button"
            className={styles['row-button']}
            aria-label={`${grid.menuButton} ${row.cells[0]?.text ?? ''}`}
            onClick={(event) => {
              event.stopPropagation();
              const box = event.currentTarget.getBoundingClientRect();
              grid.onSelect(row.id);
              grid.onMenu?.(row.id, box.left, box.bottom);
            }}
          >
            …
          </button>
        </div>
      )}
    </div>
  );
}

/** The table, drawing the rows that fit in the part scrolled into view. */
export function ServerGrid(props: ServerGridProps): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ first: 0, count: 40 });
  const rows = props.rows;
  const current = rows.findIndex((row) => row.selected);
  const height = props.fill === true ? undefined : (Math.min(rows.length, 10) + 1) * rowHeight + 2;
  return (
    <div
      ref={scroller}
      role="grid"
      aria-label={props.label}
      aria-rowcount={rows.length + 1}
      tabIndex={0}
      className={props.fill === true ? `${styles['grid']} ${styles['fill']}` : styles['grid']}
      style={height === undefined ? undefined : { height }}
      {...(props.element === undefined ? {} : { 'data-feature': props.element })}
      onScroll={() => {
        const element = scroller.current;
        if (element !== null) {
          const first = Math.max(0, Math.floor(element.scrollTop / rowHeight) - 1);
          setRange({ first, count: Math.ceil(element.clientHeight / rowHeight) + 3 });
        }
      }}
      onKeyDown={(event) => {
        onGridKey(props, event, current);
      }}
    >
      <Header grid={props} />
      <div role="rowgroup" className={styles['body']} style={{ height: rows.length * rowHeight }}>
        {rows.slice(range.first, range.first + range.count).map((row, offset) => (
          <Row key={row.id} grid={props} row={row} index={range.first + offset} />
        ))}
      </div>
    </div>
  );
}
