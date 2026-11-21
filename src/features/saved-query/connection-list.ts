/**
 * Feature: saved-query.connection-list
 *
 * Every saved query the current connection can run, whatever its collection, for Go to and for **Pinned** of the tree
 * island: its saved queries for me, and the files of its queries folder that name no connection or this one, whose
 * collection the tree last read (a database whose collections were not read yet lists its files). Recent queries are
 * not listed. The main process answers the app read `saved-query.connection-list` with `{ connectionName, mine,
 * folder, databases? }`: the queries for me of the connection, the reading of its queries folder (or `null`), and the
 * databases the tree last read, each with its collections when they were read.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { mineOf, savedInOrder } from './list';
import { folderQueriesOf, noFolderQueries, queriesFolderOf } from './read-folder';
import { queryLine } from './show';
import { text } from './text';
import type { Pin } from '../../shared/state/nav';
import { fieldsOf, namespaceOf, pinOfSaved, queryJson, type SavedQuery } from './types';

/** The app read that the main process answers with the saved queries of a connection. */
export const connectionListAction = 'saved-query.connection-list';

/** A saved query as Go to lists it. */
export interface ConnectionQueryItem {
  readonly query: SavedQuery;
  /** Its name. */
  readonly title: string;
  /** `shop.orders · Me` or `shop.orders · Folder`. */
  readonly context: string;
  /** The query on one line, as in the queries list. */
  readonly line: string;
}

/** The saved queries of a connection. */
export interface ConnectionQueries {
  readonly connectionName: string;
  readonly items: readonly ConnectionQueryItem[];
}

/** The databases the tree last read, and the collections of those whose collections it read. */
type TreeNames = ReadonlyMap<string, ReadonlySet<string> | undefined> | undefined;

function treeNamesOf(value: unknown): TreeNames {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return new Map(
    (value as readonly unknown[]).flatMap((each) => {
      const fields = fieldsOf(each);
      const { name, collections } = fields;
      if (typeof name !== 'string') {
        return [];
      }
      const read = Array.isArray(collections)
        ? new Set((collections as readonly unknown[]).filter((one): one is string => typeof one === 'string'))
        : undefined;
      return [[name, read] as const];
    }),
  );
}

function isInTree(query: SavedQuery, tree: TreeNames): boolean {
  if (tree === undefined) {
    return true;
  }
  if (!tree.has(query.database)) {
    return false;
  }
  const collections = tree.get(query.database);
  return collections === undefined || collections.has(query.collection);
}

function isForConnection(query: SavedQuery, connectionName: string): boolean {
  return (
    query.place === 'me' ||
    query.connection === undefined ||
    query.connection.trim().toLowerCase() === connectionName.trim().toLowerCase()
  );
}

function itemOf(query: SavedQuery): ConnectionQueryItem {
  return {
    query,
    title: query.name,
    context: text.connectionList.context(namespaceOf(query), query.place === 'me' ? text.show.me : text.show.folder),
    line: queryLine(query.query),
  };
}

/** Whether Go to finds an item by the text typed: in its name, its description or the name of its collection. */
export function isFound(item: ConnectionQueryItem, typed: string): boolean {
  const wanted = typed.trim().toLowerCase();
  return [item.query.name, item.query.description ?? '', item.query.collection].some((each) =>
    each.toLowerCase().includes(wanted),
  );
}

/**
 * What a pin of a saved query holds: for a query for me, the query itself; for one in the folder, the path of its file
 * inside the queries folder, so that the pin follows the file and is gone with it.
 */
export function pinOf(query: SavedQuery): Json {
  return pinOfSaved(query);
}

/**
 * What a click on a pinned saved query starts `saved-query.run` with: the query it names, read from the list, so that
 * a query saved again runs as it is now; for one for me, the query the pin holds when it is no longer listed.
 */
export function pinRunArgs(connection: string, pin: Extract<Pin, { kind: 'saved-query' }>): Json {
  const place = pin.place ?? 'me';
  return {
    connection,
    database: pin.database,
    collection: pin.collection,
    saved: { place, name: pin.name, ...(pin.file === undefined ? {} : { file: pin.file }) },
    ...(pin.query === undefined ? {} : { query: pin.query }),
  };
}

/** What choosing an item, or its pin, starts `saved-query.run` with. */
export function runArgs(connection: string, query: SavedQuery): Json {
  return {
    connection,
    database: query.database,
    collection: query.collection,
    query: queryJson(query.query),
    name: query.name,
  };
}

/**
 * Asks Datardo's data for the saved queries of `args.connection`, or of the current connection; `args.databases`, the
 * names the tree of the window last read, is handed on and comes back in the reply.
 */
export function request(context: Context, args: Json): ReadRequest {
  const fields = fieldsOf(args);
  const named = fields['connection'];
  const databases = fields['databases'];
  const connection = typeof named === 'string' ? named : (context.state.nav.current ?? '');
  return {
    kind: 'app',
    action: connectionListAction,
    args: {
      connection,
      queriesFolder: queriesFolderOf(context, connection) ?? null,
      ...(Array.isArray(databases) ? { databases } : {}),
    },
  };
}

/** The saved queries of the connection that Go to and **Pinned** may show, in order of name. */
export function parse(replies: readonly unknown[]): ConnectionQueries {
  const reply = fieldsOf(replies[0]);
  const connectionName = typeof reply['connectionName'] === 'string' ? reply['connectionName'] : '';
  const folder =
    reply['folder'] === null || reply['folder'] === undefined ? noFolderQueries : folderQueriesOf(reply['folder']);
  const mine = Array.isArray(reply['mine'])
    ? (reply['mine'] as readonly unknown[]).flatMap((each) => {
        const query = mineOf(each);
        return query === undefined ? [] : [query];
      })
    : [];
  const tree = treeNamesOf(reply['databases']);
  const files = folder.queries.filter((each) => isForConnection(each, connectionName) && isInTree(each, tree));
  return { connectionName, items: savedInOrder([...mine, ...files]).map(itemOf) };
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('saved-query.connection-list'), request, parse };
