/**
 * `saved-queries/<connection id>.json`: the queries saved *for me* on one connection, each with its database and
 * collection (data.md, `saved-query.save`). Version 1.
 *
 * The shapes mirror those of `src/features/saved-query/types.ts`, which this folder may not import (R1.3); a unit test
 * keeps the two the same. A field Datardo does not know is kept and written back, on each query and at the top of the
 * file. A query this version cannot read is kept as it is and written back: a damaged query loses no other.
 */
import type { Json } from '../shared/engine-request';
import type { JsonObject, StoredFile } from './store';

/** One stage of a pipeline, as stored: its name, its body as typed, whether it is enabled. */
export interface StoredStage {
  readonly name: string;
  readonly body: string;
  readonly enabled: boolean;
}

/** A query or a pipeline, as stored: the texts as typed, never parsed. */
export type StoredQueryText =
  | { readonly kind: 'find'; readonly filter: string; readonly sort: string; readonly projection: string }
  | { readonly kind: 'pipeline'; readonly stages: readonly StoredStage[] };

/** A saved query for me, as stored. */
export interface StoredSavedQuery {
  readonly name: string;
  readonly description?: string;
  readonly database: string;
  readonly collection: string;
  readonly query: StoredQueryText;
  /** When it was saved, in milliseconds since 1970. */
  readonly at: number;
}

/** What `saved-queries/<connection id>.json` holds. */
export interface SavedQueriesFile {
  readonly queries: readonly StoredSavedQuery[];
  /** The fields of each query that this version does not know, by {@link savedQueryKey}. */
  readonly unknown: Readonly<Record<string, JsonObject>>;
  /** The queries this version cannot read, kept as they are. */
  readonly unreadable: readonly JsonObject[];
  /** The fields at the top of the file that this version does not know. */
  readonly rest: JsonObject;
}

/** No query saved. */
export const noSavedQueries: SavedQueriesFile = { queries: [], unknown: {}, unreadable: [], rest: {} };

const queryFields = new Set(['name', 'description', 'database', 'collection', 'query', 'at']);

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(object: JsonObject, field: string): string | undefined {
  const value = object[field];
  return typeof value === 'string' ? value : undefined;
}

function stageOf(value: Json): StoredStage | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const name = text(value, 'name');
  const body = text(value, 'body');
  return name === undefined || body === undefined ? undefined : { name, body, enabled: value['enabled'] !== false };
}

/** A query or a pipeline read back from its stored object; `undefined` when it is not one. */
export function storedQueryOf(value: Json | undefined): StoredQueryText | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  if (value['kind'] === 'pipeline') {
    const stages = value['stages'];
    if (!Array.isArray(stages)) {
      return undefined;
    }
    const read = (stages as readonly Json[]).map(stageOf);
    return read.every((stage) => stage !== undefined) ? { kind: 'pipeline', stages: read } : undefined;
  }
  if (value['kind'] !== 'find') {
    return undefined;
  }
  return {
    kind: 'find',
    filter: text(value, 'filter') ?? '',
    sort: text(value, 'sort') ?? '',
    projection: text(value, 'projection') ?? '',
  };
}

/** The key of a saved query in {@link SavedQueriesFile.unknown}: its database, collection and name. */
export function savedQueryKey(query: Pick<StoredSavedQuery, 'database' | 'collection' | 'name'>): string {
  return JSON.stringify([query.database, query.collection, query.name]);
}

/** One saved query of the file; `undefined` when a field it needs is missing or wrong. */
export function savedQueryOf(object: JsonObject): StoredSavedQuery | undefined {
  const name = text(object, 'name');
  const database = text(object, 'database');
  const collection = text(object, 'collection');
  const query = storedQueryOf(object['query']);
  const at = object['at'];
  if (name === undefined || database === undefined || collection === undefined || query === undefined) {
    return undefined;
  }
  const description = text(object, 'description');
  return {
    name,
    ...(description === undefined ? {} : { description }),
    database,
    collection,
    query,
    at: typeof at === 'number' && Number.isFinite(at) ? at : 0,
  };
}

function readQueries(object: JsonObject): SavedQueriesFile {
  const list = object['queries'] ?? [];
  if (!Array.isArray(list)) {
    throw new Error('queries is not a list.');
  }
  const read = (list as readonly Json[]).filter(isObject).map((each) => ({ object: each, query: savedQueryOf(each) }));
  return {
    queries: read.flatMap((each) => (each.query === undefined ? [] : [each.query])),
    unknown: Object.fromEntries(
      read.flatMap((each) =>
        each.query === undefined
          ? []
          : [
              [
                savedQueryKey(each.query),
                Object.fromEntries(Object.entries(each.object).filter(([field]) => !queryFields.has(field))),
              ],
            ],
      ),
    ),
    unreadable: read.flatMap((each) => (each.query === undefined ? [each.object] : [])),
    rest: Object.fromEntries(Object.entries(object).filter(([field]) => field !== 'queries' && field !== 'version')),
  };
}

const safeId = /^[A-Za-z0-9_-]+$/u;

/** The kind of file the saved queries for me of a connection are; throws for an id that is not a file name. */
export function savedQueriesFile(connection: string): StoredFile<SavedQueriesFile> {
  if (!safeId.test(connection)) {
    throw new Error(`The connection id ${connection} cannot name a file.`);
  }
  return {
    path: `saved-queries/${connection}.json`,
    holds: 'The saved queries of a connection',
    version: 1,
    migrations: {},
    empty: () => noSavedQueries,
    read: readQueries,
    write: (value) => ({
      ...value.rest,
      queries: [
        ...value.queries.map((query) => ({
          ...(value.unknown[savedQueryKey(query)] ?? {}),
          ...(query as unknown as JsonObject),
        })),
        ...value.unreadable,
      ],
    }),
  };
}

/** The saved queries for me of one collection, in the order of the file. */
export function queriesOfCollection(
  file: SavedQueriesFile,
  database: string,
  collection: string,
): readonly StoredSavedQuery[] {
  return file.queries.filter((each) => each.database === database && each.collection === collection);
}

/**
 * The file with the saved queries of one collection replaced by `queries` (`saved-query.save`, `.rename`, `.delete`,
 * `.move` give the whole list of the collection). What this version does not know of a query that stays is kept.
 */
export function withCollectionQueries(
  file: SavedQueriesFile,
  where: { readonly database: string; readonly collection: string },
  queries: readonly StoredSavedQuery[],
): SavedQueriesFile {
  const others = file.queries.filter(
    (each) => each.database !== where.database || each.collection !== where.collection,
  );
  const kept = [
    ...others,
    ...queries.map((each) => ({ ...each, database: where.database, collection: where.collection })),
  ];
  const keys = new Set(kept.map(savedQueryKey));
  return {
    ...file,
    queries: kept,
    unknown: Object.fromEntries(Object.entries(file.unknown).filter(([key]) => keys.has(key))),
  };
}

/** The file with the queries of a collection carried to its new name (`manage.rename-collection`). */
export function withCollectionRenamed(
  file: SavedQueriesFile,
  database: string,
  names: { readonly from: string; readonly to: string },
): SavedQueriesFile {
  const moved = (query: StoredSavedQuery): StoredSavedQuery =>
    query.database === database && query.collection === names.from ? { ...query, collection: names.to } : query;
  const unknown = Object.fromEntries(
    file.queries.flatMap((query) => {
      const fields = file.unknown[savedQueryKey(query)];
      return fields === undefined ? [] : [[savedQueryKey(moved(query)), fields]];
    }),
  );
  return { ...file, queries: file.queries.map(moved), unknown };
}
