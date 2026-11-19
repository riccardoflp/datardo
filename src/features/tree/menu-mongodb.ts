/**
 * Feature: tree.menu-mongodb
 *
 * The context menu of the heading **Databases**, a database, a collection, a view, a time series collection and a
 * GridFS bucket. Each entry starts a feature of another area with the node it was opened on; the tree runs nothing
 * itself. An entry is shown only when its feature is built; on a read-only connection the entries that only write
 * are not shown. Opening the menu changes neither the selection nor the active tab.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
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
  readonly args: Json;
}

/** Whether an entry only writes: such entries are not shown on a read-only connection. */
type Writes = 'writes' | 'reads';

function entry(
  built: Built,
  label: string,
  ids: { readonly element: string; readonly feature: string },
  writes: Writes = 'reads',
): readonly Control[] {
  if ((writes === 'writes' && built.connection.readOnly) || !built.input.isAvailable(ids.feature)) {
    return [];
  }
  return [startControl(label, ids.element, ids.feature, { connection: built.connection.id, args: built.args })];
}

function refresh(built: Built, scope: Json): readonly Control[] {
  const control = startControl(text.menu.refresh, 'tree.refresh@tree-menu', 'tree.refresh', {
    connection: built.connection.id,
    args: { connection: built.connection.id, scope },
  });
  return built.input.isAvailable('tree.refresh') ? [control] : [];
}

const collapseAll: Control = {
  kind: 'window',
  label: text.menu.collapseAll,
  element: 'tree.menu-mongodb@tree-menu',
  action: 'collapse-all',
};

function backups(built: Built, restore: 'with-restore' | 'without-restore'): readonly Control[] {
  return [
    ...entry(built, text.menu.backUp, { element: 'backup.create@tree-menu', feature: 'backup.create' }),
    ...(restore === 'with-restore'
      ? entry(built, text.menu.restore, { element: 'backup.restore@tree-menu', feature: 'backup.restore' }, 'writes')
      : []),
    ...entry(built, text.menu.schedule, { element: 'task.edit@tree-menu', feature: 'task.edit' }),
  ];
}

function headingMenu(built: Built): readonly MenuEntry[] {
  return menuOf([
    [
      ...entry(
        built,
        text.menu.createDatabase,
        { element: 'tree.menu-mongodb@tree-menu', feature: 'manage.create-database' },
        'writes',
      ),
      ...entry(built, text.menu.newPlayground, { element: 'playground.open@tree-menu', feature: 'playground.open' }),
    ],
    backups(built, 'with-restore'),
    [...refresh(built, { kind: 'connection' }), collapseAll],
  ]);
}

function databaseMenu(built: Built, database: string): readonly MenuEntry[] {
  return menuOf([
    [
      ...entry(
        built,
        text.menu.createCollection,
        { element: 'manage.create-collection@tree-menu', feature: 'manage.create-collection' },
        'writes',
      ),
      ...entry(built, text.menu.newPlayground, { element: 'playground.open@tree-menu', feature: 'playground.open' }),
    ],
    [
      ...entry(built, text.menu.searchDocuments, { element: 'search.show@tree-menu', feature: 'search.show' }),
      ...entry(built, text.menu.relationshipDiagram, {
        element: 'relation.diagram@tree-menu',
        feature: 'relation.diagram',
      }),
    ],
    backups(built, 'with-restore'),
    [
      ...entry(built, text.menu.usersAndRoles, { element: 'user.show@tree-menu', feature: 'user.show' }),
      ...entry(built, text.menu.watchChanges, { element: 'watch.show@tree-menu', feature: 'watch.show' }),
      ...entry(built, text.menu.indexAdvisor, { element: 'advisor.show@tree-menu', feature: 'advisor.show' }),
    ],
    [
      ...entry(built, text.menu.compareStructure, { element: 'structure.show@tree-menu', feature: 'structure.show' }),
      ...entry(
        built,
        text.menu.uploadFiles,
        { element: 'gridfs.create-bucket@tree-menu', feature: 'gridfs.create-bucket' },
        'writes',
      ),
    ],
    refresh(built, { kind: 'database', database }),
    entry(
      built,
      text.menu.dropDatabase,
      { element: 'manage.drop-database@tree-menu', feature: 'manage.drop-database' },
      'writes',
    ),
  ]);
}

type Entry = Extract<NodeRef, { kind: 'collection' }>;

function openAndPin(built: Built, node: Entry): readonly Control[] {
  const connection = built.connection.id;
  const view = node.collectionKind === 'view';
  const shows = {
    kind: 'collection',
    connection,
    database: node.database,
    collection: node.name,
    ...(view ? { view } : {}),
  } as const;
  const open = built.input.isAvailable('tab.open')
    ? [openControl(text.menu.open, 'tree.menu-mongodb@tree-menu', shows)]
    : [];
  const pin = {
    kind: 'collection',
    database: node.database,
    collection: node.name,
    ...(view ? { view } : {}),
  } as const;
  return [...open, ...(built.input.isAvailable('nav.pin') ? [pinControl(connection, pin, pinsOf(built.input))] : [])];
}

