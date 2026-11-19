/**
 * What the column actions share: the column and the collection they were started on, the filter of the query bar,
 * the counts they read, whether their write will be recorded, and the steps they send. The three operations ask,
 * count, confirm and then write as **Update many** does (field.md, "Common to the three operations").
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json, MongoRequest } from '../../shared/engine-request';
import {
  needRead,
  refuse,
  type After,
  type Answers,
  type AppStep,
  type Context,
  type Danger,
  type EngineStep,
  type Outcome,
} from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { mongoshValue } from '../../shared/mongosh-value';
import type { Target } from '../../shared/target';
import { startArgs } from '../nav/types';
import { stepText } from '../runner/step-text';
import { setting } from '../settings/read';
import { text } from './text';

/** A document of JSON: an object that is not an array. */
export type JsonDocument = { readonly [key: string]: Json };

/** A field's dotted name: `address.city` (glossary, "field path"). */
export type FieldPath = string;

/** Whether a value is a document of JSON (not an array, not bytes). */
export function isDocument(value: unknown): value is JsonDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array);
}

const numberWrappers = ['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal'];

/** A number of canonical Extended JSON (`{ "$numberInt": "3" }`) or of plain JSON; `undefined` otherwise. */
export function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (!isDocument(value)) {
    return undefined;
  }
  const wrapper = numberWrappers.find((name) => typeof value[name] === 'string');
  const number = wrapper === undefined ? Number.NaN : Number(value[wrapper]);
  return Number.isNaN(number) ? undefined : number;
}

/**
 * The filter of the query bar, as `query.parse` read it in the caller: nothing typed, a value, or the parse error. The
 * same shape `chart.filter-from-mark` is given.
 */
export type ParsedText =
  | { readonly kind: 'empty' }
  | { readonly kind: 'value'; readonly value: Json }
  | { readonly kind: 'invalid'; readonly message: string };

/** The column and the collection a column action was started on. */
export interface FieldPlace {
  readonly connection: ConnectionView;
  readonly database: string;
  readonly collection: string;
  /** The field path of the column: `items.sku` for the column `items[].sku`. */
  readonly field: FieldPath;
  /** For a field of the elements of an expanded array, the field path of that array: `items`. */
  readonly array?: FieldPath;
  readonly view: boolean;
  /** The filter of the query bar, read. */
  readonly filter: ParsedText;
  /** The filter as written in the query bar, for the title of the undo history. */
  readonly written: string;
}

function parsedOf(value: unknown): ParsedText {
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return { kind: 'empty' };
  }
  if (isDocument(value) && (value['kind'] === 'empty' || value['kind'] === 'value' || value['kind'] === 'invalid')) {
    return value as unknown as ParsedText;
  }
  return { kind: 'value', value: value as Json };
}

