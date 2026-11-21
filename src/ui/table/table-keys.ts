/**
 * The keys of the grid while it has the focus (`@table`): the arrows, `Home`, `End`, `Ctrl+Home`, `Ctrl+End`,
 * `PageUp` and `PageDown` move the selected cell (`table.navigate`), and select the document moved to; `Shift` with
 * `↑` or `↓`, `Ctrl+Space`, `Ctrl+A` and `Esc` change the selection (`table.selection`); `Enter` on a heading sorts
 * (`table.sort`); `Ctrl+C` copies the value of the cell (`table.copy-value`); `Shift+F10` and the menu key open the
 * menu of the cell, of the row number or of the heading. On a cell, `Enter`, `F2` and `Delete` are the document
 * area's.
 */
import { cellAfterKey, type MoveKey, type Position } from '../../features/table/navigate';
import type { Cell } from '../../features/table/rows';
import type { SelectionAction } from '../../features/table/selection';
import { positionKey } from './grid-model';
import type { GridView } from './grid-view';
import { deleteKey, editOrInspect } from '../pages/document/table-entries';
import { showInInspector } from '../pages/document/inspect-state';
import { collectionOf } from '../query/collection-store';
import { openTableMenu } from './menu-request';
import { changeSelection, copyCellValue, selectCell, sortByHeader } from './table-actions';

/** What the keys need of the grid on screen. */
export interface KeyPlace {
  /** How many documents are visible, for `PageUp` and `PageDown`. */
  readonly visibleRows: () => number;
  /** Puts the focus on the selected cell once it is drawn. */
  readonly focusSelected: () => void;
  /** The element of a position, when it is drawn. */
  readonly elementOf: (position: Position) => HTMLElement | null;
}

function moveKeyOf(event: React.KeyboardEvent, place: KeyPlace): MoveKey | undefined {
  const ctrl = event.ctrlKey || event.metaKey;
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown':
      return event.key;
    case 'Home':
      return ctrl ? 'Ctrl+Home' : 'Home';
    case 'End':
      return ctrl ? 'Ctrl+End' : 'End';
    case 'PageUp':
      return { page: 'up', rows: place.visibleRows() };
    case 'PageDown':
      return { page: 'down', rows: place.visibleRows() };
    default:
      return undefined;
  }
}

function cellAt(grid: GridView, at: Position): Cell | undefined {
  if (at.at !== 'cell' || at.column === 0) {
    return undefined;
  }
  return grid.rows[at.row]?.cells.find(
    (cell) => cell.subRow === at.subRow && grid.places.get(cell.column) === at.column,
  );
}

function moved(grid: GridView, key: MoveKey, event: React.KeyboardEvent, place: KeyPlace): void {
  const next = cellAfterKey(grid.rows, grid.arranged.columns, grid.cell, key);
  selectCell(grid.ref, next);
  const before = grid.cell.at === 'cell' ? grid.cell.row : undefined;
  if (next.at === 'cell' && next.row !== before) {
    const vertical = key === 'ArrowUp' || key === 'ArrowDown';
    changeSelection(grid.ref, { kind: event.shiftKey && vertical ? 'range' : 'only', index: next.row });
  }
  place.focusSelected();
}

function menuKey(grid: GridView, place: KeyPlace): void {
  const at = grid.cell;
  const element = place.elementOf(at);
  const box = element?.getBoundingClientRect();
  const where = { tab: grid.ref.tab, x: box?.left ?? 0, y: box?.bottom ?? 0, returnFocus: element };
  if (at.at === 'header') {
    const leaf = grid.drawn[at.column - 1];
    openTableMenu({ kind: 'column', ...where, column: leaf?.node.key ?? '#' });
    return;
  }
  const cell = cellAt(grid, at);
  if (cell === undefined) {
    openTableMenu({ kind: 'row', ...where, row: at.row });
    return;
  }
  const value = cell.content.kind === 'value' ? { value: cell.content.value } : {};
  const within = cell.element === undefined ? {} : { within: cell.element.array };
  openTableMenu({ kind: 'cell', ...where, row: at.row, column: cell.column, cell, ...value, ...within });
}

function selectionKey(grid: GridView, event: React.KeyboardEvent): SelectionAction | undefined {
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && (event.key === 'a' || event.key === 'A')) {
    return { kind: 'all' };
  }
  if (event.key === 'Escape') {
    return { kind: 'clear' };
  }
  if (ctrl && event.key === ' ' && grid.cell.at === 'cell') {
    return { kind: 'toggle', index: grid.cell.row };
  }
  return undefined;
}

/**
 * The keys of the document area on a cell: `Enter` shows the document in the inspector (`document.inspect`), `F2`
 * edits the value there (`document.inline-edit`), `Delete` deletes the selected rows or the row
 * (`document.delete`, `document.delete-selected`).
 */
function documentKey(grid: GridView, event: React.KeyboardEvent, place: KeyPlace): boolean {
  const at = grid.cell;
  if (at.at !== 'cell' || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }
  const collection = collectionOf(grid.ref.tab);
  switch (event.key) {
    case 'Enter':
      showInInspector(grid.ref, at.row);
      return true;
    case 'F2': {
      const cell = cellAt(grid, at);
      if (cell !== undefined) {
        const anchor = place.elementOf(at);
        editOrInspect({ ref: grid.ref, collection, target: grid.target, cell: { cell, row: at.row, anchor } }, false);
      }
      return true;
    }
    case 'Delete':
      deleteKey(grid.ref, collection, grid.target, at.row);
      return true;
    default:
      return false;
  }
}

function otherKey(grid: GridView, event: React.KeyboardEvent, place: KeyPlace): boolean {
  const ctrl = event.ctrlKey || event.metaKey;
  if (documentKey(grid, event, place)) {
    return true;
  }
  if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
    menuKey(grid, place);
    return true;
  }
  if (event.key === 'Enter' && grid.cell.at === 'header' && grid.cell.column > 0 && grid.target.mode === 'find') {
    const leaf = grid.drawn[grid.cell.column - 1];
    if (leaf !== undefined) {
      sortByHeader(grid.ref, leaf.node.key);
    }
    return true;
  }
  if (ctrl && (event.key === 'c' || event.key === 'C')) {
    const cell = cellAt(grid, grid.cell);
    if (cell?.content.kind === 'value') {
      copyCellValue(grid.ref, cell.content.value);
    }
    return true;
  }
  return false;
}

/** What a key does in the grid; a key it does not take goes on to the window. */
export function tableKeyDown(grid: GridView, event: React.KeyboardEvent, place: KeyPlace): void {
  if (event.altKey) {
    return;
  }
  const move = moveKeyOf(event, place);
  if (move !== undefined && grid.rows.length > 0) {
    event.preventDefault();
    moved(grid, move, event, place);
    return;
  }
  const action = selectionKey(grid, event);
  if (action !== undefined) {
    event.preventDefault();
    changeSelection(grid.ref, action);
    return;
  }
  if (otherKey(grid, event, place)) {
    event.preventDefault();
  }
}

/** The element of a position in a grid drawn in a container. */
export function elementIn(container: HTMLElement | null, position: Position): HTMLElement | null {
  return container?.querySelector<HTMLElement>(`[data-pos="${positionKey(position)}"]`) ?? null;
}
