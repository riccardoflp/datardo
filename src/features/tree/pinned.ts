/**
 * Feature: tree.pinned
 *
 * The items of the current connection the user pinned (`nav.pin`), at the top of the tree island, in the order
 * `nav.pin` keeps them: each with the icon of its kind, its name and, after it, where it is. The filter of the tree
 * does not hide them, and an item whose collection or key no longer exists stays listed.
 */
import type { Json } from '../../shared/engine-request';
import type { ConnectionId } from '../../shared/ids';
import type { Pin } from '../../shared/state/nav';
import type { TabShows } from '../../shared/state/tabs';
import { hexOfText, isSamePin, textOfHex } from '../nav/pin';
import { pinRunArgs } from '../saved-query/connection-list';
import { setting } from '../settings/read';
import { iconColored, type ColorTarget } from './color-of';
import { text } from './text';
import {
  currentConnection,
  menuOf,
  nodeId,
  nodeLabel,
  openControl,
  startControl,
  type Control,
  type MenuEntry,
  type TreeInput,
  type TreeNode,
} from './types';

/** The heading **Pinned**, which the items are under. */
const pinnedHeading = nodeId({ kind: 'heading', part: 'pinned' });

/** The name of a pinned item and where it is: `orders` in `shop`, `orders:` in `db0`; a page is nowhere. */
export function nameAndPlace(pin: Pin): { readonly name: string; readonly place?: string } {
  switch (pin.kind) {
    case 'collection':
      return { name: pin.collection, place: pin.database };
    case 'namespace':
      return { name: pin.namespace, place: `db${String(pin.database)}` };
    case 'key':
      return { name: textOfHex(pin.keyHex), place: `db${String(pin.database)}` };
    case 'saved-query':
      return { name: pin.name, place: `${pin.database}.${pin.collection}` };
    case 'page':
      return { name: pin.title };
  }
}

function iconOf(pin: Pin): string {
  switch (pin.kind) {
    case 'collection':
      return pin.view === true ? 'eye' : 'table';
    case 'namespace':
      return 'symbol-namespace';
    case 'key':
      return 'key';
    case 'saved-query':
      return 'bookmark';
    case 'page':
      return 'browser';
  }
}

/** What gives a pinned item its color: its collection, or its database for a namespace or a key; a page has none. */
function colorTargetOf(pin: Pin): ColorTarget | undefined {
  switch (pin.kind) {
    case 'collection':
    case 'saved-query':
      return { kind: 'collection', database: pin.database, collection: pin.collection };
    case 'namespace':
    case 'key':
      return { kind: 'database', database: pin.database };
    case 'page':
      return undefined;
  }
}

/** What a pinned item opens, as a tab shows it; a saved query opens through its own area. */
function showsOf(pin: Pin, connection: ConnectionId, separator: string): TabShows | undefined {
  switch (pin.kind) {
    case 'collection':
      return {
        kind: 'collection',
        connection,
        database: pin.database,
        collection: pin.collection,
        ...(pin.view === true ? { view: true } : {}),
      };
    case 'namespace':
      return { kind: 'keys', connection, database: pin.database, namespace: pin.namespace, separator };
    case 'key': {
      const key = textOfHex(pin.keyHex);
      const exact = hexOfText(key) === pin.keyHex ? {} : { keyHex: pin.keyHex };
      return { kind: 'key', connection, database: pin.database, key, separator, ...exact };
    }
    case 'page':
      return {
        kind: 'page',
        connection,
        page: pin.page,
        title: pin.title,
        ...(pin.database === undefined ? {} : { database: pin.database }),
      };
    case 'saved-query':
      return undefined;
  }
}

