/**
 * Feature: tree.show
 *
 * The tree island: what the current connection holds, in three parts — **Pinned** (only while the connection has
 * pinned items), **Databases** (the engine's tree) and **Pages of <name>** — under a header with **Filter**,
 * **Refresh** and **Collapse all**. It always shows the current connection, and nothing connects because it is shown.
 * The nodes do not take the connection's color: the color is on the connection island.
 */
import type { ConnectionView } from '../../shared/connection';
import { connectionState } from '../../shared/state/connections';
import type { TabShows } from '../../shared/state/tabs';
import { view as emptyView, type EmptyTreeView } from '../nav/empty';
import { navInput } from '../nav/types';
import { exclusionOf, type ExcludingConnection } from './excluded';
import { expandedAfterClearing, view as filterView, type FilterView } from './filter';
import * as menuMongodb from './menu-mongodb';
import * as menuRedis from './menu-redis';
import * as mongodb from './mongodb';
import { patternOf } from './namespaces';
import * as nodeStates from './node-states';
import * as pages from './pages';
import * as pinned from './pinned';
import * as redis from './redis';
import { selectedNodes } from './select';
import { text } from './text';
import {
  currentConnection,
  freshIsland,
  hexOf,
  nodeId,
  startControl,
  type Control,
  type MenuEntry,
  type NodeRef,
  type PartName,
  type TreeHeading,
  type TreeInput,
  type TreeIsland,
  type TreeItem,
} from './types';

/** The header of the island: its buttons, and the field of the filter while it is open. */
export interface TreeHeader {
  /** **Filter**, shown as on while a filter applies. */
  readonly filter: Control & { readonly on: boolean };
  readonly refresh: Control;
  readonly collapseAll: Control;
  readonly field?: FilterView;
}

/** What the tree island shows. */
export type TreeIslandView =
  | { readonly kind: 'no-connections'; readonly line: string; readonly add: Control }
  | { readonly kind: 'none-current'; readonly empty: EmptyTreeView }
  | {
      readonly kind: 'tree';
      readonly role: 'tree';
      readonly label: string;
      readonly header: TreeHeader;
      /** Every line shown, in order: the headings of the parts and what is under each one expanded. */
      readonly items: readonly TreeItem[];
    };

function headingOf(input: TreeInput, part: PartName, words: string, buttons: readonly Control[] = []): TreeHeading {
  return {
    kind: 'heading',
    id: nodeId({ kind: 'heading', part }),
    part,
    text: words,
    expanded: !input.island.collapsedParts.includes(part),
    buttons,
    hasMenu: part === 'databases',
  };
}

function connectionLines(input: TreeInput, connection: ConnectionView): readonly TreeItem[] {
  const place = { parent: mongodb.databasesHeading, level: 2 };
  const live = input.state.connections.live[connection.id];
  const connect = startControl(text.connection.connect, 'connection.connect@tree', 'connection.connect', {
    connection: connection.id,
    args: { connection: connection.id },
  });
  switch (connectionState(input.state.connections, connection.id)) {
    case 'not-connected':
      return [
        nodeStates.line(place, 'not-connected', text.connection.notConnected(connection.name), { button: connect }),
      ];
    case 'connecting':
      return [nodeStates.line(place, 'connecting', text.connection.connecting)];
    case 'failed': {
      const retry = { ...connect, label: text.connection.retry };
      return [nodeStates.failedLine(place, live?.reason ?? text.connection.notConnected(connection.name), retry)];
    }
    case 'reconnecting':
      return engineItems(input, connection).map((item) => (item.kind === 'node' ? { ...item, dimmed: true } : item));
    case 'connected':
      return engineItems(input, connection);
  }
}

function engineItems(input: TreeInput, connection: ConnectionView): readonly TreeItem[] {
  return connection.engine === 'mongodb' ? mongodb.view(input, connection) : redis.view(input, connection);
}

function databasesButtons(input: TreeInput, connection: ConnectionView): readonly Control[] {
  if (connection.engine !== 'mongodb' || connection.readOnly || !input.isAvailable('manage.create-database')) {
    return [];
  }
  return [
    startControl(text.header.createDatabase, 'manage.create-database@tree', 'manage.create-database', {
      connection: connection.id,
      args: { connection: connection.id },
    }),
  ];
}

