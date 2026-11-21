/**
 * What the features of the manage area share: the connection, database and collection a feature was started on, what
 * the user typed in mongosh syntax, the lists to pick from when Go to started a feature without them, the steps sent
 * to MongoDB, and the editor's text of a definition.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json, MongoRequest } from '../../shared/engine-request';
import { ask, needRead, type Answers, type Context, type EngineStep, type Outcome } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { mongoshValue } from '../../shared/mongosh-value';
import { activeTabOf, type Tab } from '../../shared/state/tabs';
import type { Target } from '../../shared/target';
import { noMakers, type Makers } from '../aggregate/mongosh/helpers';
import { valueOf } from '../aggregate/mongosh/parse';
import { wrapperKey } from '../schema/types';
import { startArgs } from '../nav/types';
import { stepText } from '../runner/step-text';
import { text } from './text';

/** A document of JSON: an object that is not an array. */
export type JsonDocument = { readonly [key: string]: Json };

/** Whether a value is a document of JSON (not an array, not bytes). */
export function isDocument(value: unknown): value is JsonDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array);
}

/** Whether a value typed is an object: a document that is not a value of a BSON type (`{ $numberInt: "5" }`). */
export function isObjectValue(value: unknown): value is JsonDocument {
  return isDocument(value) && wrapperKey(value) === undefined;
}

/**
 * Text the user typed in mongosh syntax, as `query.parse` reads it in the caller: nothing typed, a value, or the parse
 * error.
 */
export type ParsedText =
  | { readonly kind: 'empty' }
  | { readonly kind: 'value'; readonly value: Json }
  | { readonly kind: 'invalid'; readonly message: string };

/**
 * An answer that should hold text the user typed, as {@link ParsedText}. A form, a dialog and the editors of the
 * Definition and Validation sections answer with the text itself, read here in mongosh syntax with the reader the
 * document area uses, so that `NumberLong(5)` or `ISODate("…")` keep their types; an answer already read is taken as
 * it is. `makers` gives `ObjectId()` and `ISODate()` without arguments the time of the context.
 */
export function parsedAnswer(answer: unknown, makers: Makers = noMakers): ParsedText {
  if (typeof answer === 'string') {
    return answer.trim() === '' ? { kind: 'empty' } : readMongosh(answer, makers);
  }
  if (
    isDocument(answer) &&
    (answer['kind'] === 'empty' || answer['kind'] === 'value' || answer['kind'] === 'invalid')
  ) {
    return answer as unknown as ParsedText;
  }
  return answer === undefined ? { kind: 'empty' } : { kind: 'value', value: answer as Json };
}

function readMongosh(typed: string, makers: Makers): ParsedText {
  const read = valueOf(typed, makers);
  return read.ok ? { kind: 'value', value: read.value } : { kind: 'invalid', message: read.message };
}

/** A text answer without the spaces around it; `undefined` while it was not answered. */
export function trimmedAnswer(answers: Answers, key: string): string | undefined {
  const answer = answers[key];
  return typeof answer === 'string' ? answer.trim() : undefined;
}

