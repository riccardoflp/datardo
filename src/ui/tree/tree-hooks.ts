/**
 * What the tree island does by itself as time passes and the app's state changes: the clock that shows **Loading…**
 * once a read has taken 200 ms (`tree.node-states`), the reads that start when a connection is connected and are
 * forgotten when it is not (`tree.show`), and the node of the active tab, selected and scrolled into view.
 */
import { useEffect, useRef, useState } from 'react';
import { loadingDelayMs } from '../../features/tree/node-states';
import { revealedFor, nodeOfTab, withoutReads } from '../../features/tree/show';
import type { Loadable, TreeIsland } from '../../features/tree/types';
import type { ConnectionView } from '../../shared/connection';
import type { AppState } from '../../shared/state';
import { connectionState } from '../../shared/state/connections';
import { activeTabOf, connectionOfShows } from '../../shared/state/tabs';
import { refreshTree } from './tree-reads';
import { changeIsland } from './tree-store';

function sinceOf(loadable: Loadable<unknown> | undefined): readonly number[] {
  return loadable?.kind === 'loading' ? [loadable.since] : [];
}

/** When each read of the island in progress started. */
function readsSince(island: TreeIsland): readonly number[] {
  return [
    ...sinceOf(island.mongodb.databases),
    ...Object.values(island.mongodb.contents).flatMap(sinceOf),
    ...sinceOf(island.redis.databases),
    ...Object.values(island.redis.scans).flatMap((scan) => (scan.scanning === undefined ? [] : [scan.scanning.since])),
  ];
}

/**
 * The time the island is drawn at: it moves on when a read in progress reaches 200 ms, so that **Loading…** shows
 * then and not before.
 */
export function useLoadingClock(island: TreeIsland): number {
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const due = readsSince(island)
      .map((since) => since + loadingDelayMs)
      .filter((at) => at > clock);
    if (due.length === 0) {
      return undefined;
    }
    const timer = setTimeout(
      () => {
        setClock(Date.now());
      },
      Math.max(0, Math.min(...due) - Date.now()),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [island, clock]);
  return clock;
}

/**
 * Reads the databases once the current connection is connected and its tree has none, and forgets what was read when
 * it is no longer connected; nothing is read while it reconnects, and nothing connects because the island is shown.
 */
export function useConnectionReads(state: AppState, connection: ConnectionView | undefined, island: TreeIsland): void {
  const live = connection === undefined ? undefined : connectionState(state.connections, connection.id);
  const databases = connection?.engine === 'redis' ? island.redis.databases.kind : island.mongodb.databases.kind;
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });
  const id = connection?.id;
  useEffect(() => {
    if (id === undefined) {
      return;
    }
    if (live === 'connected' && databases === 'idle') {
      void refreshTree(latest.current, id, { kind: 'connection' });
    }
    if ((live === 'not-connected' || live === 'failed') && databases !== 'idle') {
      changeIsland(id, withoutReads);
    }
  }, [id, live, databases]);
}

/**
 * When a tab becomes active, the node of what it shows is selected in its connection's tree, its database expanded
 * when already loaded; a tab of the app selects nothing. `reveal` scrolls the node into view once it is drawn.
 */
export function useActiveTabReveal(
  state: AppState,
  connection: ConnectionView | undefined,
  reveal: (node: string) => void,
): void {
  const active = activeTabOf(state.tabs);
  const before = useRef<string | undefined>(undefined);
  const id = connection?.id;
  const shows = active?.shows;
  const activeId = active?.id;
  useEffect(() => {
    if (activeId === before.current || shows === undefined || id === undefined) {
      return;
    }
    before.current = activeId;
    const of = connectionOfShows(shows);
    if (of !== undefined && of !== id) {
      return;
    }
    changeIsland(id, (island) => revealedFor(island, shows));
    const node = nodeOfTab(shows);
    if (node !== undefined) {
      requestAnimationFrame(() => {
        reveal(node);
      });
    }
  }, [activeId, shows, id, reveal]);
}
