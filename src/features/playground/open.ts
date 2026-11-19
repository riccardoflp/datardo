/**
 * Feature: playground.open
 *
 * Opens a new, unsaved playground on a connection and a database, with an example script or with a script another
 * feature wrote (the structure comparison opens its script so). Nothing of it is run. Ported from Mongoster's
 * `src/playground/playground.ts` (`Playgrounds.create`).
 */
import type { ConnectionView } from '../../shared/connection';
import type { Answers, Context, Outcome } from '../../shared/feature';
import type { AppState } from '../../shared/state';
import type { Target } from '../../shared/target';
import { connectionOfShows } from '../../shared/state/tabs';
import { newPlaygroundTitle } from '../tab/title';
import { appPlan, appStep, mongoConnection, mongoConnections } from './plans/common';
import { isDatabaseMethod } from './runtime';
import { chosenTarget, refuseNoConnection } from './target';
import { text } from './text';
import { startArgs, textArgument } from './types';

/** The default database of a playground started on a connection: `test`, as mongosh's. */
export const connectionDatabase = 'test';

/** What a playground is started on: a connection, a database of it, or a collection of that. */
export type OpenedOn =
  | { readonly kind: 'connection' }
  | { readonly kind: 'database'; readonly database: string }
  | { readonly kind: 'collection'; readonly database: string; readonly collection: string };

/** `db.orders`, or `db.getCollection("order-items")` for a name that is not an identifier or is a method of `db`. */
export function collectionReference(collection: string): string {
  const plain = /^[A-Za-z_$][\w$]*$/u.test(collection) && !isDatabaseMethod(collection, false);
  return plain ? `db.${collection}` : `db.getCollection(${JSON.stringify(collection)})`;
}

/** The example script of a new playground, as the card writes it. */
export function exampleScript(on: OpenedOn): string {
  const head = [text.open.firstComment, text.open.secondComment, ''];
  switch (on.kind) {
    case 'connection':
      return [...head, 'db.getMongo().getDBNames();'].join('\n');
    case 'database':
      return [...head, `use(${JSON.stringify(on.database)});`, '', 'db.getCollectionNames();'].join('\n');
    case 'collection':
      return [
        ...head,
        `use(${JSON.stringify(on.database)});`,
        '',
        `${collectionReference(on.collection)}.find({}).limit(20);`,
      ].join('\n');
  }
}

function openedOn(target: Target): OpenedOn {
  switch (target.kind) {
    case 'database':
      return { kind: 'database', database: target.database };
    case 'collection':
      return { kind: 'collection', database: target.database, collection: target.collection };
    case 'app':
    case 'tab':
    case 'connection':
    case 'redis-database':
    case 'key':
      return { kind: 'connection' };
  }
}

function databaseOf(on: OpenedOn): string {
  return on.kind === 'connection' ? connectionDatabase : on.database;
}

/** The connection a playground is started on: the target's, else the current one, when it is a MongoDB one. */
function startedConnection(context: Context): ConnectionView | undefined {
  const target = context.target;
  const fromTarget = target.kind === 'app' || target.kind === 'tab' ? undefined : target.connection;
  return mongoConnection(context.state, fromTarget ?? context.state.nav.current);
}

/** The title of a new playground: **Playground** and the lowest number free in the group of its connection. */
export function newTitle(state: AppState, connection: string): string {
  const siblings = state.tabs.tabs.filter((tab) => connectionOfShows(tab.shows) === connection).map((tab) => tab.shows);
  return newPlaygroundTitle(siblings);
}

/**
 * Feature: playground.open — `open the playground Playground <n>`, an app step that opens the tab with the example
 * (the caret at the end of its last line) or with the script `args.script` (the caret at its first line). From Go to
 * with no MongoDB connection current, the connection and the database are asked as `playground.target` asks them.
 */
export function plan(context: Context, answers: Answers): Outcome {
  if (mongoConnections(context.state).length === 0) {
    return refuseNoConnection('playground.open');
  }
  const started = startedConnection(context);
  const on = openedOn(started === undefined ? { kind: 'app' } : context.target);
  let connection = started;
  let database = databaseOf(on);
  if (connection === undefined) {
    const choice = chosenTarget(context.state, answers, undefined, 'playground.open');
    if (choice.kind === 'outcome') {
      return choice.outcome;
    }
    ({ connection, database } = choice);
  }
  const script = textArgument(startArgs(answers), 'script');
  const title = newTitle(context.state, connection.id);
  const step = appStep(text.open.step(title), 'playground.open', {
    connection: connection.id,
    database: textArgument(startArgs(answers), 'database') ?? database,
    title,
    text: script ?? exampleScript(on),
    caret: script === undefined ? 'end' : 'start',
  });
  return appPlan(text.open.title, [step], text.open.cannotUndo);
}
