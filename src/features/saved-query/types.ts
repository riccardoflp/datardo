/**
 * What the cards of the saved-query area share: a query or a pipeline as typed (`QueryText`), a saved query *for me*
 * or *in the folder*, a recent query, the collection they belong to, how they are read back from the arguments of a
 * feature and from what the main process answers, and the app steps and file steps that change them.
 *
 * The shapes kept in the data folder are mirrored by `src/storage/saved-queries.ts` and
 * `src/storage/connection-state.ts`, which may not import this folder (R1.3); a unit test keeps them the same.
 *
 * The app actions the main process carries out for this area, with their arguments:
 *
 * - `saved-query.set-recent` `{ connection, database, collection, recent }`: the recent queries of the collection.
 * - `saved-query.set-mine` `{ connection, database, collection, queries }`: the saved queries for me of the collection.
 * - `saved-query.set-folder` `{ connection, queriesFolder }`: the queries folder of the connection.
 * - `saved-query.reveal` `{ queriesFolder, file }`: shows the file in the system's file manager.
 * - `saved-query.load` `{ connection, database, collection, tab?, query }`: puts the query in the collection tab,
 *   opening one when `tab` is absent and none is open.
 * - the reads `saved-query.list`, `saved-query.read-folder` and `saved-query.connection-list` (their modules).
 *
 * The file steps write, rename and delete files of the queries folder with the writer {@link queryFileWriter}.
 */
import type { Json } from '../../shared/engine-request';
import type { AppStep, Answers, Context, FileStep, Platform } from '../../shared/feature';
import { noDanger, run, type Outcome } from '../../shared/feature';
import type { ConnectionId, TabId } from '../../shared/ids';
import { tabId } from '../../shared/ids';
import { placeOf, type Stage } from '../aggregate/types';

export type { Stage };

/** A find as typed in the query bar: its filter, sort and projection in mongosh syntax. */
export interface FindText {
  readonly kind: 'find';
  readonly filter: string;
  readonly sort: string;
  readonly projection: string;
}

/** A pipeline as the pipeline editor holds it: every stage, disabled ones included. */
export interface PipelineText {
  readonly kind: 'pipeline';
  readonly stages: readonly Stage[];
}

/** A query or a pipeline, as typed (glossary, "query", "pipeline"): texts, never parsed here. */
export type QueryText = FindText | PipelineText;

/** The two places of a saved query (glossary, "for me, in the folder"). */
export type SavedQueryPlace = 'me' | 'folder';

/** The content of a saved query file (`saved-query.parse-file`, `saved-query.file-format`). */
export interface QueryFile {
  readonly name: string;
  readonly description?: string;
  /** The name of the only connections it is listed on. Datardo never adds it and never removes it. */
  readonly connection?: string;
  readonly database: string;
  readonly collection: string;
  readonly query: QueryText;
}

/** A saved query for me: kept in Datardo's data for one connection. */
export interface MySavedQuery {
  readonly place: 'me';
  readonly name: string;
  readonly description?: string;
  readonly database: string;
  readonly collection: string;
  readonly query: QueryText;
  /** When it was saved, in milliseconds since 1970. */
  readonly at: number;
}

/** A saved query in the folder: a file of the connection's queries folder. */
export interface FolderSavedQuery extends QueryFile {
  readonly place: 'folder';
  /** Its path inside the queries folder, with `/`: `shop/orders/paid.json`. */
  readonly file: string;
}

/** A saved query (glossary, "saved query"). */
export type SavedQuery = MySavedQuery | FolderSavedQuery;

/** A recent query (glossary, "recent query"): a query or a pipeline that ran, and when it last ran. */
export interface RecentQuery {
  readonly query: QueryText;
  readonly at: number;
}

/** The collection a feature of this area works on, on a saved connection. */
export interface CollectionScope {
  readonly connection: ConnectionId;
  readonly connectionName: string;
  /** The queries folder of the connection, when it has one. */
  readonly queriesFolder?: string;
  readonly database: string;
  readonly collection: string;
  /** The collection tab it was started from. */
  readonly tab?: TabId;
}

/** The writer of the main process that writes, renames and deletes the files of a queries folder. */
export const queryFileWriter = 'saved-query.file';

