/**
 * Feature: tree.mongodb
 *
 * The databases of a MongoDB connection and, under each, its GridFS buckets, then its collections, views and time
 * series collections together, then its system collections, dimmed. A click on a database expands or collapses it; a
 * click on a collection, a view or a time series collection opens its collection tab, or makes it active; a click on a
 * bucket opens its GridFS page.
 */
import type { ConnectionView } from '../../shared/connection';
import type { TabShows } from '../../shared/state/tabs';
import { iconColored } from './color-of';
import { countText, sizeText } from './count';
import { exclusionOf, type ExclusionTarget } from './excluded';
import { appliedFilter, filterDatabase, type FilteredDatabase } from './filter';
import * as nodeStates from './node-states';
import { isSelected } from './select';
import { text } from './text';
import {
  currentConnection,
  nodeId,
  nodeLabel,
  openControl,
  startControl,
  type CollectionEntry,
  type Control,
  type MongoDatabase,
  type TreeInput,
  type TreeItem,
  type TreeLine,
  type TreeNode,
} from './types';

/** The identifier of the heading **Databases**, which the databases are under. */
export const databasesHeading = nodeId({ kind: 'heading', part: 'databases' });

/** What the nodes of one connection are built with. */
interface Built {
  readonly input: TreeInput;
  readonly connection: ConnectionView;
  readonly filter: string;
}

function refreshOf(connection: ConnectionView, database?: string): Control {
  const scope = database === undefined ? { kind: 'connection' } : { kind: 'database', database };
  return startControl(text.states.retry, 'tree.node-states@tree', 'tree.refresh', {
    connection: connection.id,
    args: { connection: connection.id, scope },
  });
}

function isShown(built: Built, feature: string): boolean {
  return !built.connection.readOnly && built.input.isAvailable(feature);
}

/** What a node excluded from searches shows instead (`tree.excluded`): dimmed, marked, and a last line of its hover. */
interface Marked {
  readonly after?: string;
  readonly hover: string;
  readonly dimmed: boolean;
  /** The mark and what follows it, as the screen reader says them after the name. */
  readonly count?: string;
  readonly color?: TreeNode['color'];
}

/**
 * The parts of a node that its exclusion changes: after its name, **excluded** or **excluded with its database**
 * before what the tree says (`excluded · 1,204`); its hover's last line; dimmed, its icon too, whatever its color.
 */
function marked(
  built: Built,
  target: Exclude<ExclusionTarget, { kind: 'connection' }>,
  shown: { readonly after?: string; readonly hover: string; readonly dimmed: boolean; readonly count?: string },
): Marked {
  const exclusion = exclusionOf(built.connection, target);
  const colored = iconColored(built.connection, target);
  if (exclusion === 'not-excluded') {
    return { ...shown, ...colored };
  }
  const mark = exclusion === 'own' ? text.exclusions.own : text.exclusions.withDatabase;
  const line = exclusion === 'own' ? text.exclusions.hover : text.exclusions.hoverWithDatabase(target.database);
  return {
    after: [mark, ...(shown.after === undefined ? [] : [shown.after])].join(text.exclusions.separator),
    hover: `${shown.hover}\n${line}`,
    dimmed: true,
    count: [mark, ...(shown.count === undefined ? [] : [shown.count])].join(', '),
  };
}

function databaseButtons(built: Built, database: string): readonly Control[] {
  const on = { connection: built.connection.id, args: { connection: built.connection.id, database } };
  const create = startControl(
    text.mongodb.createCollection,
    'manage.create-collection@tree',
    'manage.create-collection',
    on,
  );
  const refresh = startControl(text.mongodb.refresh, 'tree.refresh@tree', 'tree.refresh', {
    connection: built.connection.id,
    args: { connection: built.connection.id, scope: { kind: 'database', database } },
  });
  return [...(isShown(built, 'manage.create-collection') ? [create] : []), refresh];
}

function entryIcon(entry: CollectionEntry): string {
  return entry.kind === 'view' ? 'eye' : entry.kind === 'timeseries' ? 'clock' : 'table';
}

function entryHover(database: string, entry: CollectionEntry): string {
  switch (entry.kind) {
    case 'view':
      return text.mongodb.viewHover(database, entry.name);
    case 'timeseries':
      return text.mongodb.timeseriesHover(database, entry.name);
    case 'collection':
      return text.mongodb.collectionHover(database, entry.name);
  }
}