/** Where a feature of this area was started: a connection, and the database and collection when known. */
export interface ManagePlace {
  readonly connection: ConnectionView;
  readonly database?: string;
  readonly collection?: string;
  /** Whether the collection is known to be a view; `undefined` when nothing says. */
  readonly view?: boolean;
  /** The tab that shows the collection, when one is open. */
  readonly tab?: Tab;
  /** The arguments the feature was started with. */
  readonly args: Readonly<Record<string, unknown>>;
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function connectionIdOf(context: Context, args: Readonly<Record<string, unknown>>, tab: Tab | undefined): unknown {
  const target = context.target;
  const onTarget = target.kind === 'app' || target.kind === 'tab' ? undefined : target.connection;
  const shown = tab === undefined || tab.shows.kind === 'app' ? undefined : tab.shows.connection;
  return textOf(args['connection']) ?? onTarget ?? shown ?? context.state.nav.current;
}

function databaseOfTab(tab: Tab | undefined): string | undefined {
  const shows = tab?.shows;
  if (shows === undefined) {
    return undefined;
  }
  return shows.kind === 'collection' || shows.kind === 'document' || shows.kind === 'page' ? shows.database : undefined;
}

function collectionTab(
  context: Context,
  known: { readonly database: string | undefined; readonly collection: string },
  id: string,
): Tab | undefined {
  return context.state.tabs.tabs.find(
    (tab) =>
      tab.shows.kind === 'collection' &&
      tab.shows.connection === id &&
      tab.shows.database === known.database &&
      tab.shows.collection === known.collection,
  );
}

/**
 * Whether the collection is a view, when something says: its open tab, or the list of `tree.list-collections` read
 * under `collections` it was picked from.
 */
function viewOf(open: Tab | undefined, answers: Answers, collection: string | undefined): boolean | undefined {
  if (open?.shows.kind === 'collection') {
    return open.shows.view === true;
  }
  const kind = collection === undefined ? undefined : kindOfEntry(answers, 'collections', collection);
  return kind === undefined ? undefined : kind === 'view';
}

/**
 * The place a feature was started on: its arguments (`{ connection, database, collection, view? }`), what was picked
 * from a list since (`database`, `collection`), the target, then the active tab of the same connection (Go to), then
 * the current connection. `undefined` when no saved connection is known.
 */
export function placeOf(context: Context, answers: Answers): ManagePlace | undefined {
  const args = startArgs(answers);
  const active = activeTabOf(context.state.tabs);
  const id = connectionIdOf(context, args, active);
  const connection = context.state.connections.saved.find((each) => each.id === id);
  if (connection === undefined) {
    return undefined;
  }
  const target = context.target;
  const sameTab = active !== undefined && active.shows.kind !== 'app' && active.shows.connection === connection.id;
  const tab = sameTab ? active : undefined;
  const database =
    textOf(args['database']) ??
    textOf(answers['database']) ??
    (target.kind === 'database' || target.kind === 'collection' ? target.database : undefined) ??
    databaseOfTab(tab);
  const shown = tab?.shows.kind === 'collection' && tab.shows.database === database ? tab.shows : undefined;
  const collection =
    textOf(args['collection']) ??
    textOf(answers['collection']) ??
    (target.kind === 'collection' ? target.collection : undefined) ??
    shown?.collection;
  const open = collection === undefined ? undefined : collectionTab(context, { database, collection }, connection.id);
  const view = typeof args['view'] === 'boolean' ? args['view'] : viewOf(open, answers, collection);
  return {
    connection,
    ...(database === undefined ? {} : { database }),
    ...(collection === undefined ? {} : { collection }),
    ...(view === undefined ? {} : { view }),
    ...(open === undefined ? {} : { tab: open }),
    args,
  };
}

/** The names the reads give: a database of `tree.list-databases`, an entry of `tree.list-collections`. */
interface Named {
  readonly name: string;
  readonly kind?: string;
  readonly system?: boolean;
}

function namesOf(value: unknown): readonly Named[] {
  const list = isDocument(value) && Array.isArray(value['entries']) ? value['entries'] : value;
  return Array.isArray(list)
    ? list.filter((each): each is Named => isDocument(each) && typeof each['name'] === 'string')
    : [];
}

/** The names of the databases `tree.list-databases` read, under `key`. */
export function databaseNames(answers: Answers, key: string): readonly string[] {
  return namesOf(answers[key]).map((each) => each.name);
}

/** What `tree.list-collections` read under `key`: the entries that are not `system.*`, with their kinds. */
export function collectionEntries(answers: Answers, key: string): readonly Named[] {
  return namesOf(answers[key]).filter((each) => each.system !== true && !each.name.startsWith('system.'));
}

/** Whether `tree.list-collections` was read under `key`. */
export function wasListed(answers: Answers, key: string): boolean {
  const listed = answers[key];
  return isDocument(listed) && Array.isArray(listed['entries']);
}

/** The read of the names of the databases of a connection, under `databases`. */
export function databasesNeed(place: ManagePlace): Outcome {
  return needRead('databases', 'tree.list-databases', { connection: place.connection.id });
}

/** The read of the collections and views of the place's database, under `key`. */
export function collectionsNeed(place: ManagePlace, key = 'collections'): Outcome {
  return needRead(key, 'tree.list-collections', { connection: place.connection.id, database: place.database ?? '' });
}

/**
 * What Go to asks when it started a feature without a database: the databases are read, then picked from, under
 * `database`. `undefined` once the database is known.
 */
export function pickDatabase(place: ManagePlace, answers: Answers, title: string): Outcome | undefined {
  if (place.database !== undefined) {
    return undefined;
  }
  if (answers['databases'] === undefined) {
    return databasesNeed(place);
  }
  const names = databaseNames(answers, 'databases');
  return ask({
    title,
    button: text.pick.button,
    fields: [
      { kind: 'pick-one', key: 'database', label: text.pick.database, choices: names.map((name) => choice(name)) },
    ],
  });
}

function choice(name: string): { readonly value: string; readonly label: string } {
  return { value: name, label: name };
}

/**
 * What Go to asks when it started a feature without a collection: the database first ({@link pickDatabase}), then its
 * collections of the `kinds` given are read and picked from, under `collection`. `undefined` once it is known.
 */
export function pickCollection(
  place: ManagePlace,
  answers: Answers,
  title: string,
  kinds: readonly string[],
): Outcome | undefined {
  const database = pickDatabase(place, answers, title);
  if (database !== undefined || place.collection !== undefined) {
    return database;
  }
  if (answers['collections'] === undefined) {
    return collectionsNeed(place);
  }
  const entries = collectionEntries(answers, 'collections').filter((entry) =>
    kinds.includes(entry.kind ?? 'collection'),
  );
  return ask({
    title,
    button: text.pick.button,
    fields: [
      {
        kind: 'pick-one',
        key: 'collection',
        label: text.pick.collection,
        choices: entries.map((entry) => choice(entry.name)),
      },
    ],
  });
}

/** A place whose database and collection are known. */
export type KnownPlace = ManagePlace & { readonly database: string; readonly collection: string };

/** The place with its database and collection, once {@link pickCollection} has nothing more to ask. */
export function knownPlace(place: ManagePlace): KnownPlace {
  const { database, collection } = place;
  if (database === undefined || collection === undefined) {
    throw new Error('The database and the collection are picked first.');
  }
  return { ...place, database, collection };
}

/** The kind of a collection `tree.list-collections` read, by name; `undefined` when it is not listed. */
export function kindOfEntry(answers: Answers, key: string, name: string): string | undefined {
  const entry = collectionEntries(answers, key).find((each) => each.name === name);
  return entry === undefined ? undefined : (entry.kind ?? 'collection');
}

/** `shop.orders`. */
export function namespaceOf(database: string, collection: string): string {
  return `${database}.${collection}`;
}

/** A request to a database, or to a collection of it. */
export function mongoRequest(
  on: { readonly database: string; readonly collection?: string },
  method: string,
  args: readonly Json[],
): MongoRequest {
  return {
    engine: 'mongodb',
    database: on.database,
    ...(on.collection === undefined ? {} : { collection: on.collection }),
    method,
    arguments: args,
  };
}

/**
 * A step that changes the deployment, with its text as `runner.step-text` writes it against `target`: a database
 * target writes `db.…`, a connection target `db.getSiblingDB("shop").…`.
 */
export function writeStep(place: ManagePlace, request: MongoRequest, target: Target): EngineStep {
  const step = { kind: 'engine', connection: connectionId(place.connection.id), request, writes: true } as const;
  return { ...step, text: stepText(step, target) };
}

/** The target that writes a request to `database` as `db.…`. */
export function databaseTarget(place: ManagePlace, database: string): Target {
  return { kind: 'database', connection: place.connection.id, database };
}

/** The target that writes every database by its name: `db.getSiblingDB("shop").…`. */
export function connectionTarget(place: ManagePlace): Target {
  return { kind: 'connection', connection: place.connection.id };
}

/** The tabs that show a collection or view of `database`, and with `collection` that one only. */
export function collectionTabs(context: Context, place: ManagePlace, collection?: string): readonly Tab[] {
  return context.state.tabs.tabs.filter(
    (tab) =>
      tab.shows.kind === 'collection' &&
      tab.shows.connection === place.connection.id &&
      tab.shows.database === place.database &&
      (collection === undefined || tab.shows.collection === collection),
  );
}

/** The GridFS tabs of `database`. */
export function bucketTabs(context: Context, place: ManagePlace): readonly Tab[] {
  return context.state.tabs.tabs.filter(
    (tab) =>
      tab.shows.kind === 'page' &&
      tab.shows.page === 'gridfs' &&
      tab.shows.connection === place.connection.id &&
      tab.shows.database === place.database,
  );
}

function fieldText(value: Json): string {
  if (!Array.isArray(value) || value.length === 0) {
    return mongoshValue(value);
  }
  const items = (value as readonly Json[]).map((item) => `    ${mongoshValue(item)}`);
  return `[\n${items.join(',\n')}\n  ]`;
}

function keyText(key: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(key) ? key : JSON.stringify(key);
}

/**
 * The text of a definition in the editor, in mongosh syntax, two-space indented: one field of the document per line,
 * and one item per line for an array of the first level (the stages of a pipeline); deeper values on one line.
 */
export function editorText(value: JsonDocument): string {
  const fields = Object.entries(value).map(([key, item]) => `  ${keyText(key)}: ${fieldText(item)}`);
  return fields.length === 0 ? '{}' : `{\n${fields.join(',\n')}\n}`;
}

/** The first field of a document that is not one of `known`. */
export function unknownField(value: JsonDocument, known: readonly string[]): string | undefined {
  return Object.keys(value).find((key) => !known.includes(key));
}