function header(input: TreeInput, connection: ConnectionView): TreeHeader {
  const field = filterView(input, connection.engine);
  const collapseAll: Control =
    connection.engine === 'mongodb'
      ? { kind: 'window', label: text.header.collapseAll, element: 'tree.mongodb@tree', action: 'collapse-all' }
      : { kind: 'window', label: text.header.collapseAll, element: 'tree.redis@tree', action: 'collapse-all' };
  return {
    filter: {
      kind: 'window',
      label: text.header.filter,
      element: 'tree.filter@tree',
      action: 'open-filter',
      on: field.on,
    },
    refresh: startControl(text.header.refresh, 'tree.refresh@tree', 'tree.refresh', {
      connection: connection.id,
      args: { connection: connection.id, scope: { kind: 'connection' } },
    }),
    collapseAll,
    ...(field.open ? { field } : {}),
  };
}

function part(heading: TreeHeading, items: readonly TreeItem[]): readonly TreeItem[] {
  return heading.expanded ? [heading, ...items] : [heading];
}

/** Feature: tree.show — the tree island of the current connection. */
export function view(input: TreeInput): TreeIslandView {
  if (input.state.connections.saved.length === 0) {
    const add: Control = {
      kind: 'start',
      label: text.connection.addConnection,
      element: 'connection.add@tree',
      feature: 'connection.add',
      target: { kind: 'app' },
    };
    return { kind: 'no-connections', line: text.connection.noConnectionsYet, add };
  }
  const connection = currentConnection(input.state);
  if (connection === undefined) {
    const nav = navInput(input.state);
    const empty = emptyView({ ...nav, nav: { ...nav.nav, current: undefined } });
    return empty === undefined
      ? { kind: 'none-current', empty: { kind: 'no-connection-saved', line: '' } }
      : { kind: 'none-current', empty };
  }
  const pins = pinned.view(input);
  const items = [
    ...(pins.length === 0 ? [] : part(headingOf(input, 'pinned', text.parts.pinned), pins)),
    ...part(
      headingOf(input, 'databases', text.parts.databases, databasesButtons(input, connection)),
      connectionLines(input, connection),
    ),
    ...part(headingOf(input, 'pages', pages.heading(connection)), pages.view(input)),
  ];
  return { kind: 'tree', role: 'tree', label: text.island.label, header: header(input, connection), items };
}

function namespaceNode(database: number, prefix: string): string {
  const prefixHex = hexOf(new TextEncoder().encode(prefix));
  return nodeId({ kind: 'namespace', database, prefix, prefixHex, pattern: patternOf(prefix) });
}

/** The node of what a tab shows: its collection, view, bucket, Redis database or namespace; none for a tab of the app. */
export function nodeOfTab(shows: TabShows): string | undefined {
  switch (shows.kind) {
    case 'collection':
    case 'document':
      return `collection:${shows.database}.${shows.collection}`;
    case 'keys':
    case 'key':
      return shows.kind === 'keys' && shows.namespace !== undefined
        ? namespaceNode(shows.database, shows.namespace)
        : nodeId({ kind: 'redis-database', database: shows.database });
    case 'page':
      return shows.page === 'gridfs' && shows.database !== undefined && shows.of?.[0] !== undefined
        ? nodeId({ kind: 'bucket', database: shows.database, name: shows.of[0] })
        : undefined;
    case 'app':
    case 'playground':
    case 'console':
      return undefined;
  }
}

/**
 * The tree island once a tab became active: the node of what it shows is selected alone (nodes selected together
 * before are not any more: `tree.select`), and its database expanded when the database is already loaded; a tab of
 * the app selects nothing.
 */
export function revealedFor(island: TreeIsland, shows: TabShows): TreeIsland {
  const node = nodeOfTab(shows);
  const { selected: _selected, selection: _selection, ...rest } = island;
  if (node === undefined) {
    return rest;
  }
  const database =
    shows.kind === 'collection' || shows.kind === 'document' || shows.kind === 'page' ? shows.database : undefined;
  const loaded = database !== undefined && island.mongodb.contents[database]?.kind === 'loaded';
  const parent = database === undefined ? undefined : nodeId({ kind: 'database', database });
  const expanded =
    loaded && parent !== undefined && !island.expanded.includes(parent)
      ? [...island.expanded, parent]
      : island.expanded;
  return { ...rest, selected: node, expanded };
}