function entryNode(built: Built, database: string, entry: CollectionEntry): TreeNode {
  const id = nodeId({
    kind: 'collection',
    database,
    name: entry.name,
    collectionKind: entry.kind,
    system: entry.system,
  });
  const counted =
    entry.kind === 'collection' ? built.input.island.mongodb.counts[`${database}.${entry.name}`] : undefined;
  const after = counted === undefined ? undefined : countText(counted);
  const shows: TabShows = {
    kind: 'collection',
    connection: built.connection.id,
    database,
    collection: entry.name,
    ...(entry.kind === 'view' ? { view: true } : {}),
  };
  const insert = startControl(text.mongodb.insertDocument, 'tree.mongodb@tree', 'document.insert', {
    connection: built.connection.id,
    args: { connection: built.connection.id, database, collection: entry.name },
  });
  const shown = marked(
    built,
    { kind: 'collection', database, collection: entry.name },
    {
      ...(after === undefined ? {} : { after, count: text.label.documents(after) }),
      hover: entryHover(database, entry),
      dimmed: entry.system,
    },
  );
  return {
    kind: 'node',
    id,
    parent: nodeId({ kind: 'database', database }),
    level: 3,
    ref: { kind: 'collection', database, name: entry.name, collectionKind: entry.kind, system: entry.system },
    name: entry.name,
    icon: entryIcon(entry),
    ...(shown.color === undefined ? {} : { color: shown.color }),
    ...(shown.after === undefined ? {} : { after: shown.after }),
    hover: shown.hover,
    dimmed: shown.dimmed,
    expandable: false,
    expanded: false,
    selected: isSelected(built.input.island, id),
    label: nodeLabel({
      name: entry.name,
      kind: text.kinds[entry.kind],
      ...(shown.count === undefined ? {} : { count: shown.count }),
    }),
    click: openControl(entry.name, 'tree.mongodb@tree', shows),
    buttons: entry.kind !== 'view' && isShown(built, 'document.insert') ? [insert] : [],
    hasMenu: true,
  };
}

function bucketNode(built: Built, database: string, name: string): TreeNode {
  const id = nodeId({ kind: 'bucket', database, name });
  const connection = built.connection.id;
  const shows: TabShows = { kind: 'page', connection, page: 'gridfs', title: name, database, of: [name] };
  const upload = startControl(text.mongodb.uploadFiles, 'tree.mongodb@tree', 'gridfs.upload', {
    connection,
    args: { connection, database, bucket: name },
  });
  const shown = marked(
    built,
    { kind: 'bucket', database, bucket: name },
    { after: text.mongodb.gridfs, hover: text.mongodb.bucketHover(database, name), dimmed: false },
  );
  return {
    kind: 'node',
    id,
    parent: nodeId({ kind: 'database', database }),
    level: 3,
    ref: { kind: 'bucket', database, name },
    name,
    icon: 'files',
    ...(shown.color === undefined ? {} : { color: shown.color }),
    after: shown.after ?? text.mongodb.gridfs,
    hover: shown.hover,
    dimmed: shown.dimmed,
    expandable: false,
    expanded: false,
    selected: isSelected(built.input.island, id),
    label: nodeLabel({ name, kind: text.kinds.bucket, ...(shown.count === undefined ? {} : { count: shown.count }) }),
    click: openControl(name, 'gridfs.show@tree', shows),
    buttons: isShown(built, 'gridfs.upload') ? [upload] : [],
    hasMenu: true,
  };
}

function childrenOf(built: Built, database: string, filtered: FilteredDatabase): readonly TreeItem[] {
  const place = { parent: nodeId({ kind: 'database', database }), level: 3 };
  const loadable = built.input.island.mongodb.contents[database] ?? { kind: 'idle' };
  if (built.filter !== '' && filtered.contents !== undefined) {
    const { buckets, entries } = filtered.contents;
    if (buckets.length === 0 && entries.length === 0) {
      return [nodeStates.noCollectionsMatch(place, built.filter)];
    }
    return [
      ...buckets.map((name) => bucketNode(built, database, name)),
      ...entries.map((entry) => entryNode(built, database, entry)),
    ];
  }
  if (built.filter !== '' && loadable.kind === 'failed') {
    return [];
  }
  const contents =
    loadable.kind === 'loaded' ? loadable.value : loadable.kind === 'loading' ? loadable.previous : undefined;
  if (contents === undefined || (contents.buckets.length === 0 && contents.entries.length === 0)) {
    const empty = loadable.kind === 'loaded' ? { empty: text.states.noCollections } : {};
    return nodeStates.view({
      place,
      loadable,
      now: built.input.now,
      retry: refreshOf(built.connection, database),
      ...empty,
    });
  }
  return [
    ...contents.buckets.map((name) => bucketNode(built, database, name)),
    ...contents.entries.map((entry) => entryNode(built, database, entry)),
  ];
}

