/**
 * Feature: connection.menu — the entries offered on a saved connection, the same wherever the connection is shown: on
 * its card of the Home page (`@home`), on its line of the connection switcher (`@connection-switcher`) and on the
 * connection island (`@connection-island`).
 *
 * The entries of the undo history (M11) join the third group with their cards.
 */
import type { ConnectionStateName, ConnectionView } from '../../shared/connection';
import type { ConnectionId } from '../../shared/ids';
import { connectionState, savedConnection, type ConnectionsState } from '../../shared/state/connections';
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
  duplicate: {
    home: 'connection.duplicate@home',
    'connection-switcher': 'connection.duplicate@connection-switcher',
    'connection-island': 'connection.duplicate@connection-island',
  },
  copyString: {
    home: 'connection.copy-string@home',
    'connection-switcher': 'connection.copy-string@connection-switcher',
    'connection-island': 'connection.copy-string@connection-island',
  },
  moveToFolder: {
    home: 'connection.move-to-folder@home',
    'connection-switcher': 'connection.move-to-folder@connection-switcher',
    'connection-island': 'connection.move-to-folder@connection-island',
  },
  setColor: {
    home: 'connection.set-color@home',
    'connection-switcher': 'connection.set-color@connection-switcher',
    'connection-island': 'connection.set-color@connection-island',
  },
  linkRedis: {
    home: 'connection.link-redis@home',
    'connection-switcher': 'connection.link-redis@connection-switcher',
    'connection-island': 'connection.link-redis@connection-island',
  },
  unlinkRedis: {
    home: 'connection.unlink-redis@home',
    'connection-switcher': 'connection.unlink-redis@connection-switcher',
    'connection-island': 'connection.unlink-redis@connection-island',
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

/** The third group: folder, color, read-only, and for MongoDB the redis-oplog link. */
function organizeEntries(
  connections: ConnectionsState,
  connection: ConnectionView,
  place: MenuPlace,
): readonly MenuEntry[] {
  const linked =
    connection.publishesTo === undefined ? undefined : savedConnection(connections, connection.publishesTo);
  return [
    item(menuText.moveToFolder, 'connection.move-to-folder', elements.moveToFolder[place]),
    item(menuText.setColor, 'connection.set-color', elements.setColor[place]),
    connection.readOnly
      ? item(menuText.allowChanges, 'connection.allow-changes', elements.allowChanges[place])
      : item(menuText.readOnly, 'connection.read-only', elements.readOnly[place]),
    ...(connection.engine === 'mongodb'
      ? [item(menuText.linkRedis, 'connection.link-redis', elements.linkRedis[place])]
      : []),
    ...(connection.engine === 'mongodb' && connection.publishesTo !== undefined
      ? [
          item(
            menuText.unlink(linked?.name ?? connection.publishesTo),
            'connection.unlink-redis',
            elements.unlinkRedis[place],
          ),
        ]
      : []),
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
      item(menuText.duplicate, 'connection.duplicate', elements.duplicate[place]),
      item(menuText.copyString, 'connection.copy-string', elements.copyString[place]),
      separator,
      ...organizeEntries(state.connections, connection, place),
      separator,
      item(menuText.remove, 'connection.remove', elements.remove[place]),
    ],
  };
}
