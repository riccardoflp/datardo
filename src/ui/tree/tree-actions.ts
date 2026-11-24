/**
 * What the controls and the keys of the tree island do, as its Views said: a control starts its feature through the
 * bridge from its place, except the reads of the tree itself (`tree.refresh`, **Load more**), whose results the
 * window keeps; the window's own actions (**Collapse all**, the filter) change the island; a key does what
 * `tree.keyboard` says. `Ctrl+click`, `Shift+click`, `Shift+Down`, `Shift+Up` and `Escape` change the nodes selected
 * together (`tree.select`).
 */
import { view as keyboardView, type KeyEffect } from '../../features/tree/keyboard';
import { moveControl } from '../../features/tree/pinned';
import { scopeOf } from '../../features/tree/refresh';
import { isSelectable, selectionAfter } from '../../features/tree/select';
import { collapsedAll, toggled } from '../../features/tree/show';
import { wholeArg, type Control, type TreeInput, type TreeItem } from '../../features/tree/types';
import type { ConnectionId, Place } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { startFeature } from '../shell/intent';
import { loadMoreKeys, refreshTree } from './tree-reads';
import { changeIsland, changeTree, treeOf } from './tree-store';

/** What the actions of the island act on, and the window's parts they move. */
export interface TreeActions {
  readonly state: AppState;
  readonly connection: ConnectionId;
  readonly input: TreeInput;
  readonly items: readonly TreeItem[];
  /** Opens the field of the filter and puts the focus in it. */
  readonly openFilter: () => void;
  /** Empties the field of the filter. */
  readonly clearFilter: () => void;
  /** Opens the context menu of a line, at the line. */
  readonly openMenu: (item: string) => void;
  /** Puts the focus on a line. */
  readonly focusItem: (item: string) => void;
}

/** The place of a control, from its identifier written whole (`tree.refresh@tree`). */
function placeOf(element: string | undefined): Place {
  return element?.endsWith('@tree-menu') === true ? 'tree-menu' : 'tree';
}

/** Starts what a control starts. */
export function press(actions: TreeActions, control: Control): void {
  if (control.kind === 'window') {
    switch (control.action) {
      case 'collapse-all':
        changeIsland(actions.connection, collapsedAll);
        return;
      case 'open-filter':
        actions.openFilter();
        return;
      case 'clear-filter':
        actions.clearFilter();
        return;
    }
  }
  if (control.feature === 'tree.refresh') {
    void refreshTree(actions.state, actions.connection, scopeOf(control.args ?? null));
    return;
  }
  if (control.feature === 'tree.scan-namespaces') {
    loadMoreKeys(actions.connection, wholeArg(control.args ?? null, 'database'));
    return;
  }
  startFeature(control.feature, {
    place: placeOf(control.element),
    target: control.target,
    ...(control.args === undefined ? {} : { args: control.args }),
  });
}

/** Expands or collapses a line; expanding a database reads what it holds when it has not been read yet. */
export function toggle(actions: TreeActions, item: string, to: 'expand' | 'collapse'): void {
  changeIsland(actions.connection, (island) => toggled(island, item, to));
  if (to === 'collapse') {
    return;
  }
  const { island } = treeOf(actions.connection);
  const found = actions.items.find((each) => each.id === item);
  const ref = found?.kind === 'node' ? found.ref : undefined;
  if (ref?.kind === 'database' && (island.mongodb.contents[ref.database]?.kind ?? 'idle') === 'idle') {
    void refreshTree(actions.state, actions.connection, { kind: 'database', database: ref.database });
  }
  if (ref?.kind === 'redis-database' && island.redis.scans[String(ref.database)] === undefined) {
    void refreshTree(actions.state, actions.connection, { kind: 'redis-database', database: ref.database });
  }
}

/** Selects a node of the tree alone: the selection is the island's, kept per connection. */
function select(actions: TreeActions, item: TreeItem): void {
  if (item.kind === 'node') {
    changeIsland(actions.connection, (island) =>
      selectionAfter(island, actions.items, { kind: 'only', item: item.id }),
    );
  }
}