function databaseItems(built: Built, database: MongoDatabase): readonly TreeItem[] {
  const id = nodeId({ kind: 'database', database: database.name });
  const filtered = filterDatabase(
    built.filter,
    database.name,
    built.input.island.mongodb.contents[database.name],
    built.connection,
  );
  if (!filtered.shown) {
    return [];
  }
  const expanded = built.input.island.expanded.includes(id) || filtered.expanded;
  const size = sizeText(database.sizeOnDisk ?? 0);
  const shown = marked(
    built,
    { kind: 'database', database: database.name },
    { ...(size === '' ? {} : { after: size, count: size }), hover: database.name, dimmed: false },
  );
  const node: TreeNode = {
    kind: 'node',
    id,
    parent: databasesHeading,
    level: 2,
    ref: { kind: 'database', database: database.name },
    name: database.name,
    icon: 'database',
    ...(shown.color === undefined ? {} : { color: shown.color }),
    ...(shown.after === undefined ? {} : { after: shown.after }),
    hover: shown.hover,
    dimmed: shown.dimmed,
    expandable: true,
    expanded,
    selected: isSelected(built.input.island, id),
    label: nodeLabel({
      name: database.name,
      kind: text.kinds.database,
      ...(shown.count === undefined ? {} : { count: shown.count }),
      expanded,
    }),
    buttons: databaseButtons(built, database.name),
    hasMenu: true,
  };
  return expanded ? [node, ...childrenOf(built, database.name, filtered)] : [node];
}

function emptyOrFiltered(
  built: Built,
  databases: readonly MongoDatabase[],
  items: readonly TreeItem[],
): readonly TreeLine[] {
  const place = { parent: databasesHeading, level: 2 };
  if (databases.length === 0) {
    return [nodeStates.line(place, 'empty', text.states.noDatabases)];
  }
  if (items.length > 0 || built.filter === '') {
    return [];
  }
  const contents = built.input.island.mongodb.contents;
  const reading = databases.flatMap((each) => {
    const loadable = contents[each.name];
    return loadable?.kind === 'loading'
      ? [loadable.since]
      : loadable === undefined || loadable.kind === 'idle'
        ? [built.input.now]
        : [];
  });
  return reading.length > 0
    ? nodeStates.loadingLines(place, Math.min(...reading), built.input.now)
    : [nodeStates.nothingMatches(place, built.filter)];
}

/**
 * Feature: tree.mongodb — what the part **Databases** shows for a connected MongoDB connection, line by line: the
 * databases sorted by name and, under each one expanded, its buckets and its entries; or the state of the read.
 */
export function view(input: TreeInput, connection: ConnectionView): readonly TreeItem[] {
  const built: Built = { input, connection, filter: appliedFilter(input.island) };
  const loadable = input.island.mongodb.databases;
  const databases =
    loadable.kind === 'loaded' ? loadable.value : loadable.kind === 'loading' ? loadable.previous : undefined;
  if (databases === undefined) {
    const place = { parent: databasesHeading, level: 2 };
    return nodeStates.view({ place, loadable, now: input.now, retry: refreshOf(connection) });
  }
  const items = databases.flatMap((database) => databaseItems(built, database));
  return [...items, ...emptyOrFiltered(built, databases, items)];
}

/** The identifiers of the databases the filter shows expanded, which stay expanded once the field is emptied. */
export function expandedByFilter(input: TreeInput): readonly string[] {
  const filter = appliedFilter(input.island);
  const loadable = input.island.mongodb.databases;
  const databases = loadable.kind === 'loaded' ? loadable.value : [];
  const connection = currentConnection(input.state) ?? {};
  return databases
    .filter(
      (database) =>
        filterDatabase(filter, database.name, input.island.mongodb.contents[database.name], connection).expanded,
    )
    .map((database) => nodeId({ kind: 'database', database: database.name }));
}