type Fields = Readonly<Record<string, unknown>>;

/** The fields of an object; empty for any other value. */
export function fieldsOf(value: unknown): Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : {};
}

/** The arguments a feature was started with (`Intent.args`), as an object; empty when there are none. */
export function argumentsOf(answers: Answers): Fields {
  return fieldsOf(answers['args']);
}

function textOf(fields: Fields, name: string): string {
  const value = fields[name];
  return typeof value === 'string' ? value : '';
}

function stageOf(value: unknown): Stage | undefined {
  const fields = fieldsOf(value);
  const { name, body } = fields;
  return typeof name === 'string' && typeof body === 'string'
    ? { name, body, enabled: fields['enabled'] !== false }
    : undefined;
}

/** A query read back from JSON (the arguments of a feature, a reply of the main process); `undefined` if not one. */
export function readQueryText(value: unknown): QueryText | undefined {
  const fields = fieldsOf(value);
  if (fields['kind'] === 'find') {
    return {
      kind: 'find',
      filter: textOf(fields, 'filter'),
      sort: textOf(fields, 'sort'),
      projection: textOf(fields, 'projection'),
    };
  }
  if (fields['kind'] !== 'pipeline' || !Array.isArray(fields['stages'])) {
    return undefined;
  }
  const stages = (fields['stages'] as readonly unknown[]).map(stageOf);
  return stages.every((stage) => stage !== undefined) ? { kind: 'pipeline', stages } : undefined;
}

/** A query as JSON, for the arguments of a step. */
export function queryJson(query: QueryText): Json {
  return query.kind === 'find'
    ? { kind: 'find', filter: query.filter, sort: query.sort, projection: query.projection }
    : {
        kind: 'pipeline',
        stages: query.stages.map((stage) => ({ name: stage.name, body: stage.body, enabled: stage.enabled })),
      };
}

/**
 * A query as it is kept (`saved-query.recent`, `saved-query.save`): a find's texts without the spaces around them;
 * a pipeline's stages with their names trimmed, their bodies as typed and whether they are enabled.
 */
export function keptQuery(query: QueryText): QueryText {
  return query.kind === 'find'
    ? { kind: 'find', filter: query.filter.trim(), sort: query.sort.trim(), projection: query.projection.trim() }
    : { kind: 'pipeline', stages: query.stages.map((stage) => ({ ...stage, name: stage.name.trim() })) };
}

/** Whether a find has nothing typed: its filter, sort and projection are all empty. */
export function isEmptyFind(query: FindText): boolean {
  return query.filter.trim() === '' && query.sort.trim() === '' && query.projection.trim() === '';
}

/** A saved query for me as JSON, for the arguments of `saved-query.set-mine` (without its place). */
export function mineJson(query: MySavedQuery): Json {
  return {
    name: query.name,
    ...(query.description === undefined ? {} : { description: query.description }),
    database: query.database,
    collection: query.collection,
    query: queryJson(query.query),
    at: query.at,
  };
}

/** The app step that sets the saved queries for me of a collection: `queries` is the whole list after the change. */
export function mineStep(scope: CollectionScope, queries: readonly MySavedQuery[], stepText: string): AppStep {
  return appStep('saved-query.set-mine', { ...scopeJson(scope), queries: queries.map(mineJson) }, stepText);
}

/** The saved queries for me among those of a collection. */
export function mineIn(saved: readonly SavedQuery[]): readonly MySavedQuery[] {
  return saved.flatMap((each) => (each.place === 'me' ? [each] : []));
}

/** A recent query as JSON, for the arguments of `saved-query.set-recent`. */
export function recentJson(recent: RecentQuery): Json {
  return { query: queryJson(recent.query), at: recent.at };
}

/** The scope of a collection of a saved connection, with its name and queries folder. */
export function scopeIn(
  context: Context,
  where: { readonly connection: string; readonly database: string; readonly collection: string },
  tab?: TabId,
): CollectionScope | undefined {
  const saved = context.state.connections.saved.find((each) => each.id === where.connection);
  if (saved === undefined) {
    return undefined;
  }
  const folder = saved.queriesFolder?.trim();
  return {
    connection: saved.id,
    connectionName: saved.name,
    ...(folder === undefined || folder === '' ? {} : { queriesFolder: folder }),
    database: where.database,
    collection: where.collection,
    ...(tab === undefined ? {} : { tab }),
  };
}

