/**
 * The commands of values, carried out by the window on the value of the active key tab, the same way for their rows in
 * Go to (`palette.run-command`): **Refresh value** (and `F5`, the key of **Refresh keys**, in a key tab), **Copy Redis
 * value**, **Save value**, the forms of the toolbars (**Add field…**, **Push element…**, **Trim list…**, **Add
 * member…**, **Add scored member…**, **Add entry…**, **Trim stream…**), the editors of the selected row (**Edit
 * field**, **Rename field…**, **Edit element**, **Change score**) and the removals of the selected rows. What they need
 * of the value (the bytes loaded, the selected rows) is what the window read; with nothing to act on, or on a value of
 * another type than theirs, they do nothing.
 */
import type { EditedCell } from '../../../features/value/item-editor';
import { rowName } from '../../../features/value/show';
import { hexOf } from '../../../features/value/types';
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import {
  copyRows,
  copyString,
  refreshValue,
  removeRows,
  saveString,
  selectedRows,
  startForm,
  type FormWrite,
} from './value-actions';
import { changeValue, valueTabOf } from './value-store';

/** Whether a command is carried out here: a command of values, or `F5` in a key tab. */
export function isValueCommand(id: string, state: AppState): boolean {
  return id.startsWith('value.') || (id === 'key.refresh' && activeTabOf(state.tabs)?.shows.kind === 'key');
}

/** Opens the editor on a cell of the one selected row: a field's value or name, an element, a score. */
function editSelected(tabId: string, column: string, cell: EditedCell): void {
  const tab = valueTabOf(tabId);
  const [row, ...others] = tab === undefined ? [] : selectedRows(tab);
  if (row === undefined || others.length > 0) {
    return;
  }
  changeValue(tabId, (now) => ({ ...now, editing: { row: hexOf(rowName(row)), column, cell } }));
}

/** The type of value each command acts on; the others act on any. */
const typeOf: Readonly<Record<string, string>> = {
  'value.add-field': 'hash',
  'value.edit-field': 'hash',
  'value.rename-field': 'hash',
  'value.remove-fields': 'hash',
  'value.push-element': 'list',
  'value.edit-element': 'list',
  'value.remove-elements': 'list',
  'value.trim-list': 'list',
  'value.add-member': 'set',
  'value.remove-members': 'set',
  'value.add-scored-member': 'zset',
  'value.change-score': 'zset',
  'value.remove-scored-members': 'zset',
  'value.add-entry': 'stream',
  'value.delete-entries': 'stream',
  'value.trim-stream': 'stream',
};

/** The commands that open the form of their write. */
const forms: readonly FormWrite[] = [
  'value.add-field',
  'value.push-element',
  'value.trim-list',
  'value.add-member',
  'value.add-scored-member',
  'value.add-entry',
  'value.trim-stream',
];

/** The commands that remove the selected rows. */
const removals = [
  'value.remove-fields',
  'value.remove-elements',
  'value.remove-members',
  'value.remove-scored-members',
  'value.delete-entries',
];

/** The commands that open the editor of a cell of the selected row: its column and its cell. */
const editors: Readonly<Record<string, readonly [string, EditedCell]>> = {
  'value.edit-field': ['Value', 'value'],
  'value.rename-field': ['Field', 'name'],
  'value.edit-element': ['Element', 'element'],
  'value.change-score': ['Score', 'score'],
};

/** Runs a command of values on the active key tab. */
export function runValueCommand(id: string, state: AppState): void {
  const tabId = activeTabOf(state.tabs)?.id;
  const tab = tabId === undefined ? undefined : valueTabOf(tabId);
  const type = typeOf[id];
  if (tabId === undefined || tab === undefined || (type !== undefined && tab.type !== type)) {
    return;
  }
  const form = forms.find((each) => each === id);
  const editor = editors[id];
  if (form !== undefined) {
    void startForm(tabId, form, undefined);
  } else if (editor !== undefined) {
    editSelected(tabId, editor[0], editor[1]);
  } else if (removals.includes(id)) {
    void removeRows(tabId, selectedRows(tab), undefined);
  } else if (id === 'key.refresh' || id === 'value.refresh') {
    void refreshValue(tabId, undefined);
  } else if (id === 'value.copy') {
    void (tab.type === 'string'
      ? copyString(tabId, 'value', undefined)
      : copyRows(tabId, selectedRows(tab), 'rows', undefined));
  } else if (id === 'value.save-string') {
    void saveString(tabId, undefined);
  }
}
