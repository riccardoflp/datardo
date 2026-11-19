/**
 * Feature: table.cell-menu
 *
 * What can be done with the value of a cell and its field, followed by what can be done with its row.
 */
import type { Json } from '../../shared/engine-request';
import { view as dragView } from '../query/drag';
import { view as rowMenu, type RowMenuState } from './row-menu';
import { text } from './text';
import { canWrite, isIdKey, menuOf, type ColumnNode, type MenuEntry } from './types';

/** The references found for a cell (`relation.follow`): the value refers to one document or several; an `_id` is referred to. */
export interface CellReferences {
  readonly referenced?: 'one' | 'many';
  readonly referencing?: boolean;
}

/** What the menu of a cell is drawn from: its column, its value (absent on an empty cell) and its row. */
export interface CellMenuState extends RowMenuState {
  readonly column: ColumnNode;
  readonly value?: Json;
  /** The path of the expanded array the cell is an element of. */
  readonly within?: string;
  readonly references?: CellReferences;
}

function parentKey(column: ColumnNode): string | undefined {
  return column.path.length > 1 ? column.path.slice(0, -1).join('.') : undefined;
}

function valueEntries(state: CellMenuState): readonly MenuEntry[] {
  const { key } = state.column;
  const editable = canWrite(state.target) && !isIdKey(key) && Object.hasOwn(state.document, '_id');
  return [
    ...(editable
      ? [{ kind: 'entry', label: text.cellMenu.edit, element: 'document.inline-edit@cell-menu' } as const]
      : []),
    ...(state.value === undefined
      ? []
      : [
          {
            kind: 'entry',
            label: text.cellMenu.copyValue,
            tip: text.cellMenu.copyValueTip,
            element: 'table.copy-value@cell-menu',
            args: { value: state.value },
          } as const,
        ]),
    { kind: 'entry', label: text.cellMenu.copyPath, element: 'table.copy-path@cell-menu', args: { key } },
  ];
}

function referenceEntries(state: CellMenuState): readonly MenuEntry[] {
  const references = state.references ?? {};
  if (state.target.mode !== 'find') {
    return [];
  }
  const referenced =
    references.referenced === undefined
      ? []
      : [
          {
            kind: 'entry',
            label: references.referenced === 'one' ? text.cellMenu.openReferenced : text.cellMenu.openReferencedMany,
            element: 'relation.open-referenced@cell-menu',
          } as const,
        ];
  const referencing =
    references.referencing === true && state.column.key === '_id'
      ? [{ kind: 'entry', label: text.cellMenu.findReferencing, element: 'relation.follow@cell-menu' } as const]
      : [];
  return [...referenced, ...referencing];
}

function filterEntries(state: CellMenuState): readonly MenuEntry[] {
  if (state.value === undefined) {
    return [];
  }
  const dragged = {
    kind: 'cell',
    field: state.column.key,
    value: state.value,
    ...(state.within === undefined ? {} : { within: state.within }),
  } as const;
  const zones = dragView({ dragged, texts: { filter: '', sort: '', project: '', skip: '', limit: '' } }).filter;
  const submenu = zones.map((zone): MenuEntry => ({
    kind: 'entry',
    label: zone.label,
    tip: zone.tip,
    element: 'query.add-condition@cell-menu',
    args: { field: state.column.key, condition: zone.action.to === 'filter' ? zone.action.condition : null },
  }));
  return [{ kind: 'entry', label: text.cellMenu.addToFilter, element: 'query.add-condition@cell-menu', submenu }];
}

/** **Expand** and **Expand all levels** of an expandable column, **Collapse** of the column it is under. */
export function expandEntries(column: ColumnNode, place: 'cell-menu' | 'column-menu'): readonly MenuEntry[] {
  const expanded = column.children !== undefined;
  const parent = parentKey(column);
  const expand = place === 'cell-menu' ? 'table.expand@cell-menu' : 'table.expand@column-menu';
  const collapse = place === 'cell-menu' ? 'table.collapse@cell-menu' : 'table.collapse@column-menu';
  return [
    ...(column.expandable && !expanded
      ? [
          { kind: 'entry', label: text.expand.entry(column.key), element: expand, args: { key: column.key } } as const,
          {
            kind: 'entry',
            label: text.expand.allLevels(column.key),
            element: expand,
            args: { key: column.key, allLevels: true },
          } as const,
        ]
      : []),
    ...(expanded
      ? [
          {
            kind: 'entry',
            label: text.expand.collapse(column.key),
            element: collapse,
            args: { key: column.key },
          } as const,
        ]
      : []),
    ...(!expanded && parent !== undefined
      ? [{ kind: 'entry', label: text.expand.collapse(parent), element: collapse, args: { key: parent } } as const]
      : []),
  ];
}

/**
 * Feature: table.cell-menu
 *
 * **Edit value**, **Copy value**, **Copy field path**, the reference entries, **Add to filter**, the expand entries,
 * then those of the row (`table.row-menu`). An empty cell has no **Copy value** and no **Add to filter**.
 */
export function view(state: CellMenuState): readonly MenuEntry[] {
  return menuOf([
    [
      ...valueEntries(state),
      ...referenceEntries(state),
      ...filterEntries(state),
      ...expandEntries(state.column, 'cell-menu'),
    ],
    rowMenu(state),
  ]);
}
