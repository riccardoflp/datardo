/**
 * The header rows of the grid: `#`, then one heading per column with its sort mark (`table.sort`), its `▸`
 * (`table.expand`) and its edge that resizes (`table.arrange-columns`); above the columns of an expanded field, its
 * group heading, which collapses it (`table.collapse`). A heading is dragged onto the bar (`query.drag`) or onto
 * another heading to move its column. The header rows stay in place while the rows scroll.
 */
import { text as tableText } from '../../features/table/text';
import type { ColumnNode } from '../../features/table/types';
import { isBuilt } from '../query/built';
import { readDragged, startDrag } from '../query/drag-data';
import { positionKey, subRowHeight, withinOf, type HeaderCell } from './grid-model';
import type { GridView, Resizing } from './grid-view';
import { openTableMenu } from './menu-request';
import { ResizeEdge } from './resize-edge';
import { arrangeColumns, collapseColumn, expandColumn, selectCell, sortByHeader } from './table-actions';
import styles from './table.module.css';

/** What the header needs besides the grid: the documents for `Alt` with `▸`, and a width being dragged. */
export interface HeaderProps {
  readonly grid: GridView;
  readonly documents: readonly import('../../features/table/types').Document[];
  readonly onResizing: (resizing: Resizing | undefined) => void;
}

function nameOf(node: ColumnNode): string {
  return node.path[node.path.length - 1] ?? node.key;
}

function stickyStyle(grid: GridView, cell: HeaderCell, row: number): React.CSSProperties {
  const left = grid.lefts[cell.column - 1];
  return { top: row * subRowHeight, ...(left === undefined ? {} : { left, zIndex: 'var(--z-sticky-pinned-heading)' }) };
}

function dropped(grid: GridView, cell: HeaderCell, event: React.DragEvent<HTMLElement>): void {
  const dragged = readDragged(event.dataTransfer);
  if (dragged?.kind !== 'header' || dragged.field === cell.node.key) {
    return;
  }
  event.preventDefault();
  const box = event.currentTarget.getBoundingClientRect();
  const after = event.clientX > box.left + box.width / 2;
  arrangeColumns(grid.ref, { kind: 'move', source: dragged.field, target: cell.node.key, after }, grid.columns);
}

function ExpandButton({
  grid,
  node,
  documents,
}: { readonly grid: GridView; readonly node: ColumnNode } & Pick<HeaderProps, 'documents'>) {
  const tip = node.array ? tableText.expand.arrayTip(node.key) : tableText.expand.tip(node.key);
  return (
    <button
      type="button"
      tabIndex={-1}
      className={styles['expand']}
      data-feature="table.expand@table"
      aria-label={tableText.expand.entry(node.key)}
      title={tip}
      onClick={(event) => {
        event.stopPropagation();
        expandColumn(grid.ref, node, grid.columns.expanded, { allLevels: event.altKey, documents });
      }}
    >
      ▸
    </button>
  );
}

function sortMark(grid: GridView, key: string): { readonly mark: string; readonly sort?: 'ascending' | 'descending' } {
  const direction = grid.directions.get(key);
  if (direction === undefined) {
    return { mark: '' };
  }
  return direction === 1 ? { mark: ' ▲', sort: 'ascending' } : { mark: ' ▼', sort: 'descending' };
}

function pressed(grid: GridView, cell: HeaderCell): void {
  if (cell.group) {
    if (isBuilt('table.collapse@table')) {
      collapseColumn(grid.ref, cell.node.key, grid.columns.expanded);
    }
    return;
  }
  sortByHeader(grid.ref, cell.node.key);
}

function Heading({
  grid,
  cell,
  row,
  documents,
  onResizing,
}: HeaderProps & { readonly cell: HeaderCell; readonly row: number }) {
  const { node } = cell;
  const focused = !cell.group && grid.cell.at === 'header' && grid.cell.column === cell.column;
  const { mark, sort } = cell.group ? { mark: '' } : sortMark(grid, node.key);
  const within = withinOf(node);
  const expandable = !cell.group && node.expandable && isBuilt('table.expand@table');
  return (
    <th
      scope="col"
      colSpan={cell.colSpan}
      rowSpan={cell.rowSpan}
      className={styles['heading']}
      style={stickyStyle(grid, cell, row)}
      data-pos={cell.group ? undefined : positionKey({ at: 'header', column: cell.column })}
      data-group={cell.group ? 'true' : undefined}
      data-key={node.key}
      data-feature={cell.group ? 'table.collapse@table' : 'table.sort@table'}
      aria-colindex={cell.column + 1}
      aria-sort={sort}
      tabIndex={cell.group ? undefined : focused ? 0 : -1}
      title={cell.group ? tableText.expand.collapse(node.key) : tableText.sort.headerTip(node.key)}
      draggable
      onClick={() => {
        pressed(grid, cell);
      }}
      onFocus={() => {
        if (!cell.group && !focused) {
          selectCell(grid.ref, { at: 'header', column: cell.column });
        }
      }}
      onMouseDown={(event) => {
        // A right click leaves the selected cell as it is: **Format cells…** proposes its value (`table.column-menu`).
        if (event.button === 2) {
          event.preventDefault();
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        openTableMenu({
          kind: 'column',
          tab: grid.ref.tab,
          column: node.key,
          x: event.clientX,
          y: event.clientY,
          returnFocus: event.currentTarget,
          ...(within === undefined ? {} : { within }),
        });
      }}
      onDragStart={(event) => {
        startDrag(event.dataTransfer, { kind: 'header', field: node.key, ...(within === undefined ? {} : { within }) });
      }}
      onDragOver={(event) => {
        if (readDragged(event.dataTransfer)?.kind === 'header') {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        dropped(grid, cell, event);
      }}
    >
      <span className={styles['heading-text']}>
        {nameOf(node)}
        {mark === '' ? null : <span aria-hidden="true">{mark}</span>}
      </span>
      {expandable ? <ExpandButton grid={grid} node={node} documents={documents} /> : null}
      {cell.group ? null : <ResizeEdge grid={grid} node={node} onResizing={onResizing} />}
    </th>
  );
}

/** The header rows. */
export function TableHeader(props: HeaderProps): React.JSX.Element {
  const { grid } = props;
  const numberFocused = grid.cell.at === 'header' && grid.cell.column === 0;
  return (
    <thead>
      {grid.header.map((cells, row) => (
        <tr key={String(row)} aria-rowindex={row + 1} style={{ height: subRowHeight }}>
          {row === 0 ? (
            <th
              scope="col"
              rowSpan={grid.header.length}
              className={`${styles['heading'] ?? ''} ${styles['number'] ?? ''}`}
              style={{ top: 0, left: 0, zIndex: 'var(--z-sticky-corner)' }}
              data-pos={positionKey({ at: 'header', column: 0 })}
              aria-colindex={1}
              tabIndex={numberFocused ? 0 : -1}
              onContextMenu={(event) => {
                event.preventDefault();
                openTableMenu({
                  kind: 'column',
                  tab: grid.ref.tab,
                  column: '#',
                  x: event.clientX,
                  y: event.clientY,
                  returnFocus: event.currentTarget,
                });
              }}
            >
              #
            </th>
          ) : null}
          {cells.map((cell) => (
            <Heading key={cell.node.key} {...props} cell={cell} row={row} />
          ))}
        </tr>
      ))}
    </thead>
  );
}
