/**
 * The rows of one document (`table.rows`): one row of the grid per sub-row, the row number across all of them, and its
 * cells, each written as `table.cell-text` says with the color of its kind. A click selects the cell and the document
 * (`table.navigate`, `table.selection`); a cell that holds a value is dragged onto the bar (`query.drag`); a right
 * click opens the menu of the cell or of the row.
 */
import { cellOfValue } from '../../features/table/cell-text';
import type { Cell, Row } from '../../features/table/rows';
import { text as tableText } from '../../features/table/text';
import type { Position } from '../../features/table/navigate';
import { startDrag } from '../query/drag-data';
import { positionKey, subRowHeight, syntaxOf } from './grid-model';
import type { GridView } from './grid-view';
import { openTableMenu } from './menu-request';
import { changeSelection, selectCell } from './table-actions';
import styles from './table.module.css';

/** A click on a cell or a row number: the cell selected, and the document alone, added, or the range to it. */
function clicked(grid: GridView, index: number, at: Position, event: React.MouseEvent): void {
  selectCell(grid.ref, at);
  if (event.ctrlKey || event.metaKey) {
    changeSelection(grid.ref, { kind: 'toggle', index });
  } else if (event.shiftKey) {
    changeSelection(grid.ref, { kind: 'range', index });
  } else {
    changeSelection(grid.ref, { kind: 'only', index });
  }
}

function contentOf(cell: Cell): {
  readonly text: string;
  readonly title?: string;
  readonly kind?: string;
  readonly type?: string;
} {
  const { content } = cell;
  switch (content.kind) {
    case 'value': {
      const written = cellOfValue(content.value);
      const tip = [cell.note, written.tooltip, written.type].filter((each) => each !== undefined).join('\n');
      const kind = syntaxOf(written.kind);
      return {
        text: written.text,
        title: tip,
        ...(written.type === undefined ? {} : { type: written.type }),
        ...(kind === undefined ? {} : { kind }),
      };
    }
    case 'more':
      return { text: tableText.rows.more(content.count) };
    case 'missing':
    case 'filler':
      return { text: '' };
  }
}

function ValueCell({ grid, index, cell }: { readonly grid: GridView; readonly index: number; readonly cell: Cell }) {
  const column = grid.places.get(cell.column) ?? 1;
  const at: Position = { at: 'cell', row: index, subRow: cell.subRow, column };
  const selected = grid.cell.at === 'cell' && positionKey(grid.cell) === positionKey(at);
  const shown = contentOf(cell);
  const left = grid.lefts[column - 1];
  const value = cell.content.kind === 'value' ? cell.content.value : undefined;
  const within = cell.element?.array;
  return (
    <td
      colSpan={cell.span}
      rowSpan={cell.height}
      className={styles['cell']}
      style={left === undefined ? undefined : { left, position: 'sticky', zIndex: 'var(--z-sticky-number)' }}
      data-pos={positionKey(at)}
      data-selected={selected ? 'true' : undefined}
      data-content={cell.content.kind}
      data-column={cell.column}
      data-syntax={shown.kind}
      aria-colindex={column + 1}
      tabIndex={selected ? 0 : -1}
      title={shown.title}
      draggable={value !== undefined}
      data-feature={value === undefined ? undefined : 'query.drag@table'}
      onClick={(event) => {
        clicked(grid, index, at, event);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        selectCell(grid.ref, at);
        openTableMenu({
          kind: 'cell',
          tab: grid.ref.tab,
          row: index,
          column: cell.column,
          x: event.clientX,
          y: event.clientY,
          returnFocus: event.currentTarget,
          ...(within === undefined ? {} : { within }),
          ...(value === undefined ? {} : { value }),
        });
      }}
      onDragStart={(event) => {
        if (value !== undefined) {
          startDrag(event.dataTransfer, {
            kind: 'cell',
            field: cell.column,
            value,
            ...(within === undefined ? {} : { within }),
          });
        }
      }}
    >
      <span className={styles['cell-text']}>{shown.text}</span>
      {shown.type === undefined ? null : <span className={styles['spoken']}>, {shown.type}</span>}
    </td>
  );
}

function NumberCell({ grid, index, row }: { readonly grid: GridView; readonly index: number; readonly row: Row }) {
  const at: Position = { at: 'cell', row: index, subRow: 0, column: 0 };
  const selected = grid.cell.at === 'cell' && grid.cell.row === index && grid.cell.column === 0;
  return (
    <td
      rowSpan={row.height}
      className={`${styles['cell'] ?? ''} ${styles['number'] ?? ''}`}
      style={{ left: 0 }}
      data-pos={positionKey(at)}
      data-selected={selected ? 'true' : undefined}
      aria-colindex={1}
      tabIndex={selected ? 0 : -1}
      title={tableText.rows.inspect}
      onClick={(event) => {
        clicked(grid, index, at, event);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        selectCell(grid.ref, at);
        openTableMenu({
          kind: 'row',
          tab: grid.ref.tab,
          row: index,
          x: event.clientX,
          y: event.clientY,
          returnFocus: event.currentTarget,
        });
      }}
    >
      {row.number}
    </td>
  );
}

/** The rows of one document. */
export function DocumentRows({
  grid,
  index,
}: {
  readonly grid: GridView;
  readonly index: number;
}): React.JSX.Element | null {
  const row = grid.rows[index];
  if (row === undefined) {
    return null;
  }
  const selected = grid.selected.has(row.key);
  const first = grid.header.length + (grid.offsets[index] ?? 0) + 1;
  return (
    <>
      {Array.from({ length: row.height }, (_, subRow) => (
        <tr
          key={String(subRow)}
          className={styles['row']}
          style={{ height: subRowHeight }}
          aria-rowindex={first + subRow}
          aria-selected={selected}
          data-row={index}
        >
          {subRow === 0 ? <NumberCell grid={grid} index={index} row={row} /> : null}
          {row.cells
            .filter((cell) => cell.subRow === subRow)
            .map((cell) => (
              <ValueCell key={cell.column} grid={grid} index={index} cell={cell} />
            ))}
        </tr>
      ))}
    </>
  );
}
