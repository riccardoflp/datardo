/**
 * Feature: connection.menu — the entries offered on a saved connection, the same wherever the connection is shown: on
 * its card of the Home page (`@home`), on its line of the connection switcher (`@connection-switcher`) and on the
 * connection island (`@connection-island`).
 *
 * The entries of cards not built yet join the menu with them, in the place the card gives: **Duplicate** and **Copy
 * connection string** after **Edit connection…**, **Move to folder…**, **Set color…**, the redis-oplog link (M7) and the
 * undo history (M11) in the third group.
 */
import type { ConnectionStateName, ConnectionView } from '../../shared/connection';
import type { ConnectionId } from '../../shared/ids';
import { connectionState, type ConnectionsState } from '../../shared/state/connections';
import { menuText } from './text';

/** The places the menu is drawn in. */
export type MenuPlace = 'home' | 'connection-switcher' | 'connection-island';

/** An entry: its text, the feature it starts on the connection, and the element of its control in this place. */
export interface MenuItem {
  readonly kind: 'item';
  readonly label: string;
  readonly feature: string;
  readonly element: string;
}

/** An entry, or the line between two groups. */
export type MenuEntry = MenuItem | { readonly kind: 'separator' };

/** The menu of one connection. */
export interface MenuView {
  readonly label: string;
  /** The `…` button that opens it, and the menu itself, in this place. */
  readonly element: string;
  readonly connection: ConnectionId;
  readonly entries: readonly MenuEntry[];
}

type Elements = Readonly<Record<MenuPlace, string>>;

/** The elements of each entry, by place, each written whole (R10.3). */
const elements = {
  menu: {
    home: 'connection.menu@home',
    'connection-switcher': 'connection.menu@connection-switcher',
    'connection-island': 'connection.menu@connection-island',
  },
  connect: {
    home: 'connection.connect@home',
    'connection-switcher': 'connection.connect@connection-switcher',
    'connection-island': 'connection.connect@connection-island',
  },
  disconnect: {
    home: 'connection.disconnect@home',
    'connection-switcher': 'connection.disconnect@connection-switcher',
    'connection-island': 'connection.disconnect@connection-island',
  },
  reconnect: {
    home: 'connection.reconnect@home',
    'connection-switcher': 'connection.reconnect@connection-switcher',
    'connection-island': 'connection.reconnect@connection-island',
  },
  overview: {
    home: 'connection.overview@home',
    'connection-switcher': 'connection.overview@connection-switcher',
    'connection-island': 'connection.overview@connection-island',
  },
  edit: {
    home: 'connection.edit@home',
    'connection-switcher': 'connection.edit@connection-switcher',
    'connection-island': 'connection.edit@connection-island',
  },
  readOnly: {
    home: 'connection.read-only@home',
    'connection-switcher': 'connection.read-only@connection-switcher',
    'connection-island': 'connection.read-only@connection-island',
  },
  allowChanges: {
    home: 'connection.allow-changes@home',
    'connection-switcher': 'connection.allow-changes@connection-switcher',
    'connection-island': 'connection.allow-changes@connection-island',
  },
  remove: {
    home: 'connection.remove@home',
    'connection-switcher': 'connection.remove@connection-switcher',
    'connection-island': 'connection.remove@connection-island',
  },
} as const satisfies Readonly<Record<string, Elements>>;

const separator: MenuEntry = { kind: 'separator' };

function item(label: string, feature: string, element: string): MenuEntry {
  return { kind: 'item', label, feature, element };
}

/** The first group: connect, disconnect or reconnect as the state allows, and **Open overview**. */
function stateEntries(state: ConnectionStateName, place: MenuPlace): readonly MenuEntry[] {
  const connected = state === 'connected' || state === 'connecting' || state === 'reconnecting';
  const lost = state === 'reconnecting' || state === 'failed';
  return [
    connected
      ? item(menuText.disconnect, 'connection.disconnect', elements.disconnect[place])
      : item(menuText.connect, 'connection.connect', elements.connect[place]),
    ...(lost ? [item(menuText.reconnect, 'connection.reconnect', elements.reconnect[place])] : []),
    item(menuText.overview, 'connection.overview', elements.overview[place]),
  ];
}

/**
 * Feature: connection.menu — the entries of the menu of a connection in a place, in the order of the card, with a
 * line between the groups.
 */
export function view(state: {
  readonly connections: ConnectionsState;
  readonly connection: ConnectionView;
  readonly place: MenuPlace;
}): MenuView {
  const { connection, place } = state;
  return {
    label: menuText.label(connection.name),
    element: elements.menu[place],
    connection: connection.id,
    entries: [
      ...stateEntries(connectionState(state.connections, connection.id), place),
      separator,
      item(menuText.edit, 'connection.edit', elements.edit[place]),
      separator,
      connection.readOnly
        ? item(menuText.allowChanges, 'connection.allow-changes', elements.allowChanges[place])
        : item(menuText.readOnly, 'connection.read-only', elements.readOnly[place]),
      separator,
      item(menuText.remove, 'connection.remove', elements.remove[place]),
    ],
  };
}