function textOf(fields: Readonly<Record<string, unknown>>, name: string): string | undefined {
  const value = fields[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The place a column action was started on, from its arguments: `{ connection, database, collection, field, array?,
 * view?, filter, written? }`, where `filter` is what `query.parse` read from the query bar. The connection, database
 * and collection fall back to the target. `undefined` when the connection is not a saved one.
 */
export function placeOf(context: Context, answers: Answers): FieldPlace | undefined {
  const args = startArgs(answers);
  const target = context.target.kind === 'collection' ? context.target : undefined;
  const id = textOf(args, 'connection') ?? target?.connection;
  const connection = context.state.connections.saved.find((each) => each.id === id);
  const field = textOf(args, 'field');
  if (connection === undefined || field === undefined) {
    return undefined;
  }
  const array = textOf(args, 'array');
  return {
    connection,
    database: textOf(args, 'database') ?? target?.database ?? '',
    collection: textOf(args, 'collection') ?? target?.collection ?? '',
    field,
    ...(array === undefined ? {} : { array }),
    view: args['view'] === true,
    filter: parsedOf(args['filter']),
    written: textOf(args, 'written') ?? '',
  };
}

/** The refusal codes a check raises, written whole by each feature (R4.2). */
export interface GuardCodes {
  readonly readOnly: string;
  readonly view: string;
  readonly invalidFilter: string;
}

/** The refusals every column action makes first: a read-only connection, a view, a filter that does not parse. */
export function guard(place: FieldPlace, codes: GuardCodes): Outcome | undefined {
  if (place.connection.readOnly) {
    return refuse(codes.readOnly, text.readOnly(place.connection.name));
  }
  if (place.view) {
    return refuse(codes.view, text.view);
  }
  return place.filter.kind === 'invalid' || (place.filter.kind === 'value' && !isDocument(place.filter.value))
    ? refuse(codes.invalidFilter, text.invalidFilter)
    : undefined;
}

/** The user's filter as a document: `{}` when nothing is typed. */
export function filterOf(place: FieldPlace): JsonDocument {
  return place.filter.kind === 'value' && isDocument(place.filter.value) ? place.filter.value : {};
}

/** Whether the filter of the query bar is empty: `{}` once parsed, blank text included (D39). */
export function isEmptyFilter(place: FieldPlace): boolean {
  return Object.keys(filterOf(place)).length === 0;
}

/** `<scope>`: *of people* for an empty filter, *matching the filter* otherwise. */
export function scopeOf(place: FieldPlace): string {
  return text.scope(place.collection, isEmptyFilter(place));
}

/** The column as the table names it: `items[].sku` for a field of the elements of `items`, the field otherwise. */
export function labelOf(place: FieldPlace): string {
  return place.array === undefined ? place.field : `${place.array}[]${place.field.slice(place.array.length)}`;
}

/** The time limit of each count, in ms (the cards' 60,000). */
export const countTimeLimitMs = 60_000;

/**
 * The read of how many documents match `filter`, exactly (`query.count`), under `key`. `query.count` takes the filter
 * as text, so the filter is written in mongosh syntax, which `query.parse` reads back with its types.
 */
export function countNeed(context: Context, place: FieldPlace, key: string, filter: JsonDocument): Outcome {
  const args: Json = {
    connection: place.connection.id,
    database: place.database,
    collection: place.collection,
    filter: mongoshValue(filter),
    at: context.now,
    kind: 'collection',
    exact: true,
  };
  return needRead(key, 'query.count', args);
}

/** The count read under `key`, a number or `{ count }`; `undefined` while it was not read. */
export function countOf(answers: Answers, key: string): number | undefined {
  const count = answers[key];
  return isDocument(count) ? numberOf(count['count']) : numberOf(count);
}

/**
 * Whether the write of `count` documents will be recorded in the undo history, known before the confirmation: the
 * rules 2 and 3 of `undo.note` (the undo history on, for the connection, and within the number of documents).
 */
export function isRecorded(context: Context, connection: ConnectionView, count: number): boolean {
  const settings = context.state.settings;
  return (
    setting(settings, 'datardo.undo.enabled') &&
    connection.keepsUndo &&
    count <= setting(settings, 'datardo.undo.maxDocumentsPerOperation')
  );
}

/** The two buttons of a confirmation: with a filter, and with an empty filter. */
export interface Buttons {
  readonly some: string;
  readonly all: string;
}

/**
 * The danger of a column action (D39): *destructive*, asking the name of the collection, when the filter of the query
 * bar is empty and the write will not be recorded; *confirm* otherwise. With an empty filter the confirmation says so
 * and its button is **`<Action>` in all**.
 */
export function dangerOf(place: FieldPlace, lines: readonly string[], recorded: boolean, buttons: Buttons): Danger {
  if (!isEmptyFilter(place)) {
    return { kind: 'confirm', text: lines.join('\n'), button: buttons.some };
  }
  const all = [...lines, text.emptyFilter].join('\n');
  return recorded
    ? { kind: 'confirm', text: all, button: buttons.all }
    : { kind: 'destructive', text: all, button: buttons.all, name: place.collection };
}

/** The collection as the text of a step names it. */
function targetOf(place: FieldPlace): Target {
  return {
    kind: 'collection',
    connection: place.connection.id,
    database: place.database,
    collection: place.collection,
  };
}

/** How long the write may take, in ms (Datardo's choice: as long as the counts before it). */
export const writeTimeLimitMs = 60_000;

/** `db.people.updateMany(<filter>, <update>)`, as the confirmation shows it and the Log records it. */
export function updateManyStep(place: FieldPlace, filter: JsonDocument, update: Json): EngineStep {
  const request: MongoRequest = {
    engine: 'mongodb',
    database: place.database,
    collection: place.collection,
    method: 'updateMany',
    arguments: [filter, update],
    timeLimitMs: writeTimeLimitMs,
  };
  const step = { kind: 'engine', connection: connectionId(place.connection.id), request, writes: true } as const;
  return { ...step, text: stepText(step, targetOf(place)) };
}

/** The app action that renames or drops a field in the columns' layout of a collection (`field.layout-follows`). */
export const layoutAction = 'table.rename-in-layout';

/** The app step that makes the columns' layout follow the field: renamed to `to`, or dropped without it. */
export function layoutStep(place: FieldPlace, stepLine: string, to?: FieldPath): AppStep {
  return {
    kind: 'app',
    text: stepLine,
    action: layoutAction,
    args: {
      connection: place.connection.id,
      database: place.database,
      collection: place.collection,
      from: place.field,
      ...(to === undefined ? {} : { to }),
    },
  };
}

/** What the undo history keeps: the documents matching the filter the step sends, and the filter as written. */
export function keptOf(place: FieldPlace, filter: JsonDocument): Json {
  return {
    connection: place.connection.id,
    database: place.database,
    collection: place.collection,
    filter,
    written: filterOf(place),
  };
}

/** The longest title of an operation in the undo history, in characters (the cards' 300). */
export const longestTitle = 300;

/** The title of the undo history: the action, then ` where <filter>` when there is one, cut at 300 characters. */
export function undoTitle(action: string, place: FieldPlace): string {
  const written = place.written.replace(/\s+/gu, ' ').trim();
  const filter = written === '' ? mongoshValue(filterOf(place)) : written;
  const title = isEmptyFilter(place) ? action : `${action} where ${filter}`;
  const characters = Array.from(title);
  return characters.length <= longestTitle ? title : `${characters.slice(0, longestTitle - 1).join('')}…`;
}

/** What follows a column action: the notification, and the table runs its query again. */
export function afterOf(place: FieldPlace, done: string): readonly After[] {
  return [
    { kind: 'notify', level: 'success', text: done },
    { kind: 'refresh', connection: connectionId(place.connection.id) },
  ];
}
