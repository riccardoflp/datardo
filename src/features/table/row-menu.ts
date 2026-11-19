/**
 * Feature: table.row-menu
 *
 * What can be done with the document of a row, or with the selected documents: the context menu of the row number,
 * which is also the second part of the menu of a cell.
 */
import { formatsFor } from './copy-as';
import { allHaveId } from './selection-bar';
import { text } from './text';
import { canWrite, menuOf, type Document, type MenuEntry, type TableTarget } from './types';

/** What the menu of a row is drawn from: its document, the selected documents and what the table shows. */
export interface RowMenuState {
  readonly document: Document;
  /** The selected documents; the row's own is among them once the right click has selected it. */
  readonly selected: readonly Document[];
  readonly target: TableTarget;
}

function copyAsMenu(label: string, count: number, element: string): MenuEntry {
  return {
    kind: 'entry',
    label,
    element,
    submenu: formatsFor(count).map((each) => ({
      kind: 'entry',
      label: each.label,
      tip: each.description,
      element,
      args: { format: each.format },
    })),
  };
}

function needsId(label: string, element: string, withId: boolean): MenuEntry {
  return withId
    ? { kind: 'entry', label, element }
    : { kind: 'entry', label, element, disabled: true, tip: text.rowMenu.noId };
}

function oneRow(state: RowMenuState): readonly MenuEntry[] {
  const { target } = state;
  const withId = Object.hasOwn(state.document, '_id');
  const find = target.mode === 'find';
  return menuOf([
    [
      { kind: 'entry', label: text.rowMenu.inspect, element: 'document.inspect@row-menu' },
      ...(find ? [needsId(text.rowMenu.open, 'document.open@row-menu', withId)] : []),
      ...(find && !target.view ? [needsId(text.rowMenu.history, 'history.show@row-menu', withId)] : []),
    ],
    [copyAsMenu(text.rowMenu.copyAs, 1, 'table.copy-as@row-menu')],
    canWrite(target)
      ? [
          needsId(text.rowMenu.duplicate, 'document.duplicate@row-menu', withId),
          needsId(text.rowMenu.delete, 'document.delete@row-menu', withId),
        ]
      : [],
  ]);
}

function severalRows(state: RowMenuState): readonly MenuEntry[] {
  const count = state.selected.length;
  const withId = allHaveId(state.selected);
  const writes = withId && canWrite(state.target);
  return menuOf([
    [
      copyAsMenu(text.rowMenu.copySeveral(count), count, 'table.copy-as@row-menu'),
      ...(withId
        ? [
            {
              kind: 'entry',
              label: text.selection.export(count),
              element: 'transfer.export@row-menu',
              tip: text.selection.exportTip,
            } as const,
          ]
        : []),
    ],
    writes
      ? [
          { kind: 'entry', label: text.selection.update(count), element: 'document.update-selected@row-menu' },
          { kind: 'entry', label: text.selection.delete(count), element: 'document.delete-selected@row-menu' },
        ]
      : [],
    [{ kind: 'entry', label: text.rowMenu.clear, element: 'table.selection@row-menu', args: { action: 'clear' } }],
  ]);
}

/** Whether the row is one of several selected, so that the menu is that of the selection. */
export function ofSelection(state: RowMenuState): boolean {
  return state.selected.length > 1 && state.selected.includes(state.document);
}

/**
 * Feature: table.row-menu
 *
 * On a row alone: **Inspect document**, **Open in a tab**, **History…**, **Copy as**, **Duplicate…**, **Delete
 * document**, those that need an `_id` disabled without one. On a row of a selection of several: **Copy 3 documents
 * as**, **Export 3 documents…**, **Update 3 documents…**, **Delete 3 documents…**, **Clear selection**. What writes is
 * left out on a view, on a read-only connection and in Aggregate.
 */
export function view(state: RowMenuState): readonly MenuEntry[] {
  return ofSelection(state) ? severalRows(state) : oneRow(state);
}
