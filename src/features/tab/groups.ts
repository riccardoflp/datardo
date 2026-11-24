/**
 * Feature: tab.groups
 *
 * The tabs of one connection stay together, under its name and color: the app's group first, with no label, then one
 * group for each connection that has a tab, in the order in which the groups were first opened. Each tab may take a
 * color of its own, drawn on its icon: that of the collection or the database it was opened on, when it is their own
 * (`tree.color-of`); the connection's color alone is shown by the group.
 */
import type { ColorMap } from '../../shared/color';
import type { ConnectionColor, ConnectionStateName } from '../../shared/connection';
import type { ConnectionId, TabId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import type { Tab, TabShows } from '../../shared/state/tabs';
import { tabConnectionOf } from '../../shared/state/tabs';
import { iconColor, sharedColor, type ColorTarget } from '../tree/color-of';

/** How long the name of a group is before it is cut with `…` (Datardo's choice). */
export const labelLength = 24;

/** The dot of a group: filled when connected, a ring when not, in the error color when failed. */
export type Dot = 'filled' | 'ring' | 'error';

/** A saved connection, as a group needs it. */
export interface GroupConnection {
  readonly id: ConnectionId;
  readonly name: string;
  readonly color?: ConnectionColor;
  readonly databaseColors?: ColorMap;
  readonly collectionColors?: ColorMap;
  readonly state: ConnectionStateName;
}

/** What the groups are drawn with besides the tabs. */
export interface GroupOptions {
  /** The connections whose group is collapsed. */
  readonly collapsed: readonly ConnectionId[];
  readonly active?: TabId | undefined;
  /** The current connection (`nav.current-connection`), whose label is in the stronger text color. */
  readonly current?: ConnectionId | undefined;
}

/** The label of a connection's group. */
export interface GroupLabel {
  /** The name, cut to 24 characters. */
  readonly name: string;
  /** The whole name. */
  readonly fullName: string;
  readonly color?: ConnectionColor;
  readonly dot: Dot;
  readonly current: boolean;
}

/** A group of the strip. */
export interface TabGroup {
  /** The connection; absent for the app's group. */
  readonly connection?: ConnectionId;
  /** Absent for the app's group, which has no label and no color. */
  readonly label?: GroupLabel;
  /** Every tab of the group, in its order. */
  readonly tabs: readonly Tab[];
  /** The tabs drawn: all of them, or for a collapsed group only the active tab when it is one of them. */
  readonly shown: readonly Tab[];
  readonly collapsed: boolean;
  /** The color of each tab that has one, by its id, drawn on its icon. */
  readonly colors: Readonly<Record<TabId, ConnectionColor>>;
}

/** The dot of a connection in a given state. */
export function dotOf(state: ConnectionStateName): Dot {
  switch (state) {
    case 'connected':
      return 'filled';
    case 'failed':
      return 'error';
    case 'not-connected':
    case 'connecting':
    case 'reconnecting':
      return 'ring';
  }
}

/** A name cut to 24 characters, the last of them `…`. */
export function cutName(name: string): string {
  const characters = Array.from(name);
  return characters.length <= labelLength ? name : `${characters.slice(0, labelLength - 1).join('')}…`;
}

/** The saved connections and their states, from the app's state. */
export function groupConnections(state: AppState): readonly GroupConnection[] {
  return state.connections.saved.map((saved) => ({
    id: saved.id,
    name: saved.name,
    ...(saved.color === undefined ? {} : { color: saved.color }),
    ...(saved.databaseColors === undefined ? {} : { databaseColors: saved.databaseColors }),
    ...(saved.collectionColors === undefined ? {} : { collectionColors: saved.collectionColors }),
    state: state.connections.live[saved.id]?.state ?? 'not-connected',
  }));
}

/** The pages of the whole connection, whose tabs take no color of their own whatever they show. */
const connectionPages: ReadonlySet<string> = new Set(['overview', 'monitor', 'users', 'search', 'server', 'pubsub']);

/** A collection named `<database>.<collection>`, as a comparison names its side. */
function sideOf(side: string): ColorTarget | undefined {
  const dot = side.indexOf('.');
  return dot <= 0 ? undefined : { kind: 'collection', database: side.slice(0, dot), collection: side.slice(dot + 1) };
}

/** What a page was opened on, for its color: a bucket, a collection, the sides of a comparison, a database. */
function pageTargets(shows: Extract<TabShows, { kind: 'page' }>): readonly ColorTarget[] {
  const { database, of = [] } = shows;
  if (connectionPages.has(shows.page) || database === undefined) {
    return [];
  }
  const [first] = of;
  switch (shows.page) {
    case 'gridfs':
      return first === undefined ? [] : [{ kind: 'bucket', database, bucket: first }];
    case 'compare':
      return of.flatMap((side) => sideOf(side) ?? []);
    default:
      return first === undefined
        ? [{ kind: 'database', database }]
        : [{ kind: 'collection', database, collection: first }];
  }
}

/** What a tab was opened on, for its color: none for a tab of the app or of the whole connection. */
function targetsOf(shows: TabShows): readonly ColorTarget[] {
  switch (shows.kind) {
    case 'collection':
    case 'document':
      return [{ kind: 'collection', database: shows.database, collection: shows.collection }];
    case 'keys':
    case 'key':
      return [{ kind: 'database', database: shows.database }];
    case 'page':
      return pageTargets(shows);
    case 'app':
    case 'playground':
    case 'console':
      return [];
  }
}

/**
 * The color of a tab, drawn on its icon: the own color of the collection or the database it was opened on, its
 * collection's or its database's; for a comparison the color its sides share, or the only one there is; none for a
 * tab of the app or of the whole connection, and none when the color comes from the connection alone.
 */
export function tabColor(shows: TabShows, connection: GroupConnection | undefined): ConnectionColor | undefined {
  const targets = connection === undefined ? [] : targetsOf(shows);
  return connection === undefined ? undefined : sharedColor(targets.map((target) => iconColor(connection, target)));
}

function colorsOf(
  tabs: readonly Tab[],
  connection: GroupConnection | undefined,
): Readonly<Record<TabId, ConnectionColor>> {
  return Object.fromEntries(
    tabs.flatMap((tab) => {
      const color = tabColor(tab.shows, connection);
      return color === undefined ? [] : [[tab.id, color] as const];
    }),
  );
}

function labelOf(
  connection: ConnectionId,
  connections: readonly GroupConnection[],
  current: ConnectionId | undefined,
): GroupLabel {
  const saved = connections.find((each) => each.id === connection);
  const fullName = saved?.name ?? connection;
  return {
    name: cutName(fullName),
    fullName,
    ...(saved?.color === undefined ? {} : { color: saved.color }),
    dot: dotOf(saved?.state ?? 'not-connected'),
    current: connection === current,
  };
}

/**
 * Feature: tab.groups
 *
 * The groups in order, each with its label and its tabs. The tabs are given in the order of the strip, which keeps
 * the tabs of a connection together and the groups in the order they were opened.
 */
export function groups(
  tabs: readonly Tab[],
  connections: readonly GroupConnection[],
  options: GroupOptions = { collapsed: [] },
): readonly TabGroup[] {
  const order: (ConnectionId | undefined)[] = [];
  for (const tab of tabs) {
    const connection = tabConnectionOf(tab);
    if (!order.includes(connection)) {
      order.push(connection);
    }
  }
  const app = order.includes(undefined) ? [undefined] : [];
  return [...app, ...order.filter((each) => each !== undefined)].map((connection) => {
    const own = tabs.filter((tab) => tabConnectionOf(tab) === connection);
    if (connection === undefined) {
      return { tabs: own, shown: own, collapsed: false, colors: {} };
    }
    const collapsed = options.collapsed.includes(connection);
    return {
      connection,
      label: labelOf(connection, connections, options.current),
      tabs: own,
      shown: collapsed ? own.filter((tab) => tab.id === options.active) : own,
      collapsed,
      colors: colorsOf(
        own,
        connections.find((each) => each.id === connection),
      ),
    };
  });
}
