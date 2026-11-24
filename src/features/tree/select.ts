/**
 * Feature: tree.select
 *
 * Several databases, collections, views and GridFS buckets of a MongoDB connection selected together, with
 * `Ctrl+click`, `Shift+click`, `Shift+Down` and `Shift+Up`, to exclude them from searches, or include them again,
 * together (`tree.exclude-from-searches`). The headings, the lines that are not nodes, the pinned items, the pages and
 * the nodes of a Redis connection are selected one at a time: `Ctrl+click` and `Shift+click` on them do what a click
 * does. The selection is the island's, kept per connection until Datardo quits; a node that stops being shown leaves
 * it.
 */
import type { TreeInput, TreeIsland, TreeItem, TreeNode } from './types';

/** How the selection changes. */
export type SelectionChange =
  /** A click, `Enter`, `Escape`, a tab that becomes active: that node alone, which becomes the anchor. */
  | { readonly kind: 'only'; readonly item: string }
  /** `Ctrl+click`: that node added, or removed when it was selected; it becomes the anchor. */
  | { readonly kind: 'toggle'; readonly item: string }
  /** `Shift+click`, `Shift+Down`, `Shift+Up`: every node shown from the anchor to that one, in the order of the tree. */
  | { readonly kind: 'range'; readonly item: string; readonly from?: string }
  /** `Escape`: with several nodes selected, the node with the focus alone; nothing changes otherwise. */
  | { readonly kind: 'escape'; readonly item: string };

/** Whether a line can be selected together with others: a database, a collection, a view or a bucket of MongoDB. */
export function isSelectable(item: TreeItem | undefined): item is TreeNode {
  return (
    item?.kind === 'node' &&
    (item.ref.kind === 'database' || item.ref.kind === 'collection' || item.ref.kind === 'bucket')
  );
}

/** Whether a node is selected. */
export function isSelected(island: TreeIsland, id: string): boolean {
  return island.selection === undefined ? island.selected === id : island.selection.includes(id);
}

/** The nodes selected among those shown, in the order of the tree. */
export function selectedNodes(island: TreeIsland, items: readonly TreeItem[]): readonly TreeNode[] {
  return items.filter((item): item is TreeNode => item.kind === 'node' && isSelected(island, item.id));
}

function only(island: TreeIsland, item: string): TreeIsland {
  const { selection: _selection, ...rest } = island;
  return island.selected === item && island.selection === undefined ? island : { ...rest, selected: item };
}

function shownSelectable(items: readonly TreeItem[]): readonly string[] {
  return items.filter(isSelectable).map((item) => item.id);
}

function toggled(island: TreeIsland, items: readonly TreeItem[], item: string): TreeIsland {
  const shown = shownSelectable(items);
  const now = selectedNodes(island, items)
    .map((node) => node.id)
    .filter((id) => shown.includes(id));
  const selection = now.includes(item) ? now.filter((id) => id !== item) : [...now, item];
  return { ...island, selected: item, selection: shown.filter((id) => selection.includes(id)) };
}

function ranged(island: TreeIsland, items: readonly TreeItem[], change: { item: string; from?: string }): TreeIsland {
  const shown = shownSelectable(items);
  const anchor = [island.selected, change.from].find((id) => id !== undefined && shown.includes(id));
  const to = shown.indexOf(change.item);
  if (anchor === undefined) {
    return only(island, change.item);
  }
  const from = shown.indexOf(anchor);
  const selection = shown.slice(Math.min(from, to), Math.max(from, to) + 1);
  return { ...island, selected: anchor, selection };
}

/**
 * The island once the selection changed. `items` are the lines shown, in order: only the selectable nodes among them
 * are selected together; on any other line, `Ctrl+click` and `Shift+click` select it alone, as a click does.
 */
export function selectionAfter(island: TreeIsland, items: readonly TreeItem[], change: SelectionChange): TreeIsland {
  const target = items.find((each) => each.id === change.item);
  switch (change.kind) {
    case 'only':
      return only(island, change.item);
    case 'escape':
      return island.selection === undefined ? island : only(island, change.item);
    case 'toggle':
      return isSelectable(target) ? toggled(island, items, change.item) : only(island, change.item);
    case 'range':
      return isSelectable(target) ? ranged(island, items, change) : only(island, change.item);
  }
}

/** The island without the nodes selected together that are no longer shown; the same island when all are. */
export function withShownSelection(island: TreeIsland, items: readonly TreeItem[]): TreeIsland {
  if (island.selection === undefined) {
    return island;
  }
  const shown = new Set(shownSelectable(items));
  const kept = island.selection.filter((id) => shown.has(id));
  return kept.length === island.selection.length ? island : { ...island, selection: kept };
}

/** What the tree says of its selection. */
export interface SelectView {
  /** Whether several nodes can be selected (`aria-multiselectable`): on a MongoDB connection. */
  readonly multiselectable: boolean;
  /** The nodes selected, in the order of the tree. */
  readonly selected: readonly TreeNode[];
}

/** Feature: tree.select — whether the tree can have several nodes selected, and which are. */
export function view(input: TreeInput, items: readonly TreeItem[], engine: 'mongodb' | 'redis'): SelectView {
  return { multiselectable: engine === 'mongodb', selected: selectedNodes(input.island, items) };
}
