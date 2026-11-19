/**
 * Feature: table.layout
 *
 * Applies the remembered layout of a collection to the columns found in a page: the hidden columns removed, the
 * others in the order wanted, the pinned top-level columns first, the widths set by hand.
 */
import { leafCount } from './detect-columns';
import type { ColumnLayout, ColumnNode } from './types';

/** The narrowest a column can be made, in px. */
export const narrowestColumn = 40;

/** The columns to draw, and how many of the leading leaves are pinned. */
export interface Arranged {
  readonly columns: readonly ColumnNode[];
  readonly pinned: number;
}

function ordered(nodes: readonly ColumnNode[], layout: ColumnLayout): ColumnNode[] {
  const hidden = new Set(layout.hidden ?? []);
  const rank = new Map((layout.order ?? []).map((key, index) => [key, index]));
  const kept = nodes.flatMap((node): ColumnNode[] => {
    if (hidden.has(node.key)) {
      return [];
    }
    if (node.children === undefined) {
      return [node];
    }
    const children = ordered(node.children, layout);
    return children.length === 0 ? [] : [{ ...node, children }];
  });
  return kept
    .map((node, index) => ({ node, at: rank.get(node.key) ?? rank.size + index }))
    .sort((a, b) => a.at - b.at)
    .map((each) => each.node);
}

/**
 * Feature: table.layout
 *
 * The tree with the hidden columns removed (a group with every child hidden too), siblings in the order of the layout
 * and those not named after them in their natural order, pinned top-level columns first; and how many leaves are
 * pinned. Keys no column has are ignored.
 */
export function arrangedColumns(columns: readonly ColumnNode[], layout: ColumnLayout): Arranged {
  const sorted = ordered(columns, layout);
  const pinned = new Set(layout.pinned ?? []);
  const first = sorted.filter((node) => pinned.has(node.key));
  return {
    columns: [...first, ...sorted.filter((node) => !pinned.has(node.key))],
    pinned: first.reduce((sum, node) => sum + leafCount(node), 0),
  };
}

/** The width of a leaf: the one set by hand, never less than 40 px; `undefined` for the automatic width. */
export function columnWidth(layout: ColumnLayout, key: string): number | undefined {
  const width = layout.widths?.[key];
  return width === undefined ? undefined : Math.max(narrowestColumn, width);
}

function siblingsOf(nodes: readonly ColumnNode[], key: string): readonly ColumnNode[] | undefined {
  if (nodes.some((node) => node.key === key)) {
    return nodes;
  }
  for (const node of nodes) {
    const found = node.children === undefined ? undefined : siblingsOf(node.children, key);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/**
 * The layout with `source` moved before or after `target` among its siblings, `target` counting as the sibling group
 * it is in; next to a pinned top-level column it is pinned, next to one that is not it is unpinned. `undefined` when
 * `target` is not at the level of `source`.
 */
export function movedLayout(
  columns: readonly ColumnNode[],
  layout: ColumnLayout,
  move: { readonly source: string; readonly target: string; readonly after: boolean },
): ColumnLayout | undefined {
  const { source, target, after } = move;
  const siblings = siblingsOf(columns, source);
  const destination = siblings?.find((node) => target === node.key || target.startsWith(`${node.key}.`));
  if (siblings === undefined || destination === undefined || destination.key === source) {
    return undefined;
  }
  const keys = siblings.map((node) => node.key).filter((key) => key !== source);
  keys.splice(keys.indexOf(destination.key) + (after ? 1 : 0), 0, source);
  const order = [...(layout.order ?? []).filter((key) => !keys.includes(key)), ...keys];
  if (siblings !== columns) {
    return { ...layout, order };
  }
  const pinned = new Set(layout.pinned ?? []);
  if (pinned.has(destination.key)) {
    pinned.add(source);
  } else {
    pinned.delete(source);
  }
  return { ...layout, order, pinned: keys.filter((key) => pinned.has(key)) };
}
