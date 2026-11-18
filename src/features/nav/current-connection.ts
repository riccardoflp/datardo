/**
 * Feature: nav.current-connection
 *
 * Which connection the explorer shows: the connection of the active tab; for a tab of the app, the connection made
 * current last while it is still saved; otherwise none. Being current says nothing about being connected.
 */
import type { ConnectionId } from '../../shared/ids';
import { findConnection, tabConnection, type NavInput, type SavedConnection, type TabShows } from './types';

/** The current connection, by the rules of the card, in order. */
export function currentConnection(
  activeTab: TabShows | undefined,
  lastCurrent: ConnectionId | undefined,
  connections: readonly SavedConnection[],
): SavedConnection | undefined {
  const ofTab = activeTab === undefined ? undefined : tabConnection(activeTab);
  if (ofTab !== undefined) {
    return findConnection(connections, ofTab);
  }
  return findConnection(connections, lastCurrent);
}

/** The current connection in a nav input. */
export function currentOf(input: NavInput): SavedConnection | undefined {
  return currentConnection(input.activeTab, input.nav.current, input.connections);
}
