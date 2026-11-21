/**
 * The context menu the table asks for (`table.row-menu`, `table.cell-menu`, `table.column-menu`): the grid says which
 * row, cell or header and where, by a right click, `Shift+F10` or the menu key; the menus draw it there. One menu is
 * open at a time, in the window.
 */
import { useSyncExternalStore } from 'react';
import type { Cell } from '../../features/table/rows';
import type { Json } from '../../shared/engine-request';
import type { TabId } from '../../shared/ids';

/** Where the menu opens, in the window's pixels, and the element to give the focus back to when it closes. */
export interface MenuPlace {
  readonly x: number;
  readonly y: number;
  readonly returnFocus?: HTMLElement | null;
}

/** The menu asked for. */
export type TableMenuRequest = MenuPlace &
  (
    | { readonly kind: 'row'; readonly tab: TabId; readonly row: number }
    | {
        readonly kind: 'cell';
        readonly tab: TabId;
        /** The index of the document in the page. */
        readonly row: number;
        /** The key of the leaf column. */
        readonly column: string;
        /** The path of the expanded array the cell is an element of. */
        readonly within?: string;
        /** The value of the cell; none when the document has no such field. */
        readonly value?: Json;
        /** The cell itself, for **Edit value** (`document.inline-edit`). */
        readonly cell?: Cell;
      }
    | {
        readonly kind: 'column';
        readonly tab: TabId;
        /** The key of the column, or `#` for the column of row numbers. */
        readonly column: string;
        readonly within?: string;
      }
  );

let open: TableMenuRequest | undefined;
const listeners = new Set<() => void>();

function changed(next: TableMenuRequest | undefined): void {
  open = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Opens a context menu of the table; one already open closes. */
export function openTableMenu(request: TableMenuRequest): void {
  changed(request);
}

/** Closes the menu that is open. */
export function closeTableMenu(): void {
  if (open !== undefined) {
    changed(undefined);
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The menu open on a tab's table, drawn again when it changes. */
export function useTableMenu(tab: TabId): TableMenuRequest | undefined {
  return useSyncExternalStore(subscribe, () => (open?.tab === tab ? open : undefined));
}
