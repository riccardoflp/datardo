/**
 * The commands of values, carried out by the window on the value of the active key tab, the same way for their rows in
 * Go to (`palette.run-command`): **Refresh value** (and `F5`, the key of **Refresh keys**, in a key tab), **Copy Redis
 * value**, **Save value**, **Add field…**, **Edit field**, **Rename field…** and **Remove fields…**. What they need of
 * the value (the bytes loaded, the selected rows) is what the window read; with nothing to act on, they do nothing.
 */
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import { addField, copyRows, copyString, refreshValue, removeRows, saveString, selectedRows } from './value-actions';
import { changeValue, valueTabOf } from './value-store';
import { rowName } from '../../../features/value/show';
import { hexOf } from '../../../features/value/types';

/** Whether a command is carried out here: a command of values, or `F5` in a key tab. */
export function isValueCommand(id: string, state: AppState): boolean {
  return id.startsWith('value.') || (id === 'key.refresh' && activeTabOf(state.tabs)?.shows.kind === 'key');
}

/** Opens the editor on the cell of the one selected row: its value, or its name. */
function editSelected(tabId: string, column: 'Value' | 'Field'): void {
  const tab = valueTabOf(tabId);
  const [row, ...others] = tab === undefined ? [] : selectedRows(tab);
  if (tab?.type !== 'hash' || row === undefined || others.length > 0) {
    return;
  }
  changeValue(tabId, (now) => ({
    ...now,
    editing: { row: hexOf(rowName(row)), column, cell: column === 'Value' ? 'value' : 'name' },
  }));
}

/** Runs a command of values on the active key tab. */
export function runValueCommand(id: string, state: AppState): void {
  const tabId = activeTabOf(state.tabs)?.id;
  const tab = tabId === undefined ? undefined : valueTabOf(tabId);
  if (tabId === undefined || tab === undefined) {
    return;
  }
  const commands: Readonly<Record<string, () => void>> = {
    'key.refresh': () => void refreshValue(tabId, undefined),
    'value.refresh': () => void refreshValue(tabId, undefined),
    'value.copy': () =>
      void (tab.type === 'string'
        ? copyString(tabId, 'value', undefined)
        : copyRows(tabId, selectedRows(tab), 'rows', undefined)),
    'value.save-string': () => void saveString(tabId, undefined),
    'value.add-field': () => void addField(tabId, undefined),
    'value.edit-field': () => {
      editSelected(tabId, 'Value');
    },
    'value.rename-field': () => {
      editSelected(tabId, 'Field');
    },
    'value.remove-fields': () => void removeRows(tabId, selectedRows(tab), undefined),
  };
  commands[id]?.();
}
