/**
 * Feature: playground.target
 *
 * Chooses the connection a playground runs on and its default database, used until the script calls `use("…")`. The
 * questions are asked again by `playground.open`, `playground.open-file` and `playground.run` when the playground has
 * no connection they can use ({@link chosenTarget}). The connection of a playground never changes by itself. Ported
 * from Mongoster's `src/playground/playground.ts` (`Playgrounds.change`, `setTarget`, `label`).
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Answers, Context, Outcome, ReadFeature, ReadRequest } from '../../shared/feature';
import { ask, needRead, refuse } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Choice } from '../../shared/question';
import type { AppState } from '../../shared/state';
import { connectionState } from '../../shared/state/connections';
import { appPlan, appStep, mongoConnection, mongoConnections } from './plans/common';
import { text } from './text';
import { jsonObject, playgroundOf, startArgs, startedTab } from './types';

/** The identifier of the read of the databases of the connection picked, connecting it when it is not connected. */
export const databasesReadId = 'playground.target:databases';

/** The value of **Other database…** among the databases: no database has an empty name. */
const otherDatabase = '';

/** How long the list of databases may take, in ms (Datardo's choice, as the other lists of names). */
export const databasesTimeLimitMs = 10_000;

/** `db.adminCommand({ listDatabases: 1, nameOnly: true })`, which the main process sends once connected. */
export function databasesRequest(): MongoRequest {
  return {
    engine: 'mongodb',
    database: 'admin',
    method: 'runCommand',
    arguments: [{ listDatabases: 1, nameOnly: true }],
    timeLimitMs: databasesTimeLimitMs,
  };
}

/** What the read of the databases answers: the names, sorted, or why the connection could not be reached. */
export type DatabasesFound = { readonly databases: readonly string[] } | { readonly error: string };

/** The databases of a `listDatabases` reply, by name. */
export function databaseNames(reply: Json): readonly string[] {
  const list = jsonObject(reply)?.['databases'];
  const names = Array.isArray(list)
    ? (list as readonly Json[]).flatMap((each) => {
        const name = jsonObject(each)?.['name'];
        return typeof name === 'string' ? [name] : [];
      })
    : [];
  return [...names].sort((first, second) => (first < second ? -1 : first > second ? 1 : 0));
}

/** `playground.target:databases`: an app read, which connects the connection when it is not, then lists. */
export const databasesRead: ReadFeature = {
  kind: 'read',
  id: featureId(databasesReadId),
  request: (_context: Context, args: Json): ReadRequest => ({ kind: 'app', action: 'playground.list-databases', args }),
  parse: (replies): DatabasesFound => {
    const reply = jsonObject((replies[0] ?? null) as Json);
    const error = reply?.['error'];
    return typeof error === 'string' ? { error } : { databases: databaseNames(reply ?? null) };
  },
};

function connectionChoice(state: AppState, connection: ConnectionView, current: string | undefined): Choice {
  const notes = [
    ...(connection.id === current ? [text.target.current] : []),
    ...(connectionState(state.connections, connection.id) === 'connected' ? [text.target.connected] : []),
    ...(connection.readOnly ? [text.target.readOnly] : []),
  ];
  return {
    value: connection.id,
    label: connection.name,
    ...(notes.length === 0 ? {} : { description: notes.join(' · ') }),
  };
}

function connectionQuestion(state: AppState, current: string | undefined): Outcome {
  return ask({
    title: text.target.connection,
    text: text.target.connectionLine,
    button: text.target.choose,
    fields: [
      {
        kind: 'pick-one',
        key: 'connection',
        label: text.target.connection,
        choices: mongoConnections(state).map((each) => connectionChoice(state, each, current)),
        ...(current === undefined ? {} : { default: current }),
      },
    ],
  });
}

function databaseQuestion(connection: ConnectionView, databases: readonly string[]): Outcome {
  return ask({
    title: text.target.database(connection.name),
    text: text.target.databaseLine,
    button: text.target.choose,
    fields: [
      {
        kind: 'pick-one',
        key: 'database',
        label: text.target.database(connection.name),
        choices: [
          ...databases.map((name) => ({ value: name, label: name })),
          { value: otherDatabase, label: text.target.otherDatabase },
        ],
      },
    ],
  });
}

