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
import { view as filterView, type FilterView } from './filter';
import * as mongodb from './mongodb';
import { patternOf } from './namespaces';
import * as nodeStates from './node-states';
import * as pages from './pages';
import * as pinned from './pinned';
import * as redis from './redis';
import { text } from './text';
import {
  currentConnection,
  hexOf,
  nodeId,
  startControl,
  type Control,
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
 * The tree island once a tab became active: the node of what it shows is selected, and its database expanded when
 * the database is already loaded; a tab of the app selects nothing.
 */
export function revealedFor(island: TreeIsland, shows: TabShows): TreeIsland {
  const node = nodeOfTab(shows);
  if (node === undefined) {
    const { selected: _selected, ...rest } = island;
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
  return { ...island, selected: node, expanded };
}
