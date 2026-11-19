/**
 * Feature: table.navigate
 *
 * Says which cell is selected after a key, so that the whole table can be used without a mouse: the arrows, `Home`,
 * `End`, `Ctrl+Home`, `Ctrl+End`, `PageUp` and `PageDown`. Column 0 is the row number `#`, the drawn columns follow.
 */
import { leaves } from './detect-columns';
import type { Cell, Row } from './rows';
import type { ColumnNode } from './types';

/** The selected place: a column header, or a cell given by its row, the first sub-row it covers and its column. */
export type Position =
  | { readonly at: 'header'; readonly column: number }
  | { readonly at: 'cell'; readonly row: number; readonly subRow: number; readonly column: number };

/** A key that moves the selection; a page key with the number of rows visible. */
export type MoveKey =
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'Home'
  | 'End'
  | 'Ctrl+Home'
  | 'Ctrl+End'
  | { readonly page: 'up' | 'down'; readonly rows: number };

/** The first cell of the first row, where `Tab` enters a table with nothing selected. */
export const firstCell: Position = { at: 'cell', row: 0, subRow: 0, column: 1 };

/** The columns drawn: the first leaf of each key, and how many leaves there are. */
interface Grid {
  readonly rows: readonly Row[];
  readonly first: ReadonlyMap<string, number>;
  readonly width: number;
}

function gridOf(rows: readonly Row[], columns: readonly ColumnNode[]): Grid {
  const first = new Map<string, number>();
  const drawn = leaves(columns);
  drawn.forEach((leaf, index) => {
    first.set(leaf.node.key, index + 1);
    for (const group of leaf.starts) {
      first.set(group, index + 1);
    }
  });
  return { rows, first, width: drawn.length };
}

function covering(grid: Grid, row: number, subRow: number, column: number): Cell | undefined {
  return grid.rows[row]?.cells.find((cell) => {
    const start = grid.first.get(cell.column) ?? 0;
    return column >= start && column < start + cell.span && subRow >= cell.subRow && subRow < cell.subRow + cell.height;
  });
}

/** The position of the cell covering a place, at its first sub-row and first column. */
function placed(grid: Grid, row: number, subRow: number, column: number): Position {
  if (column === 0) {
    return { at: 'cell', row, subRow: 0, column: 0 };
  }
  const cell = covering(grid, row, subRow, column);
  return cell === undefined
    ? { at: 'cell', row, subRow, column }
    : { at: 'cell', row, subRow: cell.subRow, column: grid.first.get(cell.column) ?? column };
}

function spanOf(grid: Grid, at: Extract<Position, { at: 'cell' }>): { readonly span: number; readonly height: number } {
  if (at.column === 0) {
    return { span: 1, height: grid.rows[at.row]?.height ?? 1 };
  }
  const cell = covering(grid, at.row, at.subRow, at.column);
  return { span: cell?.span ?? 1, height: cell?.height ?? 1 };
}

function vertical(grid: Grid, at: Extract<Position, { at: 'cell' }>, down: boolean): Position {
  const last = grid.rows.length - 1;
  if (down) {
    const below = at.subRow + spanOf(grid, at).height;
    if (below < (grid.rows[at.row]?.height ?? 1)) {
      return placed(grid, at.row, below, at.column);
    }
    return at.row >= last ? at : placed(grid, at.row + 1, 0, at.column);
  }
  if (at.subRow > 0) {
    return placed(grid, at.row, at.subRow - 1, at.column);
  }
  return at.row === 0
    ? { at: 'header', column: at.column }
    : placed(grid, at.row - 1, (grid.rows[at.row - 1]?.height ?? 1) - 1, at.column);
}

function onHeader(grid: Grid, at: Extract<Position, { at: 'header' }>, key: MoveKey): Position {
  switch (key) {
    case 'ArrowDown':
      return grid.rows.length === 0 ? at : placed(grid, 0, 0, at.column);
    case 'ArrowLeft':
      return { at: 'header', column: Math.max(0, at.column - 1) };
    case 'ArrowRight':
      return { at: 'header', column: Math.min(grid.width, at.column + 1) };
    case 'ArrowUp':
    case 'Ctrl+End':
    case 'Ctrl+Home':
    case 'End':
    case 'Home':
    default:
      return at;
  }
}

function lastCell(grid: Grid): Position {
  const row = grid.rows.length - 1;
  return placed(grid, row, (grid.rows[row]?.height ?? 1) - 1, grid.width);
}

/**
 * Feature: table.navigate
 *
 * The position selected after a key: `←` and `→` in the same sub-row, stopping at the row number and at the last
 * column; `↑` and `↓` in the same column, through the sub-rows of an expanded array then to the next document, `↑`
 * on the first row to the header; `Home` and `End` along the row; `Ctrl+Home` and `Ctrl+End` to the first and last
 * cell; the page keys by the rows visible. A cell over several sub-rows or columns is one cell.
 */
export function cellAfterKey(
  rows: readonly Row[],
  columns: readonly ColumnNode[],
  at: Position,
  key: MoveKey,
): Position {
  const grid = gridOf(rows, columns);
  if (at.at === 'header') {
    return onHeader(grid, at, key);
  }
  if (typeof key === 'object') {
    const row = Math.max(0, Math.min(rows.length - 1, at.row + (key.page === 'down' ? key.rows : -key.rows)));
    return placed(grid, row, 0, at.column);
  }
  switch (key) {
    case 'ArrowLeft':
      return at.column === 0 ? at : placed(grid, at.row, at.subRow, at.column - 1);
    case 'ArrowRight': {
      const next = at.column + spanOf(grid, at).span;
      return next > grid.width ? at : placed(grid, at.row, at.subRow, next);
    }
    case 'ArrowUp':
    case 'ArrowDown':
      return vertical(grid, at, key === 'ArrowDown');
    case 'Home':
      return placed(grid, at.row, at.subRow, 1);
    case 'End':
      return placed(grid, at.row, at.subRow, grid.width);
    case 'Ctrl+Home':
      return placed(grid, 0, 0, 1);
    case 'Ctrl+End':
      return lastCell(grid);
  }
}
