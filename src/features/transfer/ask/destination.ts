/**
 * The destination of a copy (`transfer.copy-collection`) and of generated documents (`transfer.generate`): a MongoDB
 * connection, the source's first; a database on it, the source's name first, or a new one; a collection, new or
 * existing, never a view. Each answer has its own key, so that the questions follow each other.
 */
import type { ConnectionView } from '../../../shared/connection';
import type { Answers, Context, Outcome } from '../../../shared/feature';
import { ask, needRead } from '../../../shared/feature';
import type { Choice, TextRule } from '../../../shared/question';
import { listDatabasesArgs } from '../../tree/list-databases';
import { isObject } from '../../tree/types';
import { destinationText as text } from '../text';
import { answerText, type Namespace } from '../types';

/** The value of **New database…** in the list of databases: a name a database cannot have. */
export const newDatabase = '$new';

/** The databases a destination never offers. */
const hiddenDatabases: readonly string[] = ['admin', 'local', 'config'];

/** How a feature asks for its destination: its titles, its texts, what it proposes, and its refusal. */
export interface DestinationAsk {
  /** The title of a question, from its step: `Copy shop.orders: destination connection`. */
  readonly title: (step: string) => string;
  /** The text of the question of the connection. */
  readonly where: string;
  /** The text of the question of the collection. */
  readonly collectionPrompt: (connection: string, database: string) => string;
  /** The name proposed in the source's database, `<collection>_copy`; elsewhere the source's name. */
  readonly sameDatabaseName: string;
  /** The message of a view's name, and whether the source's own name is refused (a copy into itself). */
  readonly viewName: string;
  readonly refuseSource?: string;
  /** The refusal of a read-only connection. */
  readonly readOnly: (connection: string) => Outcome;
}

/** Where documents go, once every question is answered. */
export interface Destination extends Namespace {
  readonly view: ConnectionView;
  /** Whether the collection exists: a copy then asks how to write into it. */
  readonly exists: boolean;
  readonly sameConnection: boolean;
}

/** The names of a database's contents read by `tree.list-collections`, and those that are views. */
function contentsOf(contents: unknown): { readonly names: string[]; readonly views: string[] } {
  const entries: unknown = isObject(contents) ? contents['entries'] : undefined;
  const list = Array.isArray(entries) ? (entries as unknown[]).filter(isObject) : [];
  const name = (entry: Readonly<Record<string, unknown>>): string =>
    typeof entry['name'] === 'string' ? entry['name'] : '';
  return { names: list.map(name), views: list.filter((entry) => entry['kind'] === 'view').map(name) };
}

function pickOne(title: string, key: string, choices: readonly Choice[], extra: { text?: string; default?: string }) {
  return ask({
    title,
    ...(extra.text === undefined ? {} : { text: extra.text }),
    button: text.next,
    fields: [
      {
        kind: 'pick-one',
        key,
        label: title,
        choices,
        ...(extra.default === undefined ? {} : { default: extra.default }),
      },
    ],
  });
}

/** The connection: the MongoDB connections, the source's first. */
function connectionOf(context: Context, source: Namespace, how: DestinationAsk, answers: Answers) {
  const all = context.state.connections.saved.filter((saved) => saved.engine === 'mongodb');
  const ordered = [
    ...all.filter((saved) => saved.id === source.connection),
    ...all.filter((s) => s.id !== source.connection),
  ];
  const chosen = ordered.find((saved) => saved.id === answers['destination-connection']);
  if (chosen !== undefined) {
    return chosen;
  }
  const choices = ordered.map((saved) => {
    const notes = [saved.id === source.connection ? text.sameConnection : '', saved.readOnly ? text.readOnly : ''];
    const description = notes.filter((note) => note !== '').join(', ');
    return { value: saved.id, label: saved.name, ...(description === '' ? {} : { description }) };
  });
  const title = how.title(text.connectionStep);
  return pickOne(title, 'destination-connection', choices, { text: how.where, default: source.connection });
}

