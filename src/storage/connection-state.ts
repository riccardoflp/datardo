/**
 * `state/<connection id>.json`: what Datardo remembers of one connection that is not a setting (data.md). Version 1.
 *
 * This module reads and writes the recent queries of each collection (`saved-query.recent`), under
 * `collections.<database>.<collection>.recentQueries`, and the columns' layout and the expanded field paths
 * (`table.columns`), under `.layout` and `.expanded` beside them, and keeps every other field of the file as it found it, so that
 * the other parts data.md lists for this file (the columns' layout, the console's last commands, …) can be added
 * beside them without a new version. The content is the file's object without `version`.
 */
import type { Json } from '../shared/engine-request';
import { storedQueryOf, type StoredQueryText } from './saved-queries';
import type { JsonObject, StoredFile } from './store';

/** A recent query, as stored: the query or the pipeline as it ran, and when it last ran. */
export interface StoredRecentQuery {
  readonly query: StoredQueryText;
  /** In milliseconds since 1970. */
  readonly at: number;
}

/** What `state/<connection id>.json` holds: its object without `version`. */
export type ConnectionStateFile = JsonObject;

/** How many recent queries a collection keeps (`saved-query.recent`, Mongoster's `MAX_RECENT`). */
export const recentQueriesKept = 50;

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const safeId = /^[A-Za-z0-9_-]+$/u;

/** The kind of file the state of a connection is; throws for an id that is not a file name. */
export function connectionStateFile(connection: string): StoredFile<ConnectionStateFile> {
  if (!safeId.test(connection)) {
    throw new Error(`The connection id ${connection} cannot name a file.`);
  }
  return {
    path: `state/${connection}.json`,
    holds: 'What Datardo remembers of a connection',
    version: 1,
    migrations: {},
    empty: () => ({}),
    read: (object) => {
      if (object['collections'] !== undefined && !isObject(object['collections'])) {
        throw new Error('collections is not an object.');
      }
      return Object.fromEntries(Object.entries(object).filter(([field]) => field !== 'version'));
    },
    write: (value) => value,
  };
}

function field(object: Json | undefined, name: string): JsonObject {
  const value = isObject(object) ? object[name] : undefined;
  return isObject(value) ? value : {};
}

function recentOf(value: Json): StoredRecentQuery | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const query = storedQueryOf(value['query']);
  const at = value['at'];
  return query === undefined || typeof at !== 'number' || !Number.isFinite(at) ? undefined : { query, at };
}

/** The recent queries of a collection, newest first, at most {@link recentQueriesKept}; what is not one is left out. */
export function recentQueriesIn(
  state: ConnectionStateFile,
  database: string,
  collection: string,
): readonly StoredRecentQuery[] {
  const list = field(field(field(state, 'collections'), database), collection)['recentQueries'];
  if (!Array.isArray(list)) {
    return [];
  }
  return (list as readonly Json[])
    .flatMap((each) => {
      const recent = recentOf(each);
      return recent === undefined ? [] : [recent];
    })
    .slice(0, recentQueriesKept);
}

/** An object with one field set, or removed when `value` is `undefined`; the order of the others is kept. */
function withField(object: JsonObject, name: string, value: Json | undefined): JsonObject {
  const others = Object.entries(object).filter(([each]) => each !== name);
  return Object.fromEntries(value === undefined ? others : [...others, [name, value]]);
}

function emptyToUndefined(object: JsonObject): JsonObject | undefined {
  return Object.keys(object).length === 0 ? undefined : object;
}

/**
 * The state with the recent queries of a collection replaced, every other field kept. An empty list removes the
 * field, and the objects of the collection and of the database when nothing else is left in them.
 */
export function withRecentQueries(
  state: ConnectionStateFile,
  where: { readonly database: string; readonly collection: string },
  recent: readonly StoredRecentQuery[],
): ConnectionStateFile {
  const collections = field(state, 'collections');
  const database = field(collections, where.database);
  const list = recent
    .slice(0, recentQueriesKept)
    .map((each) => ({ query: each.query, at: each.at }) as unknown as Json);
  const collection = withField(
    field(database, where.collection),
    'recentQueries',
    list.length === 0 ? undefined : list,
  );
  const databaseAfter = withField(database, where.collection, emptyToUndefined(collection));
  const collectionsAfter = withField(collections, where.database, emptyToUndefined(databaseAfter));
  return withField(state, 'collections', emptyToUndefined(collectionsAfter));
}

/** The state with what a collection keeps carried to its new name (`manage.rename-collection`). */
export function withCollectionRenamed(
  state: ConnectionStateFile,
  database: string,
  names: { readonly from: string; readonly to: string },
): ConnectionStateFile {
  const collections = field(state, 'collections');
  const before = field(collections, database);
  const kept = before[names.from];
  if (kept === undefined) {
    return state;
  }
  const after = withField(withField(before, names.from, undefined), names.to, kept);
  return withField(state, 'collections', withField(collections, database, after));
}

/** What the file keeps of the columns of a collection (`table.columns`): its layout and its expanded field paths. */
export interface StoredColumns {
  readonly layout: JsonObject;
  readonly expanded: readonly string[];
}

function strings(value: Json | undefined): readonly string[] {
  return Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : [];
}

function widthsOf(value: Json | undefined): JsonObject | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const widths = Object.entries(value).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
  );
  return widths.length === 0 ? undefined : Object.fromEntries(widths);
}

/** The layout as kept: its lists of keys and its widths, what is not one left out. */
function layoutOf(value: Json | undefined): JsonObject {
  const fields = isObject(value) ? value : {};
  const widths = widthsOf(fields['widths']);
  const lists = (['hidden', 'order', 'pinned'] as const).flatMap((name) => {
    const list = strings(fields[name]);
    return list.length === 0 ? [] : [[name, [...list]] as const];
  });
  const entries: (readonly [string, Json])[] = [
    ...lists,
    ...(widths === undefined ? [] : [['widths', widths] as const]),
  ];
  return Object.fromEntries(entries);
}

/** A collection whose columns the file keeps. */
export interface CollectionColumns {
  readonly database: string;
  readonly collection: string;
  readonly columns: StoredColumns;
}

/** The columns kept for every collection of the file. */
export function columnsIn(state: ConnectionStateFile): readonly CollectionColumns[] {
  const collections = field(state, 'collections');
  return Object.keys(collections).flatMap((database) => {
    const ofDatabase = field(collections, database);
    return Object.keys(ofDatabase).flatMap((collection) => {
      const kept = field(ofDatabase, collection);
      if (kept['layout'] === undefined && kept['expanded'] === undefined) {
        return [];
      }
      const columns = { layout: layoutOf(kept['layout']), expanded: strings(kept['expanded']) };
      return [{ database, collection, columns }];
    });
  });
}

/** The state with the columns of a collection replaced, every other field kept; empty ones remove their field. */
export function withColumns(
  state: ConnectionStateFile,
  where: { readonly database: string; readonly collection: string },
  columns: StoredColumns,
): ConnectionStateFile {
  const collections = field(state, 'collections');
  const database = field(collections, where.database);
  const layout = layoutOf(columns.layout);
  const kept = withField(field(database, where.collection), 'layout', emptyToUndefined(layout));
  const expanded = columns.expanded.length === 0 ? undefined : [...columns.expanded];
  const collection = withField(kept, 'expanded', expanded);
  const databaseAfter = withField(database, where.collection, emptyToUndefined(collection));
  const collectionsAfter = withField(collections, where.database, emptyToUndefined(databaseAfter));
  return withField(state, 'collections', emptyToUndefined(collectionsAfter));
}
