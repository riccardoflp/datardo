/**
 * Feature: tab.connection-gone
 *
 * What happens to the tabs when their connection stops being connected, and when it stops being saved. Disconnected,
 * the tabs stay with what they show and the dot of their group becomes a ring, or takes the error color when the
 * connection failed. Removed, every tab of the connection is closed and its group goes, and none is offered by
 * **Reopen closed tab**.
 */
import type { ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { connectionOfShows, type Tab } from '../../shared/state/tabs';
import { dotOf, groupConnections, type Dot } from './groups';

/** The state of the tabs of one connection. */
export interface GoneGroup {
  readonly connection: ConnectionId;
  readonly dot: Dot;
  /** Whether the connection is still saved; the tabs of one that is not are closed. */
  readonly saved: boolean;
  readonly tabs: readonly Tab[];
}

/** Whether a tab shows something of a connection: its own, or one of the two sides of a comparison. */
export function isOfConnection(tab: Tab, connection: ConnectionId): boolean {
  if (connectionOfShows(tab.shows) === connection) {
    return true;
  }
  return tab.shows.kind === 'page' && (tab.shows.of ?? []).some((side) => side.startsWith(`${connection}/`));
}

/** The tabs a removal of a connection closes, in the order of the strip, and those of them with unsaved changes. */
export function closedByRemoval(
  state: AppState,
  connection: ConnectionId,
): { readonly tabs: readonly Tab[]; readonly unsaved: readonly Tab[] } {
  const tabs = state.tabs.tabs.filter((tab) => isOfConnection(tab, connection));
  return { tabs, unsaved: tabs.filter((tab) => tab.unsaved === true) };
}

/**
 * Feature: tab.connection-gone
 *
 * For each connection that has tabs: the dot of its group and whether it is still saved.
 */
export function view(state: AppState): readonly GoneGroup[] {
  const connections = groupConnections(state);
  const order: ConnectionId[] = [];
  for (const tab of state.tabs.tabs) {
    const connection = connectionOfShows(tab.shows);
    if (connection !== undefined && !order.includes(connection)) {
      order.push(connection);
    }
  }
  return order.map((connection) => {
    const saved = connections.find((each) => each.id === connection);
    return {
      connection,
      dot: dotOf(saved?.state ?? 'not-connected'),
      saved: saved !== undefined,
      tabs: state.tabs.tabs.filter((tab) => connectionOfShows(tab.shows) === connection),
    };
  });
}