/** A click on the name of a line, or `Enter`: selects a node, then opens what it opens or expands it. */
export function activate(actions: TreeActions, item: TreeItem): void {
  select(actions, item);
  if (item.kind === 'line') {
    if (item.button !== undefined) {
      press(actions, item.button);
    }
    return;
  }
  if (item.kind === 'node' && item.click !== undefined) {
    press(actions, item.click);
    return;
  }
  const expandable = item.kind === 'heading' || item.expandable;
  if (expandable) {
    toggle(actions, item.id, item.expanded ? 'collapse' : 'expand');
  }
}

/**
 * `Ctrl+click` (`toggle`) and `Shift+click` (`range`) on a line: on a node that can be selected with others, the
 * selection changes and nothing opens; on any other line they do what a click does.
 */
export function selectWith(actions: TreeActions, item: TreeItem, how: 'toggle' | 'range'): void {
  if (!isSelectable(item)) {
    activate(actions, item);
    return;
  }
  changeIsland(actions.connection, (island) => selectionAfter(island, actions.items, { kind: how, item: item.id }));
}

/** Carries out what a key does. */
function carryOut(actions: TreeActions, effect: KeyEffect, item: TreeItem | undefined): void {
  switch (effect.kind) {
    case 'focus':
      actions.focusItem(effect.item);
      return;
    case 'expand':
    case 'collapse':
      toggle(actions, effect.item, effect.kind);
      return;
    case 'start':
      if (item !== undefined) {
        select(actions, item);
      }
      press(actions, effect.control);
      return;
    case 'menu':
      actions.openMenu(effect.item);
      return;
    case 'refresh':
      void refreshTree(actions.state, actions.connection, effect.scope);
      return;
    case 'filter':
      actions.openFilter();
      return;
    case 'select': {
      const change = { kind: 'range', item: effect.item, from: effect.from } as const;
      changeIsland(actions.connection, (island) => selectionAfter(island, actions.items, change));
      actions.focusItem(effect.item);
      return;
    }
    case 'escape': {
      const change = { kind: 'escape', item: effect.item } as const;
      changeIsland(actions.connection, (island) => selectionAfter(island, actions.items, change));
      return;
    }
    case 'none':
      return;
  }
}

const named: Readonly<Record<string, string>> = {
  ArrowDown: 'Down',
  ArrowUp: 'Up',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  Enter: 'Enter',
  Escape: 'Escape',
  ' ': 'Space',
  F5: 'F5',
  ContextMenu: 'ContextMenu',
};

/** A key as the cards write it (`Down`, `Shift+F10`, `Ctrl+F`, a letter), or `undefined` for one the tree leaves. */
export function keyOf(event: React.KeyboardEvent): string | undefined {
  if (event.key === 'F10' && event.shiftKey && !event.ctrlKey && !event.altKey) {
    return 'Shift+F10';
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
    return 'Ctrl+F';
  }
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return undefined;
  }
  if (event.shiftKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    return event.key === 'ArrowDown' ? 'Shift+Down' : 'Shift+Up';
  }
  return named[event.key] ?? (/^[\p{L}\p{N}]$/u.test(event.key) ? event.key : undefined);
}

/** `Alt+Up` and `Alt+Down` on a pinned item move it by one place (`nav.pin`). */
function movedPin(actions: TreeActions, event: React.KeyboardEvent, item: TreeItem): Control | undefined {
  const by = event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : undefined;
  if (!event.altKey || event.ctrlKey || event.shiftKey || by === undefined || item.kind !== 'node') {
    return undefined;
  }
  return item.ref.kind === 'pin' ? moveControl(actions.input, item.id, by) : undefined;
}

/** A key pressed on a line of the tree (`tree.keyboard`). */
export function pressKey(actions: TreeActions, event: React.KeyboardEvent, item: TreeItem): void {
  const moved = movedPin(actions, event, item);
  if (moved !== undefined) {
    event.preventDefault();
    press(actions, moved);
    return;
  }
  const key = keyOf(event);
  // `Escape` is the tree's only while nodes are selected together; otherwise it is left to the window.
  if (key === undefined || (key === 'Escape' && treeOf(actions.connection).island.selection === undefined)) {
    return;
  }
  const now = Date.now();
  const result = keyboardView({
    items: actions.items,
    focus: item.id,
    key,
    typed: treeOf(actions.connection).typed,
    now,
  });
  changeTree(actions.connection, (tree) => (tree.typed === result.typed ? tree : { ...tree, typed: result.typed }));
  if (result.effect.kind !== 'none' || key.length > 1) {
    event.preventDefault();
  }
  carryOut(actions, result.effect, item);
}
