/**
 * Feature: table.columns
 *
 * The **Columns** panel, where the columns of a collection are hidden, shown, reordered and pinned, and its button in
 * the toolbar of the Documents section.
 */
import { arrangedColumns } from './layout';
import { text } from './text';
import type { ColumnLayout, ColumnNode } from './types';

/** What the button and the panel are drawn from: the columns of the page, the layout, the search typed. */
export interface ColumnsState {
  readonly columns: readonly ColumnNode[];
  readonly layout: ColumnLayout;
  readonly search: string;
}

/** A row of the panel. */
export interface ColumnsRow {
  readonly key: string;
  /** The last name of the path: `city` for `address.city`. */
  readonly name: string;
  /** 0 for a top-level column, 1 for a child of it, and so on. */
  readonly depth: number;
  /** Ticked: the column is shown. */
  readonly shown: boolean;
  /** For a top-level column: whether it is pinned, and the tooltip of its pin button. */
  readonly pin?: { readonly pinned: boolean; readonly tip: string };
}

/** What the button and the panel show. */
export interface ColumnsView {
  readonly button: { readonly label: string; readonly element: string };
  readonly search: { readonly placeholder: string; readonly text: string };
  readonly showAll: { readonly label: string; readonly tip: string; readonly element: string };
  readonly reset: { readonly label: string; readonly tip: string; readonly element: string };
  readonly rows: readonly ColumnsRow[];
  /** Rows are dragged to move their columns, but not while a search is typed. */
  readonly draggable: boolean;
  /** *No columns*, when the page has none or the search matches none. */
  readonly empty?: string;
}

function rowsOf(nodes: readonly ColumnNode[], layout: ColumnLayout, depth: number): ColumnsRow[] {
  const hidden = new Set(layout.hidden ?? []);
  const pinned = new Set(layout.pinned ?? []);
  return nodes.flatMap((node) => {
    const name = node.path[node.path.length - 1] ?? node.key;
    const pin =
      depth === 0
        ? {
            pin: {
              pinned: pinned.has(node.key),
              tip: pinned.has(node.key) ? text.columns.unpinTip : text.columns.pinTip,
            },
          }
        : {};
    const row: ColumnsRow = { key: node.key, name, depth, shown: !hidden.has(node.key), ...pin };
    return [row, ...rowsOf(node.children ?? [], layout, depth + 1)];
  });
}

function matching(rows: readonly ColumnsRow[], search: string): readonly ColumnsRow[] {
  const wanted = search.trim().toLowerCase();
  if (wanted === '') {
    return rows;
  }
  const found = rows.filter((row) => row.name.toLowerCase().includes(wanted));
  return rows.filter((row) => found.some((each) => each.key === row.key || each.key.startsWith(`${row.key}.`)));
}

/** How many columns of the page are hidden. */
export function hiddenCount(columns: readonly ColumnNode[], layout: ColumnLayout): number {
  const keys = new Set(rowsOf(columns, {}, 0).map((row) => row.key));
  return (layout.hidden ?? []).filter((key) => keys.has(key)).length;
}

/**
 * Feature: table.columns
 *
 * The button, **Columns (2 hidden)** while columns of the page are hidden; the panel: the search box, **Show all**,
 * **Reset**, and one row per column of the page in the order of the table, children indented, those matching the
 * search with the columns they are under.
 */
export function view(state: ColumnsState): ColumnsView {
  const hidden = hiddenCount(state.columns, state.layout);
  const ordered = arrangedColumns(state.columns, { ...state.layout, hidden: [] }).columns;
  const rows = matching(rowsOf(ordered, state.layout, 0), state.search);
  return {
    button: {
      label: hidden === 0 ? text.columns.button : text.columns.hidden(hidden),
      element: 'table.columns@toolbar',
    },
    search: { placeholder: text.columns.search, text: state.search },
    showAll: { label: text.columns.showAll, tip: text.columns.showAllTip, element: 'table.arrange-columns@list' },
    reset: { label: text.columns.reset, tip: text.columns.resetTip, element: 'table.arrange-columns@list' },
    rows,
    draggable: state.search.trim() === '',
    ...(rows.length === 0 ? { empty: text.columns.none } : {}),
  };
}
