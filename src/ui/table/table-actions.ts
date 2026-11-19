/**
 * What the grid does to the tab: a header clicked sorts (`table.sort`), a `▸` expands (`table.expand`), a group
 * heading collapses (`table.collapse`), a header dropped or an edge dragged arranges the columns
 * (`table.arrange-columns`), a click or a key moves the selected cell and the selection (`table.navigate`,
 * `table.selection`), `Ctrl+C` copies the value of the cell (`table.copy-value`), and **Refresh** reads the page again
 * (`table.refresh`). The Operations are started through the bridge; the runner carries them out.
 */
import { edited } from '../../features/query/bar';
import type { LayoutChange } from '../../features/table/arrange-columns';
import { expandableBelow } from '../../features/table/detect-columns';
import type { Position } from '../../features/table/navigate';
import { selectionAfter, type SelectionAction } from '../../features/table/selection';
import { sortAfterClick } from '../../features/table/sort';
import type { ColumnLayout, ColumnNode, Document } from '../../features/table/types';
import type { Json } from '../../shared/engine-request';
import { runFromBar } from '../query/bar-actions';
import type { CollectionRef } from '../query/collection-reads';
import { changeCollection } from '../query/collection-store';
import { columnsInOrder, refreshTab, startOnCollection } from './table-start';

/** A header clicked, or `Enter` on it: the sort of that field alone, then the other direction, then none; and run. */
export function sortByHeader(ref: CollectionRef, key: string): void {
  changeCollection(ref.tab, (before) => ({
    ...before,
    query: edited(before.query, 'sort', sortAfterClick(before.query.texts.sort, key)),
  }));
  runFromBar(ref);
}

/** The `▸` of a column: its fields as columns, or its elements as sub-rows; with `Alt`, every level below too. */
export function expandColumn(
  ref: CollectionRef,
  node: ColumnNode,
  expanded: readonly string[],
  how: { readonly allLevels: boolean; readonly documents: readonly Document[] },
): void {
  const below = how.allLevels ? expandableBelow(how.documents, node).filter((key) => key !== node.key) : [];
  void startOnCollection(ref, 'table.expand@table', {
    key: node.key,
    below: [...below],
    allLevels: how.allLevels,
    expanded: [...expanded],
  });
}

/** A group heading clicked: the group back into one column. */
export function collapseColumn(ref: CollectionRef, key: string, expanded: readonly string[]): void {
  void startOnCollection(ref, 'table.collapse@table', { key, expanded: [...expanded] });
}

/** A change of the layout: a header moved, an edge dragged or double-clicked. */
export function arrangeColumns(
  ref: CollectionRef,
  change: LayoutChange,
  columns: { readonly columns: readonly ColumnNode[]; readonly layout: ColumnLayout },
): void {
  void startOnCollection(ref, 'table.arrange-columns@table', {
    change,
    layout: columns.layout as unknown as Json,
    columns: columnsInOrder(columns.columns, columns.layout) as unknown as Json,
  });
}

/** `Ctrl+C` on a cell that holds a value: the value on the clipboard. */
export function copyCellValue(ref: CollectionRef, value: Json | undefined): void {
  void startOnCollection(ref, 'table.copy-value@table', value === undefined ? {} : { value });
}

/** **Refresh**, `F5`: the page of the query last run read again, with its count. */
export function refreshTable(ref: CollectionRef): void {
  refreshTab(ref);
}

/** The selected cell or header. */
export function selectCell(ref: CollectionRef, cell: Position): void {
  changeCollection(ref.tab, (before) => ({ ...before, cell }));
}

/** The selection after a click or a key. */
export function changeSelection(ref: CollectionRef, action: SelectionAction): void {
  changeCollection(ref.tab, (before) => ({
    ...before,
    query: { ...before.query, selection: selectionAfter(before.query.selection, action, before.documents) },
  }));
}