function moving(built: Built, kind: 'collection' | 'view'): readonly Control[] {
  return [
    ...(kind === 'collection'
      ? [
          ...entry(
            built,
            text.menu.importDocuments,
            { element: 'transfer.import@tree-menu', feature: 'transfer.import' },
            'writes',
          ),
          ...entry(
            built,
            text.menu.generateDocuments,
            { element: 'transfer.generate@tree-menu', feature: 'transfer.generate' },
            'writes',
          ),
        ]
      : []),
    ...entry(built, text.menu.exportCollection, { element: 'transfer.export@tree-menu', feature: 'transfer.export' }),
    ...entry(built, text.menu.copyCollection, {
      element: 'transfer.copy-collection@tree-menu',
      feature: 'transfer.copy-collection',
    }),
    ...entry(built, text.menu.compareWith, { element: 'compare.show@tree-menu', feature: 'compare.show' }),
    ...backups(built, kind === 'collection' ? 'with-restore' : 'without-restore'),
  ];
}

const drop = { element: 'manage.drop-collection@tree-menu', feature: 'manage.drop-collection' } as const;

function viewMenu(built: Built, node: Entry): readonly MenuEntry[] {
  return menuOf([
    openAndPin(built, node),
    entry(built, text.menu.newPlayground, { element: 'playground.open@tree-menu', feature: 'playground.open' }),
    [
      ...entry(built, text.menu.searchDocuments, { element: 'search.show@tree-menu', feature: 'search.show' }),
      ...entry(built, text.menu.relationshipDiagram, {
        element: 'relation.diagram@tree-menu',
        feature: 'relation.diagram',
      }),
    ],
    moving(built, 'view'),
    entry(built, text.menu.editView, { element: 'manage.definition@tree-menu', feature: 'manage.definition' }),
    entry(built, text.menu.drop, drop, 'writes'),
  ]);
}

function collectionMenu(built: Built, node: Entry): readonly MenuEntry[] {
  const allowsAll = node.collectionKind === 'collection';
  return menuOf([
    openAndPin(built, node),
    [
      ...entry(
        built,
        text.menu.insertDocument,
        { element: 'document.insert@tree-menu', feature: 'document.insert' },
        'writes',
      ),
      ...entry(built, text.menu.newPlayground, { element: 'playground.open@tree-menu', feature: 'playground.open' }),
    ],
    [
      ...entry(built, text.menu.searchDocuments, { element: 'search.show@tree-menu', feature: 'search.show' }),
      ...entry(built, text.menu.relationshipDiagram, {
        element: 'relation.diagram@tree-menu',
        feature: 'relation.diagram',
      }),
      ...entry(built, text.menu.indexes, { element: 'index.show@tree-menu', feature: 'index.show' }),
    ],
    [
      ...(allowsAll
        ? entry(built, text.menu.watchChanges, { element: 'watch.show@tree-menu', feature: 'watch.show' })
        : []),
      ...entry(built, text.menu.indexAdvisor, { element: 'advisor.show@tree-menu', feature: 'advisor.show' }),
    ],
    moving(built, 'collection'),
    allowsAll
      ? [
          ...entry(
            built,
            text.menu.renameCollection,
            { element: 'manage.rename-collection@tree-menu', feature: 'manage.rename-collection' },
            'writes',
          ),
          ...entry(built, text.menu.editValidation, {
            element: 'manage.validation@tree-menu',
            feature: 'manage.validation',
          }),
        ]
      : [],
    entry(built, text.menu.drop, drop, 'writes'),
  ]);
}

function bucketMenu(built: Built, database: string, bucket: string): readonly MenuEntry[] {
  const connection = built.connection.id;
  const shows = { kind: 'page', connection, page: 'gridfs', title: bucket, database, of: [bucket] } as const;
  const open = built.input.isAvailable('tab.open')
    ? [openControl(text.menu.openBucket, 'gridfs.show@tree-menu', shows)]
    : [];
  return menuOf([
    open,
    entry(built, text.menu.uploadFiles, { element: 'gridfs.upload@tree-menu', feature: 'gridfs.upload' }, 'writes'),
    entry(
      built,
      text.menu.deleteBucket,
      { element: 'gridfs.drop-bucket@tree-menu', feature: 'gridfs.drop-bucket' },
      'writes',
    ),
  ]);
}

function argsOfNode(connection: ConnectionView, node: NodeRef): Json {
  switch (node.kind) {
    case 'database':
      return { connection: connection.id, database: node.database };
    case 'collection':
      return { connection: connection.id, database: node.database, collection: node.name };
    case 'bucket':
      return { connection: connection.id, database: node.database, bucket: node.name };
    case 'heading':
    case 'redis-database':
    case 'namespace':
    case 'empty-databases':
    case 'pin':
    case 'page':
      return { connection: connection.id };
  }
}

/**
 * Feature: tree.menu-mongodb — the entries of the context menu of a node of a MongoDB tree, with a separator between
 * groups; none for a node that has no menu.
 */
export function view(input: TreeInput, node: NodeRef): readonly MenuEntry[] {
  const connection = currentConnection(input.state);
  if (connection?.engine !== 'mongodb') {
    return [];
  }
  const built: Built = { input, connection, args: argsOfNode(connection, node) };
  switch (node.kind) {
    case 'heading':
      return node.part === 'databases' ? headingMenu(built) : [];
    case 'database':
      return databaseMenu(built, node.database);
    case 'collection':
      return node.collectionKind === 'view' ? viewMenu(built, node) : collectionMenu(built, node);
    case 'bucket':
      return bucketMenu(built, node.database, node.name);
    case 'redis-database':
    case 'namespace':
    case 'empty-databases':
    case 'pin':
    case 'page':
      return [];
  }
}
