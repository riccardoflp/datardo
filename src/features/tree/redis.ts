/**
 * Feature: tree.redis
 *
 * The databases of a Redis connection and, under each one expanded, the namespaces of its keys. A click on the name
 * of a database or a namespace opens its keys tab, or makes it active; the arrow before the name, or a double click,
 * expands or collapses it without opening anything. Only expanding a database starts a scan.
 */
import type { ConnectionView } from '../../shared/connection';
import { activeTabOf, type TabShows } from '../../shared/state/tabs';
import { isRedisStringProblem, redisFromString } from '../connection/redis-string';
import { setting } from '../settings/read';
import { countText, withSeparators } from './count';
import { appliedFilter, filterNamespaces } from './filter';
import { matches } from './match';
import { namespacesOf, type Namespace } from './namespaces';
import * as nodeStates from './node-states';
import { text } from './text';
import {
  nodeId,
  nodeLabel,
  openControl,
  startControl,
  type RedisDatabase,
  type ScanState,
  type TreeInput,
  type TreeItem,
  type TreeLine,
  type TreeNode,
} from './types';

/** How many namespaces are shown under one node; a last line says how many more there are (Datardo's choice). */
export const mostNamespacesShown = 200;

const databasesHeading = nodeId({ kind: 'heading', part: 'databases' });

/** What the nodes of one connection are built with. */
interface Built {
  readonly input: TreeInput;
  readonly connection: ConnectionView;
  readonly filter: string;
  readonly separator: string;
}

/** The database a Redis connection opens first, from its connection string; 0 when it names none. */
export function firstDatabase(connection: ConnectionView): number {
  const fields = redisFromString(connection.address ?? '');
  return isRedisStringProblem(fields) ? 0 : fields.database;
}

/** The databases listed at the top: those with keys, `db0` and the first one; the others go under one last node. */
export function listedDatabases(
  databases: readonly RedisDatabase[],
  first: number,
): { readonly listed: readonly RedisDatabase[]; readonly empty: readonly RedisDatabase[] } {
  const isListed = (each: RedisDatabase): boolean => each.keys > 0 || each.number === 0 || each.number === first;
  return { listed: databases.filter(isListed), empty: databases.filter((each) => !isListed(each)) };
}

function keysTab(built: Built, database: number, namespace?: string): TabShows {
  return {
    kind: 'keys',
    connection: built.connection.id,
    database,
    separator: built.separator,
    ...(namespace === undefined ? {} : { namespace }),
  };
}

/**
 * The identifier of a click on a database: `key.switch-database` while the active tab shows the keys of another
 * database of the same connection, `key.show` otherwise. Both open the keys tab of the database, or make it active.
 */
function databaseElement(built: Built, database: number): string {
  const shows = activeTabOf(built.input.state.tabs)?.shows;
  const switches =
    (shows?.kind === 'keys' || shows?.kind === 'key') &&
    shows.connection === built.connection.id &&
    shows.database !== database;
  return switches ? 'key.switch-database@tree' : 'key.show@tree';
}

function namespaceNodes(
  built: Built,
  parent: { id: string; database: number; level: number; prefix?: string },
  namespaces: readonly Namespace[],
): readonly TreeItem[] {
  const shown = namespaces.slice(0, mostNamespacesShown);
  const items = shown.flatMap((namespace) => namespaceItems(built, parent, namespace));
  const more = namespaces.length - shown.length;
  if (more <= 0) {
    return items;
  }
  const open = openControl(
    text.redis.moreNamespaces(withSeparators(more)),
    'key.show@tree',
    keysTab(built, parent.database, parent.prefix),
  );
  const place = { parent: parent.id, level: parent.level + 1 };
  return [...items, nodeStates.line(place, 'more', text.redis.moreNamespaces(withSeparators(more)), { button: open })];
}

function namespaceItems(
  built: Built,
  parent: { id: string; database: number; level: number },
  namespace: Namespace,
): readonly TreeItem[] {
  const ref = {
    kind: 'namespace',
    database: parent.database,
    prefix: namespace.prefixText,
    prefixHex: namespace.prefixHex,
    pattern: namespace.pattern,
  } as const;
  const id = nodeId(ref);
  const expandable = namespace.namespaces.length > 0;
  const expanded = expandable && (built.input.island.expanded.includes(id) || built.filter !== '');
  const node: TreeNode = {
    kind: 'node',
    id,
    parent: parent.id,
    level: parent.level + 1,
    ref,
    name: namespace.name,
    icon: 'symbol-namespace',
    after: namespace.countText,
    hover: namespace.pattern,
    dimmed: false,
    expandable,
    expanded,
    selected: built.input.island.selected === id,
    label: nodeLabel({
      name: namespace.name,
      kind: text.kinds.namespace,
      count: text.label.keys(namespace.countText),
      ...(expandable ? { expanded } : {}),
    }),
    click: openControl(namespace.name, 'key.show@tree', keysTab(built, parent.database, namespace.prefixText)),
    buttons: [],
    hasMenu: true,
  };
  const under = { id, database: parent.database, level: parent.level + 1, prefix: namespace.prefixText };
  return expanded ? [node, ...namespaceNodes(built, under, namespace.namespaces)] : [node];
}

