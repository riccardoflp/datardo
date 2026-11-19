/**
 * Feature: tree.menu-redis
 *
 * The context menu of the heading **Databases**, a database and a namespace of a Redis tree. Each entry starts a
 * feature of another area with the database, and for a namespace its pattern as `tree.namespaces` gives it. An entry
 * is shown only when its feature is built; on a read-only connection **New key…**, **Import keys…** and **Delete keys
 * by pattern…** are not shown. The node **<n> empty databases** has no menu.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { TabShows } from '../../shared/state/tabs';
import { setting } from '../settings/read';
import { pinControl, pinsOf } from './pinned';
import { text } from './text';
import {
  currentConnection,
  menuOf,
  openControl,
  startControl,
  type Control,
  type MenuEntry,
  type NodeRef,
  type TreeInput,
} from './types';

/** What the entries of one menu are built with. */
interface Built {
  readonly input: TreeInput;
  readonly connection: ConnectionView;
}

function entry(
  built: Built,
  label: string,
  ids: { readonly element: string; readonly feature: string },
  more: { readonly args: Json; readonly writes?: boolean },
): readonly Control[] {
  if ((more.writes === true && built.connection.readOnly) || !built.input.isAvailable(ids.feature)) {
    return [];
  }
  return [startControl(label, ids.element, ids.feature, { connection: built.connection.id, args: more.args })];
}

function refresh(built: Built, scope: Json): readonly Control[] {
  return entry(
    built,
    text.menu.refresh,
    { element: 'tree.refresh@tree-menu', feature: 'tree.refresh' },
    {
      args: { connection: built.connection.id, scope },
    },
  );
}

function openKeys(built: Built, database: number, namespace?: string): readonly Control[] {
  const shows: TabShows = {
    kind: 'keys',
    connection: built.connection.id,
    database,
    separator: setting(built.input.state.settings, 'datardo.key.separator'),
    ...(namespace === undefined ? {} : { namespace }),
  };
  return built.input.isAvailable('tab.open') ? [openControl(text.menu.openKeys, 'key.show@tree-menu', shows)] : [];
}

function headingMenu(built: Built): readonly MenuEntry[] {
  const collapseAll: Control = {
    kind: 'window',
    label: text.menu.collapseAll,
    element: 'tree.menu-redis@tree-menu',
    action: 'collapse-all',
  };
  return menuOf([
    entry(
      built,
      text.menu.openConsole,
      { element: 'tree.menu-redis@tree-menu', feature: 'console.show' },
      {
        args: { connection: built.connection.id },
      },
    ),
    [...refresh(built, { kind: 'connection' }), collapseAll],
  ]);
}

function databaseMenu(built: Built, database: number): readonly MenuEntry[] {
  const args = { connection: built.connection.id, database };
  return menuOf([
    [
      ...openKeys(built, database),
      ...entry(
        built,
        text.menu.openConsoleHere,
        { element: 'tree.menu-redis@tree-menu', feature: 'console.show' },
        { args },
      ),
    ],
    entry(built, text.menu.newKey, { element: 'key.new@tree-menu', feature: 'key.new' }, { args, writes: true }),
    [
      ...entry(
        built,
        text.menu.importKeys,
        { element: 'key.import@tree-menu', feature: 'key.import' },
        { args, writes: true },
      ),
      ...entry(built, text.menu.exportKeys, { element: 'key.export@tree-menu', feature: 'key.export' }, { args }),
    ],
    entry(
      built,
      text.menu.deleteByPattern,
      { element: 'key.delete-by-pattern@tree-menu', feature: 'key.delete-by-pattern' },
      {
        args: { ...args, pattern: '*' },
        writes: true,
      },
    ),
    refresh(built, { kind: 'redis-database', database }),
  ]);
}

function namespaceMenu(built: Built, node: Extract<NodeRef, { kind: 'namespace' }>): readonly MenuEntry[] {
  const connection = built.connection.id;
  const args = { connection, database: node.database, pattern: node.pattern };
  const pin = { kind: 'namespace', database: node.database, namespace: node.prefix } as const;
  return menuOf([
    [
      ...openKeys(built, node.database, node.prefix),
      ...(built.input.isAvailable('nav.pin') ? [pinControl(connection, pin, pinsOf(built.input))] : []),
    ],
    entry(
      built,
      text.menu.newKey,
      { element: 'key.new@tree-menu', feature: 'key.new' },
      {
        args: { connection, database: node.database, prefix: node.prefix },
        writes: true,
      },
    ),
    [
      ...entry(built, text.menu.exportKeys, { element: 'key.export@tree-menu', feature: 'key.export' }, { args }),
      ...entry(
        built,
        text.menu.deleteByPattern,
        { element: 'key.delete-by-pattern@tree-menu', feature: 'key.delete-by-pattern' },
        {
          args,
          writes: true,
        },
      ),
    ],
    refresh(built, { kind: 'redis-database', database: node.database }),
  ]);
}

/**
 * Feature: tree.menu-redis — the entries of the context menu of a node of a Redis tree, with a separator between
 * groups; none for **<n> empty databases**.
 */
export function view(input: TreeInput, node: NodeRef): readonly MenuEntry[] {
  const connection = currentConnection(input.state);
  if (connection?.engine !== 'redis') {
    return [];
  }
  const built: Built = { input, connection };
  switch (node.kind) {
    case 'heading':
      return node.part === 'databases' ? headingMenu(built) : [];
    case 'redis-database':
      return databaseMenu(built, node.database);
    case 'namespace':
      return namespaceMenu(built, node);
    case 'database':
    case 'collection':
    case 'bucket':
    case 'empty-databases':
    case 'pin':
    case 'page':
      return [];
  }
}
