/**
 * What the features of the index area share: the collection a feature was started on, the indexes and search indexes
 * as `index.list` and `index.list-search` return them, the values the user typed, and the steps sent to MongoDB.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Answers, Context, EngineStep, OnFailure } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { activeTabOf } from '../../shared/state/tabs';
import type { Target } from '../../shared/target';
import { startArgs } from '../nav/types';
import { stepText } from '../runner/step-text';

/** A document of JSON: an object that is not an array. */
export type JsonDocument = { readonly [key: string]: Json };

/** Whether a value is a document of JSON (not an array, not bytes). */
export function isDocument(value: unknown): value is JsonDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array);
}

/**
 * Text the user typed in mongosh syntax, as `query.parse` reads it in the caller: nothing typed, a value, or the
 * parse error.
 */
export type ParsedText =
  | { readonly kind: 'empty' }
  | { readonly kind: 'value'; readonly value: Json }
  | { readonly kind: 'invalid'; readonly message: string };

/** An input of a dialog in mongosh syntax: the text as typed and what it reads as. */
export interface TextInput {
  readonly text: string;
  readonly parsed: ParsedText;
}

/** A value as text: a string as it is, anything else as JSON. */
export function jsonText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value === undefined ? null : value);
}

/** Nothing typed. */
export const emptyInput: TextInput = { text: '', parsed: { kind: 'empty' } };

/** The input that shows a value: its text in mongosh syntax, and the value itself. */
export function inputOf(text: string, value: Json): TextInput {
  return { text, parsed: { kind: 'value', value } };
}

/**
 * An answer that should hold text the user typed, as {@link ParsedText}. The index dialog answers with what
 * `query.parse` read; a generic form answers with the text itself, which is read here as JSON (a part of mongosh
 * syntax) until the dialog is drawn.
 */
export function parsedAnswer(answer: unknown): ParsedText {
  if (typeof answer === 'string') {
    return answer.trim() === '' ? { kind: 'empty' } : readJson(answer);
  }
  if (
    isDocument(answer) &&
    (answer['kind'] === 'empty' || answer['kind'] === 'value' || answer['kind'] === 'invalid')
  ) {
    return answer as unknown as ParsedText;
  }
  return answer === undefined ? { kind: 'empty' } : { kind: 'value', value: answer as Json };
}

function readJson(text: string): ParsedText {
  try {
    return { kind: 'value', value: JSON.parse(text) as Json };
  } catch (error: unknown) {
    return { kind: 'invalid', message: error instanceof Error ? error.message : String(error) };
  }
}

const numberWrappers = new Set(['$numberInt', '$numberLong', '$numberDouble']);

/** A number of canonical Extended JSON as a plain number, when it is one exactly; `undefined` otherwise. */
function plainNumber(value: JsonDocument): number | undefined {
  const [key, ...rest] = Object.keys(value);
  const inner = key === undefined ? undefined : value[key];
  if (rest.length > 0 || key === undefined || !numberWrappers.has(key) || typeof inner !== 'string') {
    return undefined;
  }
  const number = Number(inner);
  return Number.isFinite(number) && (key !== '$numberLong' || Number.isSafeInteger(number)) ? number : undefined;
}

/**
 * A value of canonical Extended JSON with its numbers written plainly (`{ "$numberInt": "1" }` is `1`), as relaxed
 * Extended JSON writes them; dates, ids, decimals and the numbers JSON cannot hold exactly keep their wrapper.
 */
export function relaxedValue(value: Json): Json {
  if (Array.isArray(value)) {
    return (value as readonly Json[]).map(relaxedValue);
  }
  if (!isDocument(value)) {
    return value;
  }
  const number = plainNumber(value);
  if (number !== undefined) {
    return number;
  }
  const keys = Object.keys(value);
  return keys.length === 1 && (keys[0] === '$date' || keys[0] === '$oid') ? value : mapValues(value);
}

function mapValues(value: JsonDocument): JsonDocument {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relaxedValue(item)]));
}

/** A relaxed document: `relaxedValue` of a document, or `{}`. */
export function relaxedDocument(value: unknown): JsonDocument {
  const relaxed = isDocument(value) ? relaxedValue(value) : {};
  return isDocument(relaxed) ? relaxed : {};
}