/** What a click on a pinned item, and **Open** in its menu, do. */
function openOf(
  input: TreeInput,
  connection: ConnectionId,
  pin: Pin,
  element: 'tree.pinned@tree' | 'tree.pinned@tree-menu',
): Control {
  const { name } = nameAndPlace(pin);
  const label = element === 'tree.pinned@tree' ? name : text.menu.open;
  const shows = showsOf(pin, connection, setting(input.state.settings, 'datardo.key.separator'));
  if (shows !== undefined) {
    // A click on a pinned key is `key.open`'s entry point in the tree, as one on a pinned namespace is `key.show`'s.
    return openControl(label, element === 'tree.pinned@tree' && pin.kind === 'key' ? 'key.open@tree' : element, shows);
  }
  // A click on a pinned saved query is `saved-query.run`'s entry point in the tree.
  return startControl(label, element === 'tree.pinned@tree' ? 'saved-query.run@tree' : element, 'saved-query.run', {
    connection,
    args: pin.kind === 'saved-query' ? pinRunArgs(connection, pin) : { connection },
  });
}

/** **Pin** or **Unpin** (`nav.pin`), in the context menu of a node of the tree. */
export function pinControl(connection: ConnectionId, pin: Pin, pins: readonly Pin[]): Control {
  const pinned = pins.some((each) => isSamePin(each, pin));
  return startControl(pinned ? text.menu.unpin : text.menu.pin, 'nav.pin@tree-menu', 'nav.pin', {
    connection,
    args: { action: pinned ? 'unpin' : 'pin', connection, pin: pin as unknown as Json },
  });
}

/**
 * Moving a pinned item (`nav.pin`) from the tree: dragged onto another pinned item, it takes that item's place;
 * `Alt+Up` and `Alt+Down` move it by one. Nothing when it would not move, or the lines are not pinned items.
 */
export function moveControl(
  input: TreeInput,
  item: string,
  onto: { readonly item: string } | 'up' | 'down',
): Control | undefined {
  const connection = currentConnection(input.state);
  const pins = pinsOf(input);
  const placeOf = (id: string): number => pins.findIndex((pin) => nodeId({ kind: 'pin', pin }) === id);
  const from = placeOf(item);
  const to = onto === 'up' ? from - 1 : onto === 'down' ? from + 1 : placeOf(onto.item);
  const pin = pins[from];
  if (connection === undefined || pin === undefined || to < 0 || to >= pins.length || to === from) {
    return undefined;
  }
  return startControl(text.menu.move, 'nav.pin@tree', 'nav.pin', {
    connection: connection.id,
    args: { action: 'move', connection: connection.id, pin: pin as unknown as Json, to },
  });
}

/** The pins of the current connection, in their order. */
export function pinsOf(input: TreeInput): readonly Pin[] {
  const connection = currentConnection(input.state);
  return connection === undefined ? [] : (input.state.nav.pins[connection.id] ?? []);
}

/**
 * Feature: tree.pinned — the nodes of the part **Pinned**, in the order `nav.pin` keeps them; none, heading included,
 * when the connection has no pinned item.
 */
export function view(input: TreeInput): readonly TreeNode[] {
  const connection = currentConnection(input.state);
  if (connection === undefined) {
    return [];
  }
  return pinsOf(input).map((pin): TreeNode => {
    const { name, place } = nameAndPlace(pin);
    const id = nodeId({ kind: 'pin', pin });
    const target = colorTargetOf(pin);
    return {
      kind: 'node',
      id,
      parent: pinnedHeading,
      level: 2,
      ref: { kind: 'pin', pin },
      name,
      icon: iconOf(pin),
      ...(target === undefined ? {} : iconColored(connection, target)),
      ...(place === undefined ? {} : { after: place }),
      dimmed: false,
      expandable: false,
      expanded: false,
      selected: input.island.selected === id,
      label: nodeLabel({ name, kind: text.kinds.pin, ...(place === undefined ? {} : { count: place }) }),
      click: openOf(input, connection.id, pin, 'tree.pinned@tree'),
      buttons: [],
      hasMenu: true,
    };
  });
}

/** The context menu of a pinned item: **Open** and **Unpin**. */
export function menu(input: TreeInput, pin: Pin): readonly MenuEntry[] {
  const connection = currentConnection(input.state);
  if (connection === undefined) {
    return [];
  }
  return menuOf([
    [openOf(input, connection.id, pin, 'tree.pinned@tree-menu'), pinControl(connection.id, pin, pinsOf(input))],
  ]);
}