function nameQuestion(): Outcome {
  return ask({
    title: text.target.defaultDatabase,
    button: text.target.choose,
    fields: [
      {
        kind: 'text',
        key: 'name',
        label: text.target.databaseName,
        rules: [{ kind: 'not-empty', message: text.target.required }],
      },
    ],
  });
}

/** The connection and the database chosen, or what is asked, read or refused before they are. */
export type TargetChoice =
  | { readonly kind: 'chosen'; readonly connection: ConnectionView; readonly database: string }
  | { readonly kind: 'outcome'; readonly outcome: Outcome };

/**
 * The questions of the card, in order, with the code of the feature that asks them: the connection (the current one
 * picked first), the read of its databases, the database, and a name after **Other database…**.
 */
export function chosenTarget(
  state: AppState,
  answers: Answers,
  current: string | undefined,
  feature: 'playground.target' | 'playground.open' | 'playground.open-file' | 'playground.run',
): TargetChoice {
  if (mongoConnections(state).length === 0) {
    return { kind: 'outcome', outcome: refuseNoConnection(feature) };
  }
  const connection = mongoConnection(state, typeof answers['connection'] === 'string' ? answers['connection'] : '');
  if (connection === undefined) {
    return { kind: 'outcome', outcome: connectionQuestion(state, current) };
  }
  const found = answers['databases'] as DatabasesFound | undefined;
  if (found === undefined) {
    return { kind: 'outcome', outcome: needRead('databases', databasesReadId, { connection: connection.id }) };
  }
  if ('error' in found) {
    return { kind: 'outcome', outcome: refuseNotConnected(feature, connection.name, found.error) };
  }
  const picked = answers['database'];
  if (typeof picked !== 'string') {
    return { kind: 'outcome', outcome: databaseQuestion(connection, found.databases) };
  }
  const name = picked === otherDatabase ? answers['name'] : picked;
  return typeof name === 'string' && name.trim() !== ''
    ? { kind: 'chosen', connection, database: name.trim() }
    : { kind: 'outcome', outcome: nameQuestion() };
}

/** *Add a MongoDB connection first.*, with the code of the feature that refuses. */
export function refuseNoConnection(
  feature: 'playground.target' | 'playground.open' | 'playground.open-file' | 'playground.run',
): Outcome {
  switch (feature) {
    case 'playground.target':
      return refuse('playground.target/no-connection', text.open.noConnection);
    case 'playground.open':
      return refuse('playground.open/no-connection', text.open.noConnection);
    case 'playground.open-file':
      return refuse('playground.open-file/no-connection', text.open.noConnection);
    case 'playground.run':
      return refuse('playground.run/no-connection', text.open.noConnection);
  }
}

function refuseNotConnected(
  feature: 'playground.target' | 'playground.open' | 'playground.open-file' | 'playground.run',
  connection: string,
  error: string,
): Outcome {
  const message = text.target.notConnected(connection, error);
  switch (feature) {
    case 'playground.target':
      return refuse('playground.target/not-connected', message);
    case 'playground.open':
      return refuse('playground.open/not-connected', message);
    case 'playground.open-file':
      return refuse('playground.open-file/not-connected', message);
    case 'playground.run':
      return refuse('playground.run/not-connected', message);
  }
}

/**
 * Feature: playground.target — the connection and the default database of the active playground (or of `args.tab`):
 * `set the playground <title> to <connection> › <database>`. Nothing while a run of it is in progress.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const tab = startedTab(context, startArgs(answers));
  const playground = tab === undefined ? undefined : playgroundOf(context.state, tab.id);
  if (tab === undefined || playground?.run !== undefined) {
    return appPlan(text.target.title, [], text.target.cannotUndo);
  }
  const choice = chosenTarget(context.state, answers, tab.shows.connection, 'playground.target');
  if (choice.kind === 'outcome') {
    return choice.outcome;
  }
  const { connection, database } = choice;
  const step = appStep(text.target.step(tab.shows.title, connection.name, database), 'playground.set-target', {
    tab: tab.id,
    connection: connection.id,
    database,
  });
  return appPlan(text.target.title, [step], text.target.cannotUndo);
}
