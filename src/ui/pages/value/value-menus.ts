/**
 * What a gesture on a row of a value's table does (`value.show`): select it, open the editor of a cell
 * (`value.item-editor`) or say why the cell cannot be changed, and the context menus of a row (`@row-menu`) and of a
 * cell (`@cell-menu`): **Edit**, **Rename field…** of a hash, **Add a copy…** of an entry, **Copy**, **Copy as
 * hexadecimal**, **Copy as command**, and **Remove…** (**Delete entry…** of a stream) on a connection that writes.
 */
import { selectionAfter, type SelectGesture } from '../../../features/key/select';
import { rowName, type Column, type ValueRow, type ValueView } from '../../../features/value/show';
import { hexOf, nameText } from '../../../features/value/types';
import type { MenuItem, OpenKeysMenu } from '../keys/keys-menu';
import { cellOf, copyCell, copyRows, removeRows, rowsInOrder, selectedRows, startForm } from './value-actions';
import { changeValue, type ValueTab } from './value-store';

/** What the table is drawn with. */
export interface ValueTableProps {
  readonly tabId: string;
  readonly tab: ValueTab;
  readonly table: NonNullable<ValueView['table']>;
  readonly readOnly: boolean;
}

/** A gesture of selection on the rows, and the column of the cell clicked. */
export function select(props: ValueTableProps, gesture: SelectGesture, column?: string): void {
  const names = rowsInOrder(props.tab).map(rowName);
  changeValue(props.tabId, (now) => ({
    ...now,
    selection: selectionAfter(now.selection, gesture, names),
    ...(column === undefined ? {} : { column }),
  }));
}

/** Opens the editor on a cell, or says why the cell cannot be changed. */
export function edit(
  props: ValueTableProps,
  row: ValueRow,
  column: Column | undefined,
  say: (text: string) => void,
): void {
  if (column?.tooltip !== undefined) {
    say(column.tooltip);
    return;
  }
  if (column?.cell === undefined || props.readOnly) {
    return;
  }
  const cell = column.cell;
  changeValue(props.tabId, (now) => ({ ...now, editing: { row: hexOf(rowName(row)), column: column.name, cell } }));
}

/** The rows a gesture on a row acts on: the selection when the row is in it, else the row alone. */
function rowsFor(props: ValueTableProps, row: ValueRow): readonly ValueRow[] {
  const selected = selectedRows(props.tab);
  return selected.some((each) => hexOf(rowName(each)) === hexOf(rowName(row))) ? selected : [row];
}

/** The pairs of an entry as the form of **Add a copy…** takes them. */
function pairsOf(row: ValueRow): readonly { readonly field: { hex: string }; readonly value: { hex: string } }[] {
  return (row.entry?.fields ?? []).map(([field, value]) => ({
    field: { hex: hexOf(field) },
    value: { hex: hexOf(value) },
  }));
}

/** **Edit** of the cell each type changes: a field's value, an element, a score. */
const editedColumns: Readonly<Partial<Record<string, string>>> = { hash: 'Value', list: 'Element', zset: 'Score' };

/**
 * The writes of a row's menu on a connection that is not read-only: **Edit** (and **Rename field…** of a hash), or
 * **Add a copy…** of an entry.
 */
function rowWrites(props: ValueTableProps, row: ValueRow): readonly MenuItem[] {
  if (props.readOnly) {
    return [];
  }
  if (props.tab.type === 'stream') {
    const copy = { copy: pairsOf(row) };
    return [
      {
        label: 'Add a copy…',
        element: 'value.add-entry@row-menu',
        choose: () => void startForm(props.tabId, 'value.add-entry', 'row-menu', copy),
      },
    ];
  }
  const column = (name: string | undefined): Column | undefined =>
    props.table.columns.find((each) => each.name === name);
  const ignore = (): void => undefined;
  const edited = editedColumns[props.tab.type];
  const editing: readonly MenuItem[] =
    edited === undefined
      ? []
      : [
          {
            label: 'Edit',
            element: 'value.item-editor@row-menu',
            choose: () => {
              edit(props, row, column(edited), ignore);
            },
          },
        ];
  const rename: readonly MenuItem[] =
    props.tab.type === 'hash'
      ? [
          {
            label: 'Rename field…',
            element: 'value.rename-field@row-menu',
            choose: () => {
              edit(props, row, column('Field'), ignore);
            },
          },
        ]
      : [];
  return [...editing, ...rename];
}

/** **Remove…** of a row's menu, by the type of the value; **Delete entry…** of a stream. */
const removals: Readonly<Partial<Record<string, { readonly label: string; readonly element: string }>>> = {
  hash: { label: 'Remove…', element: 'value.remove-fields@row-menu' },
  list: { label: 'Remove…', element: 'value.remove-elements@row-menu' },
  set: { label: 'Remove…', element: 'value.remove-members@row-menu' },
  zset: { label: 'Remove…', element: 'value.remove-scored-members@row-menu' },
  stream: { label: 'Delete entry…', element: 'value.delete-entries@row-menu' },
};

function removal(props: ValueTableProps, row: ValueRow): readonly MenuItem[] {
  const entry = removals[props.tab.type];
  return props.readOnly || entry === undefined
    ? []
    : [{ ...entry, choose: () => void removeRows(props.tabId, rowsFor(props, row), 'row-menu') }];
}

/** The context menu of a row (`Shift+F10`): its writes, **Copy**, **Copy as command**, **Remove…**. */
export function rowMenuOf(props: ValueTableProps, row: ValueRow, x: number, y: number): OpenKeysMenu {
  const rows = rowsFor(props, row);
  const items: readonly MenuItem[] = [
    ...rowWrites(props, row),
    {
      label: 'Copy',
      element: 'value.copy@row-menu',
      choose: () => void copyRows(props.tabId, rows, 'rows', 'row-menu'),
    },
    {
      label: 'Copy as command',
      element: 'value.copy@row-menu',
      choose: () => void copyRows(props.tabId, rows, 'command', 'row-menu'),
    },
    ...removal(props, row),
  ];
  return { label: row.entry?.id ?? nameText(rowName(row)), x, y, items };
}

/** The context menu of a cell: **Copy**, **Copy as hexadecimal**, **Copy as command**, then what the row's has. */
export function cellMenuOf(
  props: ValueTableProps,
  row: ValueRow,
  column: Column,
  at: { readonly x: number; readonly y: number },
): OpenKeysMenu {
  const cell = cellOf(row, column.name);
  const { tabId } = props;
  const copies: readonly MenuItem[] =
    props.tab.type === 'stream'
      ? []
      : [
          {
            label: 'Copy',
            element: 'value.copy@cell-menu',
            choose: () => void copyCell(tabId, cell, 'value', 'cell-menu'),
          },
          {
            label: 'Copy as hexadecimal',
            element: 'value.copy@cell-menu',
            choose: () => void copyCell(tabId, cell, 'hex', 'cell-menu'),
          },
        ];
  const items: readonly MenuItem[] = [
    ...copies,
    {
      label: 'Copy as command',
      element: 'value.copy@cell-menu',
      choose: () => void copyRows(tabId, [row], 'command', 'cell-menu'),
    },
    ...rowWrites(props, row),
    ...removal(props, row),
  ];
  return { label: column.name, x: at.x, y: at.y, items };
}
