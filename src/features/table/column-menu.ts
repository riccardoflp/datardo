/**
 * Feature: table.column-menu
 *
 * What can be done with a column and with its field in the documents: the context menu of a column header.
 */
import type { Json } from '../../shared/engine-request';
import { view as dragView, type Zone } from '../query/drag';
import type { QueryTexts } from '../query/types';
import { topOf } from './arrange-columns';
import { expandEntries } from './cell-menu';
import { text as fieldText } from '../field/text';
import { text } from './text';
import {
  canWrite,
  isIdKey,
  menuOf,
  type ColumnLayout,
  type ColumnNode,
  type MenuEntry,
  type TableTarget,
} from './types';

/** What the menu of a header is drawn from: its column (`'#'` for the row number column), the layout and the query. */
export interface ColumnMenuState {
  readonly column: ColumnNode | '#';
  readonly layout: ColumnLayout;
  readonly texts: QueryTexts;
  readonly target: TableTarget;
  /** The path of the expanded array the column is in. */
  readonly within?: string;
  /** The value of the selected cell, when it is a cell of this column: **Format cells…** proposes it. */
  readonly selectedValue?: Json;
}

function zoneEntries(label: string, element: string, zones: readonly Zone[]): MenuEntry {
  return {
    kind: 'entry',
    label,
    element,
    submenu: zones.map((zone) => ({
      kind: 'entry',
      label: zone.label,
      tip: zone.tip,
      element,
      args: zone.action,
    })),
  };
}

function queryEntries(state: ColumnMenuState, column: ColumnNode): readonly MenuEntry[] {
  const dragged = {
    kind: 'header',
    field: column.key,
    ...(state.within === undefined ? {} : { within: state.within }),
  } as const;
  const zones = dragView({ dragged, texts: state.texts });
  const find = state.target.mode === 'find';
  return [
    ...(find ? [zoneEntries(text.columnMenu.sort, 'query.add-sort@column-menu', zones.sort)] : []),
    zoneEntries(text.columnMenu.addToFilter, 'query.add-condition@column-menu', zones.filter),
    ...(find ? [zoneEntries(text.columnMenu.project, 'query.add-projection@column-menu', zones.project)] : []),
    { kind: 'entry', label: text.cellMenu.copyPath, element: 'table.copy-path@column-menu', args: { key: column.key } },
  ];
}

function arrangeEntries(state: ColumnMenuState, column: ColumnNode): readonly MenuEntry[] {
  const { key } = column;
  const top = topOf(key);
  const pinned = (state.layout.pinned ?? []).includes(top);
  const sized = state.layout.widths?.[key] !== undefined;
  const element = 'table.arrange-columns@column-menu';
  return [
    { kind: 'entry', label: text.arrange.hide(key), element, args: { change: { kind: 'hide', key } } },
    pinned
      ? { kind: 'entry', label: text.arrange.unpin(top), element, args: { change: { kind: 'unpin', key } } }
      : { kind: 'entry', label: text.arrange.pin(top), element, args: { change: { kind: 'pin', key } } },
    ...(sized
      ? [
          {
            kind: 'entry',
            label: text.arrange.resetWidth,
            element,
            args: { change: { kind: 'reset-width', key } },
          } as const,
        ]
      : []),
  ];
}

/** **Format cells…**, which opens a new rule for the cells of the column (`table.add-format-rule`). */
function formatEntries(state: ColumnMenuState, column: ColumnNode): readonly MenuEntry[] {
  const value = state.selectedValue === undefined ? {} : { value: state.selectedValue };
  return [
    {
      kind: 'entry',
      label: text.formatting.formatCells,
      element: 'table.add-format-rule@column-menu',
      tip: text.formatting.formatCellsTip(column.key),
      args: { field: column.key, ...value },
    },
  ];
}

const columnsEntries: readonly MenuEntry[] = [
  { kind: 'entry', label: text.columns.menuEntry, element: 'table.columns@column-menu' },
  {
    kind: 'entry',
    label: text.arrange.resetAll,
    element: 'table.arrange-columns@column-menu',
    args: { change: { kind: 'reset' } },
  },
];

function fieldEntries(state: ColumnMenuState, column: ColumnNode): readonly MenuEntry[] {
  if (!canWrite(state.target) || isIdKey(column.key)) {
    return [];
  }
  // A field of the elements of an expanded array names that array, which the actions refuse or guard.
  const array = column.arrayDepth === undefined ? undefined : column.path.slice(0, column.arrayDepth).join('.');
  const args = { key: column.key, ...(array === undefined ? {} : { array }) };
  return [
    {
      kind: 'entry',
      label: text.columnMenu.rename,
      element: 'field.rename@column-menu',
      tip: fieldText.tooltips.rename,
      args,
    },
    {
      kind: 'entry',
      label: text.columnMenu.remove,
      element: 'field.remove@column-menu',
      tip: fieldText.tooltips.remove,
      args,
    },
    {
      kind: 'entry',
      label: text.columnMenu.convert,
      element: 'field.convert-type@column-menu',
      tip: fieldText.tooltips.convert,
      args,
    },
  ];
}

/**
 * Feature: table.column-menu
 *
 * **Sort**, **Add to filter**, **Project**, **Copy field path**; **Format cells…**, in Find and in Aggregate, on a
 * view and through a read-only connection too; the expand entries; **Hide**, **Pin** or **Unpin**,
 * **Reset width**, **Columns…**, **Reset all columns**; the entries of the field area in Find on a collection that can
 * be changed, not on `_id`. The row number column has **Columns…** and **Reset all columns** only; Aggregate has no
 * **Sort** and no **Project**.
 */
export function view(state: ColumnMenuState): readonly MenuEntry[] {
  const { column } = state;
  if (column === '#') {
    return columnsEntries;
  }
  return menuOf([
    queryEntries(state, column),
    formatEntries(state, column),
    [...expandEntries(column, 'column-menu'), ...arrangeEntries(state, column), ...columnsEntries],
    fieldEntries(state, column),
  ]);
}
