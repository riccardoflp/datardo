/**
 * The window's own memory of the tree island of each connection (architecture, "State"): the nodes expanded, the
 * selection, the parts collapsed, the filter and what the tree has read (`TreeIsland`), with the line that had the
 * focus, the scroll position and the letters typed. It is kept until Datardo quits and never saved (`tree.show`,
 * `tree.filter`); the key names a scan saw stay here only (`tree.scan-namespaces`).
 */
import { useSyncExternalStore } from 'react';
import { noTypeAhead, type TypeAhead } from '../../features/tree/keyboard';
import { freshIsland, type TreeIsland } from '../../features/tree/types';
import type { ConnectionId } from '../../shared/ids';

/** What the window keeps of the tree island of one connection. */
export interface WindowTree {
  readonly island: TreeIsland;
  /** The line that had the focus last: `Tab` enters the tree on it. */
  readonly focus?: string;
  readonly typed: TypeAhead;
}

const fresh: WindowTree = { island: freshIsland, typed: noTypeAhead };
const trees = new Map<ConnectionId, WindowTree>();
const scrolls = new Map<ConnectionId, number>();

/** Where the tree island of a connection was scrolled to. */
export function scrollOf(connection: ConnectionId): number {
  return scrolls.get(connection) ?? 0;
}

/** Remembers where the tree island of a connection is scrolled to; nothing is drawn again for it. */
export function rememberScroll(connection: ConnectionId, top: number): void {
  scrolls.set(connection, top);
}
const listeners = new Set<() => void>();

/** The tree island of a connection as the window keeps it. */
export function treeOf(connection: ConnectionId): WindowTree {
  return trees.get(connection) ?? fresh;
}

/** Changes what the window keeps of a connection's tree island, and draws the island again. */
export function changeTree(connection: ConnectionId, change: (tree: WindowTree) => WindowTree): void {
  const before = treeOf(connection);
  const after = change(before);
  if (after === before) {
    return;
  }
  trees.set(connection, after);
  for (const listener of listeners) {
    listener();
  }
}

/** Changes the tree island of a connection. */
export function changeIsland(connection: ConnectionId, change: (island: TreeIsland) => TreeIsland): void {
  changeTree(connection, (tree) => {
    const island = change(tree.island);
    return island === tree.island ? tree : { ...tree, island };
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The tree island of a connection, drawn again whenever it changes. */
export function useTree(connection: ConnectionId | undefined): WindowTree {
  return useSyncExternalStore(subscribe, () => (connection === undefined ? fresh : treeOf(connection)));
}
