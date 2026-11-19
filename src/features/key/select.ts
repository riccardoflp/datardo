/**
 * Feature: key.select
 *
 * Chooses the keys the next action applies to, and shows what can be done with them. The selection is kept by key
 * name: it survives sorting and **Scan more**; **Refresh**, a new pattern and a new type clear it; a row marked
 * **gone** leaves it. `Ctrl+A` selects the keys loaded, not those the scan has not reached.
 */
import { text } from './text';
import type { KeyName } from './types';
import { hexOf } from './types';

/** The keys selected, by name in hexadecimal, and the row a `Shift` click extends from. */
export interface KeySelection {
  readonly keys: ReadonlySet<string>;
  readonly anchor?: string;
}

/** Nothing selected. */
export const noSelection: KeySelection = { keys: new Set() };

/** What the user does to the selection on the table. */
export type SelectGesture =
  | { readonly kind: 'click'; readonly key: KeyName }
  | { readonly kind: 'toggle'; readonly key: KeyName }
  | { readonly kind: 'extend'; readonly key: KeyName }
  | { readonly kind: 'all' }
  | { readonly kind: 'clear' }
  | { readonly kind: 'gone'; readonly key: KeyName };

function extended(selection: KeySelection, key: string, rows: readonly string[]): KeySelection {
  const from = selection.anchor === undefined ? -1 : rows.indexOf(selection.anchor);
  const to = rows.indexOf(key);
  if (from < 0 || to < 0) {
    return { keys: new Set([key]), anchor: key };
  }
  const [low, high] = from <= to ? [from, to] : [to, from];
  return { keys: new Set(rows.slice(low, high + 1)), anchor: selection.anchor ?? key };
}

/**
 * The selection after a gesture, the rows being the loaded keys in the order of the table: a click selects one row,
 * `Ctrl` and a click adds or removes one, `Shift` and a click extends to it, `Ctrl+A` selects every loaded key, `Esc`
 * clears.
 */
export function selectionAfter(
  selection: KeySelection,
  gesture: SelectGesture,
  rows: readonly KeyName[],
): KeySelection {
  switch (gesture.kind) {
    case 'click': {
      const key = hexOf(gesture.key);
      return { keys: new Set([key]), anchor: key };
    }
    case 'toggle': {
      const key = hexOf(gesture.key);
      const keys = new Set(selection.keys);
      if (!keys.delete(key)) {
        keys.add(key);
      }
      return { keys, anchor: key };
    }
    case 'extend':
      return extended(selection, hexOf(gesture.key), rows.map(hexOf));
    case 'all':
      return {
        keys: new Set(rows.map(hexOf)),
        ...(selection.anchor === undefined ? {} : { anchor: selection.anchor }),
      };
    case 'clear':
      return noSelection;
    case 'gone': {
      const keys = new Set(selection.keys);
      keys.delete(hexOf(gesture.key));
      return { ...selection, keys };
    }
  }
}

/** The selected keys in the order of the table: what the actions on several keys receive. */
export function selectedInOrder(selection: KeySelection, rows: readonly KeyName[]): readonly KeyName[] {
  return rows.filter((row) => selection.keys.has(hexOf(row)));
}

/** What the selection is drawn from. */
export interface SelectState {
  readonly selection: KeySelection;
  /** The loaded keys, in the order of the table. */
  readonly rows: readonly KeyName[];
  readonly readOnly: boolean;
}

/** An entry of the selection bar or of the context menu of a selected row. */
export interface SelectEntry {
  readonly label: string;
  /** The feature it starts, or `clear` for **Clear**. */
  readonly feature: string;
  readonly element?: string;
}

/** What the inspector island shows for the selection. */
export type SelectInspector =
  | { readonly kind: 'none'; readonly title: string; readonly line: string }
  | { readonly kind: 'one'; readonly key: KeyName }
  | { readonly kind: 'several'; readonly title: string; readonly line: string };

/** What is shown: the selection bar while more than one key is selected, the menu of a selected row, the island. */
export interface SelectView {
  readonly count: number;
  readonly bar?: { readonly label: string; readonly entries: readonly SelectEntry[] };
  /** The entries of the context menu of a selected row, in place of those for one key, while several are. */
  readonly rowMenu?: readonly SelectEntry[];
  readonly inspector: SelectInspector;
  /** The selected keys in the order of the table, in hexadecimal: the arguments of the actions. */
  readonly keys: readonly string[];
}

function barEntries(readOnly: boolean): readonly SelectEntry[] {
  return [
    { label: text.select.copyNames, feature: 'key.copy-name', element: 'key.copy-name@selection-bar' },
    { label: text.select.export, feature: 'key.export', element: 'key.export@selection-bar' },
    ...(readOnly
      ? []
      : [{ label: text.select.delete, feature: 'key.delete-selected', element: 'key.delete-selected@selection-bar' }]),
    { label: text.select.clear, feature: 'clear' },
  ];
}

function menuEntries(count: number, readOnly: boolean): readonly SelectEntry[] {
  return [
    { label: text.select.copyCount(count), feature: 'key.copy-name', element: 'key.copy-name@row-menu' },
    { label: text.select.exportCount(count), feature: 'key.export', element: 'key.export@row-menu' },
    ...(readOnly
      ? []
      : [
          {
            label: text.select.deleteCount(count),
            feature: 'key.delete-selected',
            element: 'key.delete-selected@row-menu',
          },
        ]),
  ];
}

function inspectorOf(selected: readonly KeyName[]): SelectInspector {
  const [only] = selected;
  if (selected.length === 1 && only !== undefined) {
    return { kind: 'one', key: only };
  }
  return selected.length === 0
    ? { kind: 'none', title: text.select.nothing, line: text.select.nothingLine }
    : { kind: 'several', title: text.select.several(selected.length), line: text.select.severalLine };
}

/** Feature: key.select — the selection bar, the menu of a selected row and the inspector island, for the selection. */
export function view(state: SelectState): SelectView {
  const selected = selectedInOrder(state.selection, state.rows);
  const count = selected.length;
  return {
    count,
    ...(count > 1
      ? {
          bar: { label: text.select.bar(count), entries: barEntries(state.readOnly) },
          rowMenu: menuEntries(count, state.readOnly),
        }
      : {}),
    inspector: inspectorOf(selected),
    keys: selected.map(hexOf),
  };
}
