/**
 * Feature: saved-query.list
 *
 * The saved and the recent queries of one collection of one connection, as the queries list shows them and as the
 * tool `list_saved_queries` of the MCP server gives them. The main process answers the app read `saved-query.list`
 * with `{ connectionName, mine, recent, folder }`: the saved queries for me of the collection and its recent queries,
 * from Datardo's data, and the reading of the connection's queries folder (`saved-query.read-folder`), or `null` when
 * it has none. This module keeps the files of this collection and of this connection, and puts everything in order.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { folderQueriesOf, noFolderQueries, queriesFolderOf, type SkippedFile } from './read-folder';
import { queryLine } from './show';
import { text } from './text';
import {
  fieldsOf,
  namespaceOf,
  readQueryText,
  type FolderSavedQuery,
  type MySavedQuery,
  type RecentQuery,
  type SavedQuery,
} from './types';

/** The app read that the main process answers with the queries of a collection. */
export const listAction = 'saved-query.list';

/** How many recent queries a collection keeps (Mongoster's `MAX_RECENT`). */
export const recentKept = 50;

/** The saved and recent queries of a collection, as the queries list shows them. */
export interface CollectionQueries {
  readonly connectionName: string;
  readonly database: string;
  readonly collection: string;
  /** The connection's queries folder, when it has one. */
  readonly queriesFolder?: string;
  /** In order of name, then the files for this connection, the other files, the one for me. */
  readonly saved: readonly SavedQuery[];
  /** Newest first, at most {@link recentKept}. */
  readonly recent: readonly RecentQuery[];
  /** Every file of the queries folder: the paths a new file must not take (`saved-query.file-path`). */
  readonly files: readonly string[];
  /** The files of the folder that could not be read. */
  readonly skipped: readonly SkippedFile[];
}

/** Whether a file of the folder is listed on a collection of a connection (Mongoster's `matchesCollection`). */
export function matchesCollection(
  query: Pick<FolderSavedQuery, 'database' | 'collection' | 'connection'>,
  where: { readonly connectionName: string; readonly database: string; readonly collection: string },
): boolean {
  return (
    query.database === where.database &&
    query.collection === where.collection &&
    (query.connection === undefined ||
      query.connection.trim().toLowerCase() === where.connectionName.trim().toLowerCase())
  );
}

function rank(query: SavedQuery): number {
  if (query.place === 'me') {
    return 2;
  }
  return query.connection === undefined ? 1 : 0;
}

/**
 * The saved queries in order of name, ignoring case and reading numbers as numbers; with the same name, first a file
 * that names the connection, then a file that names none, then the one for me; two files by their path.
 */
export function savedInOrder(saved: readonly SavedQuery[]): readonly SavedQuery[] {
  const fileOf = (query: SavedQuery): string => (query.place === 'folder' ? query.file : '');
  return [...saved].sort(
    (first, second) =>
      first.name.localeCompare(second.name, 'en', { sensitivity: 'base', numeric: true }) ||
      rank(first) - rank(second) ||
      fileOf(first).localeCompare(fileOf(second), 'en'),
  );
}

/** A saved query for me read back from what the main process gave; `undefined` when it is not one. */
export function mineOf(value: unknown): MySavedQuery | undefined {
  const fields = fieldsOf(value);
  const { name, description, database, collection, at } = fields;
  const query = readQueryText(fields['query']);
  if (typeof name !== 'string' || typeof database !== 'string' || typeof collection !== 'string' || !query) {
    return undefined;
  }
  return {
    place: 'me',
    name,
    ...(typeof description === 'string' && description !== '' ? { description } : {}),
    database,
    collection,
    query,
    at: typeof at === 'number' ? at : 0,
  };
}

/** A recent query read back from what the main process gave; `undefined` when it is not one. */
export function recentOf(value: unknown): RecentQuery | undefined {
  const fields = fieldsOf(value);
  const query = readQueryText(fields['query']);
  const at = fields['at'];
  return query === undefined || typeof at !== 'number' ? undefined : { query, at };
}

function listOf<T>(value: unknown, read: (each: unknown) => T | undefined): readonly T[] {
  return Array.isArray(value)
    ? (value as readonly unknown[]).flatMap((each) => {
        const item = read(each);
        return item === undefined ? [] : [item];
      })
    : [];
}

function textArg(args: Json, name: string): string {
  const value = fieldsOf(args)[name];
  return typeof value === 'string' ? value : '';
}

/** Asks Datardo's data for the queries of the collection `args` names: `{ connection, database, collection }`. */
export function request(context: Context, args: Json): ReadRequest {
  const connection = textArg(args, 'connection');
  const folder = queriesFolderOf(context, connection);
  return {
    kind: 'app',
    action: listAction,
    args: {
      connection,
      database: textArg(args, 'database'),
      collection: textArg(args, 'collection'),
      queriesFolder: folder ?? null,
    },
  };
}

/** The queries of the collection, from the reply of the main process. */
export function parse(replies: readonly unknown[], args: Json): CollectionQueries {
  const reply = fieldsOf(replies[0]);
  const database = textArg(args, 'database');
  const collection = textArg(args, 'collection');
  const connectionName = typeof reply['connectionName'] === 'string' ? reply['connectionName'] : '';
  const where = { connectionName, database, collection };
  const folder =
    reply['folder'] === null || reply['folder'] === undefined ? noFolderQueries : folderQueriesOf(reply['folder']);
  const mine = listOf(reply['mine'], mineOf).filter(
    (each) => each.database === database && each.collection === collection,
  );
  const files = folder.queries.filter((each) => matchesCollection(each, where));
  const recent = [...listOf(reply['recent'], recentOf)].sort((first, second) => second.at - first.at);
  return {
    connectionName,
    database,
    collection,
    ...(folder.folder === undefined ? {} : { queriesFolder: folder.folder }),
    saved: savedInOrder([...mine, ...files]),
    recent: recent.slice(0, recentKept),
    files: folder.files,
    skipped: folder.skipped,
  };
}

/** The list as the tool `list_saved_queries` gives it: one line for each query, or a sentence when there are none. */
export function listText(queries: CollectionQueries): string {
  const namespace = namespaceOf(queries);
  if (queries.saved.length === 0 && queries.recent.length === 0) {
    return text.list.none(namespace, queries.connectionName);
  }
  const saved = queries.saved.map(
    (each) => `- ${each.name} (${each.place === 'me' ? text.show.me : text.show.folder}): ${queryLine(each.query)}`,
  );
  const recent = queries.recent.map((each) => `- ${queryLine(each.query)}`);
  return [
    ...(saved.length === 0 ? [] : [`${text.show.saved}:`, ...saved]),
    ...(recent.length === 0 ? [] : [`${text.show.recent}:`, ...recent]),
  ].join('\n');
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('saved-query.list'), request, parse };
