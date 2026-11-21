/**
 * `relation.follow` on the table of a collection tab: a cell that holds a reference is a link (its tooltip says
 * where it leads; `Ctrl`+click and `Ctrl+Enter` follow it, `@table`), its context menu has **Open referenced
 * document** with one entry per target when there are several (`@cell-menu`), and the menu of a row has **Find
 * referencing documents** with the lines of **Referenced by** (`@row-menu`). **Open referenced document** of Go to
 * follows the selected cell.
 */
import { cellLink, rowReferences, type CellLink, type TableReferences } from '../../../features/relation/follow';
import type { MenuEntry, TableTarget } from '../../../features/table/types';
import type { Json } from '../../../shared/engine-request';
import type { AppState } from '../../../shared/state';
import { rememberedColumns } from '../../../shared/state/table';
import { activeTabOf } from '../../../shared/state/tabs';
import { collectionRefOf, type CollectionRef } from '../../query/collection-reads';
import { collectionOf } from '../../query/collection-store';
import { currentAppState } from '../../state/store';
import { selectedCell } from '../../table/selected-cell';
import { tableColumnsOf } from '../../table/table-columns';
import { openReferenced, openReferencing, tableReferencesOf } from './references';
import styles from './relation.module.css';

/** The class of a cell that holds a reference. */
export const linkClass = styles['link'] ?? '';

/** Whether `Ctrl` (`Cmd` on macOS) is held, for a cell that holds a reference to look like a link. */
function followCtrl(event: KeyboardEvent): void {
  document.documentElement.dataset['ctrl'] = String(event.ctrlKey || event.metaKey);
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', followCtrl);
  window.addEventListener('keyup', followCtrl);
  window.addEventListener('blur', () => {
    document.documentElement.dataset['ctrl'] = 'false';
  });
}

/** The link of a cell, when it holds a reference. */
export function linkOf(references: TableReferences, key: string, value: Json | undefined): CellLink | undefined {
  return value === undefined ? undefined : cellLink(references, key, value);
}

/** Follows the reference of a cell: opens the referenced documents, asking which collection when there are several. */
export function followCell(ref: CollectionRef, references: TableReferences, key: string, value: Json): void {
  openReferenced(ref, references, { path: key, value }, 'table');
}

/** **Open referenced document** of the cell menu, with one entry per target when the field refers to several. */
export function cellReferenceEntries(
  references: TableReferences,
  target: TableTarget,
  field: { readonly key: string; readonly value?: Json },
): readonly MenuEntry[] {
  const link = target.mode === 'find' ? linkOf(references, field.key, field.value) : undefined;
  if (link === undefined) {
    return [];
  }
  const args = { path: field.key, value: field.value ?? null };
  const submenu =
    link.targets.length > 1
      ? link.targets.map((each): MenuEntry => ({
          kind: 'entry',
          label: each.label,
          tip: each.filterText,
          element: link.menu.element,
          args: { ...args, label: each.label },
        }))
      : undefined;
  return [
    {
      kind: 'entry',
      label: link.menu.label,
      element: link.menu.element,
      ...(link.menu.tooltip === undefined ? {} : { tip: link.menu.tooltip }),
      args,
      ...(submenu === undefined ? {} : { submenu }),
    },
    { kind: 'separator' },
  ];
}

/** **Find referencing documents** of the row menu; nothing when nothing refers to the collection. */
export function rowReferenceEntries(
  references: TableReferences,
  target: TableTarget,
  document: Json,
): readonly MenuEntry[] {
  const row = target.mode === 'find' ? rowReferences(references, document) : undefined;
  if (row === undefined || row.targets.length === 0) {
    return [];
  }
  const submenu = row.targets.map((each): MenuEntry => ({
    kind: 'entry',
    label: each.label,
    tip: each.filterText,
    element: row.element,
    args: { document, label: each.label },
  }));
  // The entry that opens the submenu is the part of the row menu `relation.follow` shows; each of its entries starts
  // `relation.open-referencing`.
  return [
    { kind: 'separator' },
    { kind: 'entry', label: row.label, tip: row.tooltip, element: 'relation.follow@row-menu', submenu },
  ];
}

/** The references a collection tab's table knows now. */
export function referencesNow(ref: CollectionRef, target: TableTarget): TableReferences {
  return tableReferencesOf(currentAppState(), ref, target.mode);
}

/** Carries out an entry of the references in a menu of the table; false for another entry. */
export function chooseReferenceEntry(
  ref: CollectionRef,
  target: TableTarget,
  entry: { readonly element: string; readonly args?: Json },
): boolean {
  const args = (
    typeof entry.args === 'object' && entry.args !== null && !Array.isArray(entry.args) ? entry.args : {}
  ) as Readonly<Record<string, Json>>;
  const references = referencesNow(ref, target);
  if (entry.element === 'relation.open-referenced@cell-menu') {
    const label = typeof args['label'] === 'string' ? { label: args['label'] } : {};
    const path = typeof args['path'] === 'string' ? args['path'] : '';
    openReferenced(ref, references, { path, value: args['value'], ...label }, 'cell-menu');
    return true;
  }
  if (entry.element === 'relation.open-referencing@row-menu') {
    const label = typeof args['label'] === 'string' ? args['label'] : '';
    openReferencing(ref, references, { document: args['document'] ?? null, label }, 'row-menu');
    return true;
  }
  return false;
}

/** **Open referenced document** of Go to: follows the reference of the selected cell of the active tab. */
export function followSelectedCell(state: AppState): void {
  const active = activeTabOf(state.tabs);
  const ref = active === undefined ? undefined : collectionRefOf(active.id);
  if (ref === undefined) {
    return;
  }
  const collection = collectionOf(ref.tab);
  const at = collection.cell;
  const columns = tableColumnsOf(rememberedColumns(state.table, ref), collection.documents);
  const cell = at === undefined ? undefined : selectedCell(collection.documents, columns, at);
  const mode = collection.query.mode === 'aggregate' ? 'aggregate' : 'find';
  const references = tableReferencesOf(state, ref, mode);
  const key = cell?.column?.key;
  if (key !== undefined && cell?.value !== undefined && linkOf(references, key, cell.value) !== undefined) {
    followCell(ref, references, key, cell.value);
  }
}
