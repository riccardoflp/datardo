/**
 * What the controls around the table start through the bridge, on the collection of a tab: the copies
 * (`table.copy-as`, `table.copy-value`, `table.copy-path`), which say *Copied to the clipboard* once done, and the
 * changes of the columns (`table.expand`, `table.collapse`, `table.arrange-columns`), whose app step remembers them.
 * **Refresh** reads the page again (`table.refresh`).
 */
import type { LayoutChange } from '../../features/table/arrange-columns';
import { columnByKey, expandableBelow } from '../../features/table/detect-columns';
import { arrangedColumns } from '../../features/table/layout';
import type { CopyFormat } from '../../features/table/copy-text';
import type { ColumnLayout, ColumnNode, Document } from '../../features/table/types';
import type { IntentResult } from '../../shared/bridge';
import type { Json } from '../../shared/engine-request';
import { featureId, type Place } from '../../shared/ids';
import { runQuery, type CollectionRef } from '../query/collection-reads';
import { changeCollection } from '../query/collection-store';
import { flashCopied } from './copied-flash';
import type { TableColumns } from './table-columns';

/** The features whose end says *Copied to the clipboard*. */
const copies: ReadonlySet<string> = new Set(['table.copy-as', 'table.copy-value', 'table.copy-path']);

/** Where a control of the table is, from its element: `row-menu` for `table.copy-as@row-menu`; none from Go to. */
function placeOf(element: string): Place | undefined {
  const at = element.indexOf('@');
  return at < 0 ? undefined : (element.slice(at + 1) as Place);
}

function featureOf(element: string): string {
  const at = element.indexOf('@');
  return at < 0 ? element : element.slice(0, at);
}

/**
 * Starts the feature of an element on the tab's collection, with the collection in its arguments: `element` is
 * `table.copy-as@row-menu`, or the bare feature for a command of Go to.
 */
export async function startOnCollection(
  ref: CollectionRef,
  element: string,
  args: { readonly [key: string]: Json },
): Promise<IntentResult> {
  const place = placeOf(element);
  const feature = featureOf(element);
  const result = await window.datardo.start({
    feature: featureId(feature),
    target: { kind: 'collection', connection: ref.connection, database: ref.database, collection: ref.collection },
    ...(place === undefined ? {} : { place }),
    args: { connection: ref.connection, database: ref.database, collection: ref.collection, ...args },
  });
  if (result.kind === 'done' && copies.has(feature)) {
    flashCopied();
  }
  return result;
}

/** The columns as drawn, the order and the hidden ones of the layout applied, as `table.arrange-columns` reads them. */
function drawnColumns(columns: TableColumns): Json {
  return arrangedColumns(columns.columns, columns.layout).columns as unknown as Json;
}

/**
 * The columns a change of the layout works on: every column, the hidden ones too, in the order the layout gives them,
 * so that a move writes the order of the siblings as they are drawn.
 */
export function columnsInOrder(columns: readonly ColumnNode[], layout: ColumnLayout): readonly ColumnNode[] {
  return arrangedColumns(columns, { ...layout, hidden: [] }).columns;
}

/** `table.arrange-columns`: a change of the layout of the tab's collection. */
export function arrange(ref: CollectionRef, columns: TableColumns, change: LayoutChange, element: string): void {
  void startOnCollection(ref, element, {
    change: change,
    layout: columns.layout as unknown as Json,
    columns: columnsInOrder(columns.columns, columns.layout) as unknown as Json,
  });
}

/** `table.expand`: a column expanded, with every level under it for **Expand all levels**. */
export function expandColumn(
  ref: CollectionRef,
  table: { readonly columns: TableColumns; readonly documents: readonly Document[] },
  expand: { readonly key: string; readonly allLevels: boolean },
  element: string,
): void {
  const node = columnByKey(table.columns.columns, expand.key);
  const below = expand.allLevels && node !== undefined ? expandableBelow(table.documents, node) : [];
  void startOnCollection(ref, element, {
    key: expand.key,
    allLevels: expand.allLevels,
    below: [...below],
    expanded: [...table.columns.expanded],
  });
}

/** `table.collapse`: an expanded column put back into one. */
export function collapseColumn(ref: CollectionRef, columns: TableColumns, key: string, element: string): void {
  void startOnCollection(ref, element, { key, expanded: [...columns.expanded] });
}

/** `table.copy-as`: documents in the order of the table, in a format; asked when none is given (Go to). */
export function copyDocuments(
  ref: CollectionRef,
  columns: TableColumns,
  copied: { readonly documents: readonly Document[]; readonly format?: CopyFormat },
  element: string,
): void {
  void startOnCollection(ref, element, {
    documents: [...copied.documents],
    ...(copied.format === undefined ? {} : { format: copied.format }),
    columns: drawnColumns(columns),
  });
}

/** **Refresh**: the page read again as last run, with its count; the fields of the suggestions are read again next. */
export function refreshTab(ref: CollectionRef): void {
  changeCollection(ref.tab, (before) =>
    before.hints.kind === 'unread' ? before : { ...before, hints: { kind: 'unread' } },
  );
  void runQuery(ref, { texts: 'ran', refresh: true, count: true });
}