/**
 * The context menu of a line of the tree island: of the heading **Databases**, a node, a pinned item or a page. On one
 * of several nodes selected together among the lines shown (`items`), the menu of all of them (`tree.select`).
 */
export function menuOfItem(input: TreeInput, item: TreeItem, items: readonly TreeItem[] = []): readonly MenuEntry[] {
  if (item.kind === 'line' || !item.hasMenu) {
    return [];
  }
  const connection = currentConnection(input.state);
  const together = selectedNodes(input.island, items);
  if (connection?.engine === 'mongodb' && together.length > 1 && together.some((each) => each.id === item.id)) {
    return menuMongodb.several(
      input,
      together.map((each) => each.ref),
    );
  }
  const ref: NodeRef = item.kind === 'heading' ? { kind: 'heading', part: item.part } : item.ref;
  if (connection === undefined) {
    return [];
  }
  if (ref.kind === 'pin') {
    return pinned.menu(input, ref.pin);
  }
  if (ref.kind === 'page') {
    const page = pages.pagesOf(connection).find((each) => each === ref.page);
    return page === undefined ? [] : pages.menu(input, page);
  }
  return connection.engine === 'redis' ? menuRedis.view(input, ref) : menuMongodb.view(input, ref);
}

/** Whether a node is of the engine's tree, which **Collapse all** collapses. */
function isOfEngine(id: string): boolean {
  return ['database:', 'redis-database:', 'namespace:', 'empty-databases'].some((start) => id.startsWith(start));
}

/** **Collapse all**: every node of the engine's tree collapsed; the parts and what was read stay. */
export function collapsedAll(island: TreeIsland): TreeIsland {
  return { ...island, expanded: island.expanded.filter((id) => !isOfEngine(id)) };
}

const parts: readonly PartName[] = ['pinned', 'databases', 'pages'];

/** A node or a heading expanded or collapsed: a heading is a part of the island, kept per connection. */
export function toggled(island: TreeIsland, item: string, to: 'expand' | 'collapse'): TreeIsland {
  const part = parts.find((each) => nodeId({ kind: 'heading', part: each }) === item);
  if (part !== undefined) {
    const others = island.collapsedParts.filter((each) => each !== part);
    return { ...island, collapsedParts: to === 'collapse' ? [...others, part] : others };
  }
  const others = island.expanded.filter((each) => each !== item);
  return { ...island, expanded: to === 'expand' ? [...others, item] : others };
}

/**
 * The island once the filter's text applies (300 ms after the last key). When it is emptied, the databases the filter
 * showed expanded stay expanded (`tree.filter`).
 */
export function withFilterText(input: TreeInput, typed: string): TreeIsland {
  const { island } = input;
  const emptied = typed.trim() === '' && island.filter.text.trim() !== '';
  const expanded = emptied ? expandedAfterClearing(island, mongodb.expandedByFilter(input)) : island.expanded;
  return { ...island, expanded, filter: { ...island.filter, text: typed } };
}

/**
 * The island of a connection that is no longer connected: what was read is forgotten (the key names seen included),
 * and the nodes expanded, the selection, the parts and the filter stay.
 */
export function withoutReads(island: TreeIsland): TreeIsland {
  return { ...island, mongodb: freshIsland.mongodb, redis: freshIsland.redis };
}

/**
 * The databases the filter needs the collections of: every MongoDB database whose collections are not read yet, but
 * those excluded from searches, whose collections the filter never shows (`tree.excluded`).
 */
export function databasesToList(island: TreeIsland, connection: ExcludingConnection = {}): readonly string[] {
  const loadable = island.mongodb.databases;
  if (island.filter.text.trim() === '' || loadable.kind !== 'loaded') {
    return [];
  }
  return loadable.value
    .map((database) => database.name)
    .filter((name) => (island.mongodb.contents[name]?.kind ?? 'idle') === 'idle')
    .filter((name) => exclusionOf(connection, { kind: 'database', database: name }) !== 'own');
}
