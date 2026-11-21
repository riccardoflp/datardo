/**
 * What the window starts of the field area: **Rename field…**, **Remove field…** and **Convert type…**, from the menu
 * of a column header (`@column-menu`) and from Go to, on the column of the selected cell. The filter of the query bar
 * goes as written; when it differs from the query last run, the query runs first, so that the table shows the
 * documents concerned (field.md, *Where*).
 */
import { canWrite, isIdKey } from '../../../features/table/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import type { AppState } from '../../../shared/state';
import { rememberedColumns } from '../../../shared/state/table';
import { activeTabOf } from '../../../shared/state/tabs';
import { collectionRefOf, runQuery, type CollectionRef } from '../../query/collection-reads';
import { collectionOf, textsRan } from '../../query/collection-store';
import { selectedCell } from '../../table/selected-cell';
import { tableColumnsOf, tableTargetOf } from '../../table/table-columns';
import { startOnDocuments } from '../document/document-actions';
import { isReadOnly } from '../document/inspect-state';

/** The column an action is started on: its field path, and the expanded array it is a field of the elements of. */
export interface FieldColumn {
  readonly key: string;
  readonly within?: string;
}

/** The features of the field area the window starts, by the feature of their element. */
const fieldFeatures: ReadonlySet<string> = new Set(['field.rename', 'field.remove', 'field.convert-type']);

/** Whether an element, or a command, starts a feature of the field area. */
export function isFieldFeature(feature: string): boolean {
  return fieldFeatures.has(feature);
}

/** Starts a column action on a column: the query runs first when the bar's filter differs from the one last run. */
export async function startOnColumn(ref: CollectionRef, element: string, column: FieldColumn): Promise<IntentResult> {
  const collection = collectionOf(ref.tab);
  const filter = collection.query.texts.filter;
  if (filter !== textsRan(collection).filter) {
    await runQuery(ref, { texts: 'bar', count: true });
  }
  return startOnDocuments(ref, element, {
    field: column.key,
    ...(column.within === undefined ? {} : { array: column.within }),
    filter,
    written: filter,
  });
}

/**
 * A command of the field area from Go to or its key: on the column of the selected cell of the active collection tab,
 * in Find, on a collection that can be changed, not on `_id`; otherwise it does nothing, as its entry is not there.
 */
export function runFieldCommand(id: string, state: AppState): void {
  const active = activeTabOf(state.tabs);
  const ref = active === undefined ? undefined : collectionRefOf(active.id);
  if (ref === undefined) {
    return;
  }
  const collection = collectionOf(ref.tab);
  const target = tableTargetOf(collection, { view: ref.kind === 'view', readOnly: isReadOnly(state, ref) });
  const at = collection.cell;
  const columns = tableColumnsOf(rememberedColumns(state.table, ref), collection.documents);
  const cell = at === undefined ? undefined : selectedCell(collection.documents, columns, at);
  const column = cell?.column;
  if (column === undefined || !canWrite(target) || isIdKey(column.key)) {
    return;
  }
  const within = column.arrayDepth === undefined ? undefined : column.path.slice(0, column.arrayDepth).join('.');
  void startOnColumn(ref, id, { key: column.key, ...(within === undefined ? {} : { within }) });
}

/**
 * An entry of the menu of a column header, when it is one of the field area: started with the column of its arguments
 * (`{ key, array? }`). Whether it was one.
 */
export function chooseFieldEntry(
  ref: CollectionRef,
  entry: { readonly element: string; readonly args?: Json },
): boolean {
  const at = entry.element.indexOf('@');
  if (!isFieldFeature(at < 0 ? entry.element : entry.element.slice(0, at))) {
    return false;
  }
  const args = entry.args;
  const fields: { readonly [key: string]: Json } =
    typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as { readonly [key: string]: Json }) : {};
  const key = fields['key'];
  const array = fields['array'];
  if (typeof key === 'string') {
    void startOnColumn(ref, entry.element, { key, ...(typeof array === 'string' ? { within: array } : {}) });
  }
  return true;
}