/** A plain number, or one of canonical Extended JSON; `undefined` otherwise. */
export function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (!isDocument(value)) {
    return undefined;
  }
  const wrapper = ['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal'].find(
    (name) => typeof value[name] === 'string',
  );
  const number = wrapper === undefined ? Number.NaN : Number(value[wrapper]);
  return Number.isNaN(number) ? undefined : number;
}

/** A date of Extended JSON (`{ $date: { $numberLong } }`, `{ $date: "…" }`) in milliseconds since 1970. */
export function dateOf(value: unknown): number | undefined {
  if (!isDocument(value)) {
    return undefined;
  }
  const inner = value['$date'];
  const time = typeof inner === 'string' ? Date.parse(inner) : numberOf(inner);
  return time === undefined || Number.isNaN(time) ? undefined : time;
}

/** An error of a server, as a failed reply carries it. */
export interface ServerError {
  readonly message: string;
  readonly code?: number | string;
  readonly codeName?: string;
}

/**
 * The error of a request that failed: an `Error` (the engine's, with its `code`), a failed reply `{ kind: 'error',
 * message }`, or a reply of MongoDB with `ok: 0`; `undefined` for a reply.
 */
export function failureOf(reply: unknown): ServerError | undefined {
  if (reply instanceof Error) {
    const code = (reply as { code?: unknown }).code;
    return { message: reply.message, ...(typeof code === 'number' || typeof code === 'string' ? { code } : {}) };
  }
  if (!isDocument(reply)) {
    return undefined;
  }
  const failed = reply['kind'] === 'error' || (reply['ok'] !== undefined && numberOf(reply['ok']) === 0);
  if (!failed) {
    return undefined;
  }
  const message = reply['message'] ?? reply['errmsg'];
  const code = numberOf(reply['code']) ?? reply['code'];
  const codeName = reply['codeName'];
  return {
    message: typeof message === 'string' ? message : 'The server refused the command.',
    ...(typeof code === 'number' || typeof code === 'string' ? { code } : {}),
    ...(typeof codeName === 'string' ? { codeName } : {}),
  };
}

/** The keys and the options of an index, as `createIndex` takes them; values relaxed. */
export interface IndexDefinition {
  readonly keys: JsonDocument;
  readonly options: JsonDocument;
}

/** The uses one member counts. */
export interface MemberUsage {
  readonly shard?: string;
  readonly host: string;
  readonly uses: number;
  /** When its counter started, in milliseconds since 1970. */
  readonly since?: number;
}

/** How far a build is: done and total of its phase. */
export interface BuildProgress {
  readonly done: number;
  readonly total: number;
  readonly phase?: string;
}

/** An index of the collection, as `index.list` returns it. */
export interface IndexInfo {
  readonly name: string;
  readonly key: JsonDocument;
  /** Every other option as the server reports it, relaxed (`v`, `unique`, `expireAfterSeconds`, …). */
  readonly options: JsonDocument;
  readonly size?: number;
  readonly uses?: number;
  readonly since?: number;
  /** Only when more than one member reports uses. */
  readonly members?: readonly MemberUsage[];
  readonly building: boolean;
  readonly progress?: BuildProgress;
}

/** The sizes of the collection, summed over the shards; absent when they could not be read. */
export interface IndexTotals {
  readonly documents?: number;
  readonly dataSize?: number;
  readonly indexSize?: number;
}

/** What `index.list` returns. */
export interface IndexList {
  readonly indexes: readonly IndexInfo[];
  readonly totals: IndexTotals;
}

/** The two types of search index. */
export type SearchIndexType = 'search' | 'vectorSearch';

/** The state of one host of a search index (`statusDetail`). */
export interface SearchHost {
  readonly host: string;
  readonly status?: string;
  readonly queryable?: boolean;
  readonly message?: string;
  /** The status of the new definition being built beside the main one. */
  readonly staged?: string;
}

/** A search index of the collection, as `index.list-search` returns it. */
export interface SearchIndexInfo {
  readonly name: string;
  /** `search`, `vectorSearch`, or what the server says. */
  readonly type: string;
  readonly status?: string;
  readonly queryable?: boolean;
  readonly definition: JsonDocument;
  readonly message?: string;
  readonly hosts?: readonly SearchHost[];
}

