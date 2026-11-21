/**
 * The state `value.show` is drawn from, made of what a key tab keeps of its value and the app's state; and what a key
 * tab adds to the active tab for the status line and the inspector island (`nav.status-line`, `nav.inspector`): the
 * count, and the selected item of a table, or **Nothing selected**.
 */
import type { Inspection } from '../../../features/nav/types';
import type { Form } from '../../../features/value/format';
import { rowName, view, type ValueState, type ValueView } from '../../../features/value/show';
import { viewText } from '../../../features/value/text';
import { hexOf, isValueType, nameText } from '../../../features/value/types';
import type { AppState } from '../../../shared/state';
import { factsOf } from '../keys/keys-state';
import { rowsInOrder } from './value-actions';
import { valueTabOf, type ValueTab } from './value-store';

/** The index, in the order of the table, of the one row selected; none when no row or several are. */
export function selectedIndex(tab: ValueTab): number | undefined {
  const rows = rowsInOrder(tab);
  const indexes = rows.flatMap((row, index) => (tab.selection.keys.has(hexOf(rowName(row))) ? [index] : []));
  return indexes.length === 1 ? indexes[0] : undefined;
}

/** How many of the rows read are selected. */
export function selectedCount(tab: ValueTab): number {
  return tab.rows.filter((row) => tab.selection.keys.has(hexOf(rowName(row)))).length;
}

/** Whether more of the value can be read: a scan not ended, a next page. */
export function hasMore(tab: ValueTab): boolean {
  return (tab.scan !== undefined && tab.scan.ended === undefined) || tab.next !== undefined;
}

/** The state of `value.show`, from what the tab keeps. */
export function valueStateOf(tab: ValueTab, readOnly: boolean, form: Form): ValueState {
  const selected = selectedIndex(tab);
  return {
    form,
    key: nameText(tab.where.key),
    type: tab.type,
    readOnly,
    status: tab.status,
    ...(tab.error === undefined ? {} : { error: tab.error }),
    ...(tab.was === undefined ? {} : { was: tab.was }),
    ...(tab.draft === undefined ? {} : { unsaved: true }),
    ...(tab.count === undefined ? {} : { count: tab.count }),
    ...(tab.string === undefined ? {} : { string: tab.string }),
    rows: rowsInOrder(tab),
    more: hasMore(tab),
    filter: tab.filter,
    fieldExpiry: tab.fieldExpiry,
    ...(tab.sort === undefined ? {} : { sortedBy: tab.sort.column }),
    choices: tab.choices,
    ...(selected === undefined ? {} : { selected }),
  };
}

/** The view of a tab's value in full, on its connection as the app's state has it. */
export function fullView(app: AppState, tab: ValueTab): ValueView {
  return view(valueStateOf(tab, factsOf(app, tab.where.connection).readOnly, 'full'));
}

/** What a key tab adds to the active tab: the count of the value, and the inspection of a table's rows. */
export function valueExtras(app: AppState, tabId: string): { count?: string; inspection?: Inspection } {
  const tab = valueTabOf(tabId);
  if (tab === undefined || tab.status !== 'ready' || !isValueType(tab.type)) {
    return {};
  }
  const shown = fullView(app, tab);
  const count = shown.count === undefined ? {} : { count: shown.count };
  if (tab.type === 'string' || tab.found !== undefined) {
    return count;
  }
  const selected = selectedCount(tab);
  const inspection: Inspection =
    selected === 1
      ? { selected: 1, title: shown.inspector?.title ?? '', emptyLine: '' }
      : { selected, emptyLine: viewText.selectRow };
  return { ...count, inspection };
}