/** What the questions of a destination are asked on. */
interface Asking {
  readonly context: Context;
  readonly source: Namespace;
  readonly how: DestinationAsk;
  readonly answers: Answers;
}

/** The database: the source's name first when it exists there, the others, and **New database…**. */
function databaseOf(asking: Asking, on: ConnectionView) {
  const { source, how, answers } = asking;
  const listed = answers['destination-databases'];
  if (!Array.isArray(listed)) {
    return needRead('destination-databases', 'tree.list-databases', listDatabasesArgs(asking.context.state, on.id));
  }
  const names = (listed as unknown[])
    .map((each) => (isObject(each) && typeof each['name'] === 'string' ? each['name'] : ''))
    .filter((name) => name !== '' && !hiddenDatabases.includes(name));
  const ordered = [...names.filter((name) => name === source.database), ...names.filter((n) => n !== source.database)];
  const picked = answers['database'];
  if (typeof picked !== 'string' || (picked !== newDatabase && !ordered.includes(picked))) {
    const choices = [
      ...ordered.map((name) => ({ value: name, label: name })),
      { value: newDatabase, label: text.newDatabase },
    ];
    return pickOne(how.title(text.databaseStep(on.name)), 'database', choices, {});
  }
  if (picked !== newDatabase) {
    return { database: picked, isNew: false };
  }
  const typed = answerText(answers['new-database']);
  if (typed === '' || names.includes(typed)) {
    const rules: TextRule[] = [
      { kind: 'not-empty', message: text.databaseNeeded },
      { kind: 'not-one-of', values: names, message: text.databaseExists },
    ];
    const title = how.title(text.newDatabaseStep);
    return ask({
      title,
      text: text.newDatabasePrompt(on.name),
      button: text.next,
      fields: [{ kind: 'text', key: 'new-database', label: title, rules }],
    });
  }
  return { database: typed, isNew: true };
}

/** The collection: a name that is not a view's, nor the source's when the source refuses it. */
function collectionOf(asking: Asking, on: ConnectionView, database: string, contents: unknown): Outcome | Destination {
  const { source, how, answers } = asking;
  const { names, views } = contentsOf(contents);
  const same = on.id === source.connection && database === source.database;
  const collection = answerText(answers['collection']);
  const own = same && how.refuseSource !== undefined ? [source.collection] : [];
  if (collection === '' || views.includes(collection) || own.includes(collection)) {
    const rules: TextRule[] = [
      { kind: 'not-empty', message: text.collectionNeeded },
      { kind: 'not-one-of', values: own, message: how.refuseSource ?? '' },
      { kind: 'not-one-of', values: views, message: how.viewName },
    ];
    const title = how.title(text.collectionStep);
    const proposed = same ? how.sameDatabaseName : source.collection;
    return ask({
      title,
      text: how.collectionPrompt(on.name, database),
      button: text.next,
      fields: [{ kind: 'text', key: 'collection', label: title, default: proposed, rules }],
    });
  }
  return {
    connection: on.id,
    database,
    collection,
    view: on,
    exists: names.includes(collection),
    sameConnection: on.id === source.connection,
  };
}

/** The connection, the database and the collection of a destination, asked one after the other. */
export function askDestination(
  context: Context,
  source: Namespace,
  how: DestinationAsk,
  answers: Answers,
): Outcome | Destination {
  const on = connectionOf(context, source, how, answers);
  if ('kind' in on) {
    return on;
  }
  if (on.readOnly) {
    return how.readOnly(on.name);
  }
  const asking = { context, source, how, answers };
  const database = databaseOf(asking, on);
  if ('kind' in database) {
    return database;
  }
  const contents = database.isNew ? { entries: [] } : answers['destination-collections'];
  if (contents === undefined) {
    const args = { connection: on.id, database: database.database };
    return needRead('destination-collections', 'tree.list-collections', args);
  }
  return collectionOf(asking, on, database.database, contents);
}