/** What `index.list-search` returns: the indexes, a server without search, or an error. */
export type SearchIndexList =
  | { readonly kind: 'indexes'; readonly indexes: readonly SearchIndexInfo[] }
  | { readonly kind: 'unsupported'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

/** A field of the documents sampled, as `query.autocomplete` gives it to the search index dialog. */
export interface SampledField {
  readonly path: string;
  /** Its BSON types: `string`, `int`, `object`, `array`, … */
  readonly types: readonly string[];
  /** The share of the documents that have it, from 0 to 1. */
  readonly ratio?: number;
  /** For arrays of numbers only: the shortest and longest seen. */
  readonly vector?: { readonly min: number; readonly max: number };
}

/** The collection a feature of this area was started on, with its connection. */
export interface IndexSubject {
  readonly connection: ConnectionView;
  readonly database: string;
  readonly collection: string;
  readonly view: boolean;
  /** The arguments the feature was started with. */
  readonly args: Readonly<Record<string, unknown>>;
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The collection a feature was started on: its arguments (`{ connection, database, collection, view }`), the target
 * when it is a collection, or the collection tab that is active (Go to). `undefined` when none is known.
 */
export function subjectOf(context: Context, answers: Answers): IndexSubject | undefined {
  const args = startArgs(answers);
  const target = context.target.kind === 'collection' ? context.target : undefined;
  const tab = activeTabOf(context.state.tabs)?.shows;
  const shown = tab?.kind === 'collection' ? tab : undefined;
  const id =
    textOf(args['connection']) ??
    target?.connection ??
    (context.target.kind === 'connection' ? context.target.connection : shown?.connection);
  const database = textOf(args['database']) ?? target?.database ?? shown?.database;
  const collection = textOf(args['collection']) ?? target?.collection ?? shown?.collection;
  const connection = context.state.connections.saved.find((each) => each.id === id);
  if (connection === undefined || database === undefined || collection === undefined) {
    return undefined;
  }
  const view = args['view'] === true || (args['view'] === undefined && shown?.view === true);
  return { connection, database, collection, view, args };
}

/** The target the steps are written against, so that their text reads `db.orders.…`. */
export function collectionTarget(subject: IndexSubject): Target {
  return {
    kind: 'collection',
    connection: subject.connection.id,
    database: subject.database,
    collection: subject.collection,
  };
}

/** The arguments of a Read of this area about the subject's collection. */
export function readArgs(subject: IndexSubject, more: JsonDocument = {}): JsonDocument {
  return { connection: subject.connection.id, database: subject.database, collection: subject.collection, ...more };
}

/** The connection, database and collection of a Read's arguments. */
export function readTarget(args: Json): { connection: string; database: string; collection: string } {
  const object = isDocument(args) ? args : {};
  const text = (name: string): string => (typeof object[name] === 'string' ? object[name] : '');
  return { connection: text('connection'), database: text('database'), collection: text('collection') };
}

/** A request to the subject's collection, or with `on: 'database'` to its database. */
export function mongoRequest(
  subject: Pick<IndexSubject, 'database' | 'collection'>,
  method: string,
  args: readonly Json[],
  on: 'collection' | 'database' = 'collection',
): MongoRequest {
  return {
    engine: 'mongodb',
    database: subject.database,
    ...(on === 'collection' ? { collection: subject.collection } : {}),
    method,
    arguments: args,
  };
}

/** A step that writes, with its text as `runner.step-text` writes it. */
export function writeStep(subject: IndexSubject, request: MongoRequest, onFailure?: OnFailure): EngineStep {
  const step = { kind: 'engine', connection: connectionId(subject.connection.id), request, writes: true } as const;
  return {
    ...step,
    text: stepText(step, collectionTarget(subject)),
    ...(onFailure === undefined ? {} : { onFailure }),
  };
}

/** A whole number with a comma every three digits and the word after it, singular for 1: `1,204 uses`. */
export function counted(value: number, one: string, many: string): string {
  const digits = String(Math.trunc(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  return `${value < 0 ? '-' : ''}${digits} ${value === 1 ? one : many}`;
}