function scanLines(
  built: Built,
  database: RedisDatabase,
  state: ScanState,
  under: { readonly namespaces: readonly Namespace[]; readonly level: number },
): readonly TreeLine[] {
  const { namespaces } = under;
  const id = nodeId({ kind: 'redis-database', database: database.number });
  const place = { parent: id, level: under.level + 1 };
  const { scan } = state;
  if (state.scanning !== undefined) {
    return nodeStates.loadingLines(place, state.scanning.since, built.input.now);
  }
  if (state.failed !== undefined) {
    const retry = startControl(text.states.retry, 'tree.node-states@tree', 'tree.refresh', {
      connection: built.connection.id,
      args: { connection: built.connection.id, scope: { kind: 'redis-database', database: database.number } },
    });
    return [nodeStates.failedLine(place, state.failed, retry)];
  }
  const lines: TreeLine[] = [];
  if (scan.ended === 'whole' && scan.keys.length === 0) {
    lines.push(nodeStates.line(place, 'empty', text.states.noKeys));
  } else if (scan.ended !== undefined && namespaces.length === 0 && built.filter === '') {
    lines.push(nodeStates.line(place, 'empty', text.states.noNamespaces));
  }
  if (scan.ended === 'paused') {
    const words = text.states.scanned(withSeparators(scan.keys.length), withSeparators(database.keys));
    const more = startControl(text.states.loadMore, 'tree.scan-namespaces@tree', 'tree.scan-namespaces', {
      connection: built.connection.id,
      args: { connection: built.connection.id, database: database.number, cursor: scan.cursor },
    });
    lines.push(nodeStates.line(place, 'scanned', words, { button: more }));
  }
  return lines;
}

function namespacesOfDatabase(built: Built, state: ScanState | undefined): readonly Namespace[] {
  if (state === undefined) {
    return [];
  }
  const all = namespacesOf(state.scan.keys, built.separator, state.scan.ended === 'whole').namespaces;
  return filterNamespaces(built.filter, all);
}

function databaseItems(built: Built, database: RedisDatabase, level: number): readonly TreeItem[] {
  const id = nodeId({ kind: 'redis-database', database: database.number });
  const name = text.redis.databaseName(database.number);
  const looked = built.input.island.expanded.includes(id);
  const state = looked ? built.input.island.redis.scans[String(database.number)] : undefined;
  const namespaces = namespacesOfDatabase(built, state);
  if (
    built.filter !== '' &&
    !matches(built.filter, { kind: 'redis-database', number: database.number }) &&
    namespaces.length === 0
  ) {
    return [];
  }
  const keys = countText(database.keys);
  const node: TreeNode = {
    kind: 'node',
    id,
    parent: level === 2 ? databasesHeading : nodeId({ kind: 'empty-databases', count: 0 }),
    level,
    ref: { kind: 'redis-database', database: database.number },
    name,
    icon: 'database',
    after: keys,
    hover: text.redis.databaseHover(name, withSeparators(database.keys), withSeparators(database.expires)),
    dimmed: false,
    expandable: true,
    expanded: looked,
    selected: built.input.island.selected === id,
    label: nodeLabel({ name, kind: text.kinds.redisDatabase, count: text.label.keys(keys), expanded: looked }),
    click: openControl(name, databaseElement(built, database.number), keysTab(built, database.number)),
    buttons: [],
    hasMenu: true,
  };
  if (!looked) {
    return [node];
  }
  const under = namespaceNodes(built, { id, database: database.number, level }, namespaces);
  return [node, ...under, ...(state === undefined ? [] : scanLines(built, database, state, { namespaces, level }))];
}

function emptyDatabasesItems(built: Built, empty: readonly RedisDatabase[]): readonly TreeItem[] {
  const shown = empty.flatMap((database) => databaseItems(built, database, 3));
  if (shown.length === 0) {
    return [];
  }
  const ref = { kind: 'empty-databases', count: empty.length } as const;
  const id = nodeId(ref);
  const expanded = built.input.island.expanded.includes(id);
  const name = text.redis.emptyDatabases(empty.length);
  const node: TreeNode = {
    kind: 'node',
    id,
    parent: databasesHeading,
    level: 2,
    ref,
    name,
    icon: 'database',
    dimmed: true,
    expandable: true,
    expanded,
    selected: built.input.island.selected === id,
    label: nodeLabel({ name, kind: text.kinds.emptyDatabases, expanded }),
    buttons: [],
    hasMenu: false,
  };
  return expanded ? [node, ...shown] : [node];
}

/**
 * Feature: tree.redis — what the part **Databases** shows for a connected Redis connection, line by line: the
 * databases with keys, `db0` and the first one, each with its namespaces once expanded; then **<n> empty databases**.
 */
export function view(input: TreeInput, connection: ConnectionView): readonly TreeItem[] {
  const built: Built = {
    input,
    connection,
    filter: appliedFilter(input.island),
    separator: setting(input.state.settings, 'datardo.key.separator'),
  };
  const loadable = input.island.redis.databases;
  const databases =
    loadable.kind === 'loaded' ? loadable.value : loadable.kind === 'loading' ? loadable.previous : undefined;
  const place = { parent: databasesHeading, level: 2 };
  if (databases === undefined) {
    const retry = startControl(text.states.retry, 'tree.node-states@tree', 'tree.refresh', {
      connection: connection.id,
      args: { connection: connection.id, scope: { kind: 'connection' } },
    });
    return nodeStates.view({ place, loadable, now: input.now, retry });
  }
  const { listed, empty } = listedDatabases(databases.databases, firstDatabase(connection));
  const items = [
    ...listed.flatMap((database) => databaseItems(built, database, 2)),
    ...emptyDatabasesItems(built, empty),
  ];
  return items.length === 0 && built.filter !== '' ? [nodeStates.nothingMatches(place, built.filter)] : items;
}