/**
 * The collection a feature works on: `args.connection`, `args.database` and `args.collection` when they are given
 * (Go to, a pin, a tool of the MCP server), else the collection tab named by `args.tab` or active, else the target.
 */
export function scopeOf(context: Context, answers: Answers): CollectionScope | undefined {
  const args = argumentsOf(answers);
  const { connection, database, collection, tab } = args;
  const named = typeof tab === 'string' ? tabId(tab) : undefined;
  if (typeof connection === 'string' && typeof database === 'string' && typeof collection === 'string') {
    return scopeIn(context, { connection, database, collection }, named);
  }
  const place = placeOf(context, answers);
  return place === undefined ? undefined : scopeIn(context, place, place.tab);
}

/** The collection's arguments of an app step or a read: its connection, database and collection. */
export function scopeJson(scope: CollectionScope): { readonly [key: string]: Json } {
  return { connection: scope.connection, database: scope.database, collection: scope.collection };
}

/** `Local / shop / orders`, as the steps of the recent queries write the collection. */
export function scopePath(scope: CollectionScope): string {
  return `${scope.connectionName} / ${scope.database} / ${scope.collection}`;
}

/** `shop.orders`. */
export function namespaceOf(where: { readonly database: string; readonly collection: string }): string {
  return `${where.database}.${where.collection}`;
}

/** The full path of a file of the queries folder, with the separator of the platform: what the steps show. */
export function fullPath(queriesFolder: string, file: string, platform: Platform): string {
  const separator = platform === 'windows' ? '\\' : '/';
  const folder = queriesFolder.replace(/[\\/]+$/u, '');
  return `${folder}${separator}${file.split('/').join(separator)}`;
}

/** An app step: the action the main process carries out, its arguments, and its text as the Log writes it. */
export function appStep(action: string, args: Json, text: string): AppStep {
  return { kind: 'app', action, args, text };
}

/** A file step on a file of the queries folder, carried out by {@link queryFileWriter}. */
export function fileStep(
  action: FileStep['action'],
  where: { readonly queriesFolder: string; readonly file: string; readonly platform: Platform },
  text: string,
  more: { readonly [key: string]: Json } = {},
): FileStep {
  return {
    kind: 'file',
    text,
    action,
    path: fullPath(where.queriesFolder, where.file, where.platform),
    content: { writer: queryFileWriter, args: { queriesFolder: where.queriesFolder, file: where.file, ...more } },
  };
}

/** A plan with nothing to do: the query is already as the feature would leave it, or is gone. */
export function nothingToDo(title: string, cannot: string): Outcome {
  return run({ title, steps: [], danger: noDanger, undo: { cannot }, publishes: false, after: [] });
}

/** Which saved query a feature was started on: `args.saved`, `{ place, name, file? }`. */
export interface SavedQueryRef {
  readonly place: SavedQueryPlace;
  readonly name: string;
  readonly file?: string;
}

/** The saved query `args.saved` names. */
export function savedRefOf(answers: Answers): SavedQueryRef | undefined {
  const saved = fieldsOf(argumentsOf(answers)['saved']);
  const { place, name, file } = saved;
  if ((place !== 'me' && place !== 'folder') || typeof name !== 'string') {
    return undefined;
  }
  return { place, name, ...(typeof file === 'string' ? { file } : {}) };
}

/** A saved query as `args.saved` names it, for the arguments of the controls that start a feature on it. */
export function savedRef(query: SavedQuery): Json {
  return query.place === 'me'
    ? { place: 'me', name: query.name }
    : { place: 'folder', name: query.name, file: query.file };
}

/** The saved query of a list that a reference names: for me by its name, in the folder by its file. */
export function findSaved(saved: readonly SavedQuery[], ref: SavedQueryRef): SavedQuery | undefined {
  return saved.find((each) =>
    ref.place === 'me'
      ? each.place === 'me' && each.name === ref.name
      : each.place === 'folder' && each.file === ref.file,
  );
}
