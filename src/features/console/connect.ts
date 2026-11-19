/**
 * Feature: console.connect
 *
 * Opens the console's own connection to the server, which nothing else in Datardo uses, so that `SELECT`, `MULTI`,
 * `WATCH` and a command that takes long change nothing for the keys tabs, the tree island and the other pages. It goes
 * through the same TLS options and SSH tunnel as the connection, says `HELLO 3` with the connection's user and
 * password and the name `datardo-console`, and selects the console's database. A server without RESP3 gets `AUTH` and
 * `CLIENT SETNAME` instead, and the console reads replies in RESP2.
 */
import type { ConnectionView } from '../../shared/connection';
import { redisCommand } from '../../shared/engine-request';
import type { Answers, AppStep, Context, EngineStep, Outcome, Step } from '../../shared/feature';
import { noDanger, refuse, run } from '../../shared/feature';
import { connectionState, savedConnection } from '../../shared/state/connections';
import { maskedArgument } from './secret-arguments';
import { text } from './text';
import { consoleClient, consoleConnection, consoleOf } from './types';

/** The name the server sees for the console's connection (`CLIENT LIST` shows `name=datardo-console`). */
export const consoleClientName = 'datardo-console';

/** The user `HELLO` and `AUTH` name when the connection has a password and no user name. */
export const defaultUser = 'default';

/** The database of a saved Redis connection, from the path of its address: `redis://cache:6379/2` gives 2. */
export function savedDatabase(connection: ConnectionView): number {
  const match = /^rediss?:\/\/[^/]*\/(\d+)/u.exec(connection.address ?? '');
  return match?.[1] === undefined ? 0 : Number(match[1]);
}

/** The user of a saved Redis connection, from its address, without its password: `redis://app@cache` gives `app`. */
export function savedUser(connection: ConnectionView): string {
  const match = /^rediss?:\/\/([^@/]*)@/u.exec(connection.address ?? '');
  const user = match?.[1]?.split(':')[0] ?? '';
  try {
    return decodeURIComponent(user);
  } catch {
    // Not percent-encoded: the text is the user.
    return user;
  }
}

/** The user `AUTH` names, or none when the connection has no password. */
function authUser(connection: ConnectionView): string | undefined {
  if (!connection.secrets.password) {
    return undefined;
  }
  const user = savedUser(connection);
  return user === '' ? defaultUser : user;
}

function appStep(stepText: string, action: string, connection: ConnectionView, user?: string): AppStep {
  return {
    kind: 'app',
    text: stepText,
    action,
    args: { connection: connection.id, ...(user === undefined ? {} : { user }) },
  };
}

function consoleCommand(connection: ConnectionView, database: number, ...words: string[]): EngineStep {
  return {
    kind: 'engine',
    connection: consoleClient(connection.id),
    request: redisCommand(database, ...words),
    writes: false,
    text: words.join(' '),
  };
}

/** `HELLO 3 AUTH app *** SETNAME datardo-console`, and `AUTH` and `CLIENT SETNAME` for a server without RESP3. */
function helloStep(connection: ConnectionView): AppStep {
  const user = authUser(connection);
  const auth = user === undefined ? '' : ` AUTH ${user} ${maskedArgument}`;
  const instead: Step[] = [
    ...(user === undefined ? [] : [appStep(`AUTH ${user} ${maskedArgument}`, 'console.auth', connection, user)]),
    consoleCommand(connection, 0, 'CLIENT', 'SETNAME', consoleClientName),
  ];
  return {
    ...appStep(`HELLO 3${auth} SETNAME ${consoleClientName}`, 'console.hello', connection, user),
    onFailure: { kind: 'instead', steps: instead, codes: ['NOPROTO', 'ERR unknown command'] },
  };
}

/** The steps that open the console's connection on `database`. */
export function connectSteps(connection: ConnectionView, database: number): readonly Step[] {
  return [
    appStep(text.connect.open(connection.hosts), 'console.open', connection),
    helloStep(connection),
    ...(database === 0 ? [] : [consoleCommand(connection, database, 'SELECT', String(database))]),
  ];
}

/** Feature: console.connect — the steps that open the console's own connection, on a connection that is connected. */
export function plan(context: Context, _answers: Answers): Outcome {
  const id = consoleConnection(context);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  if (connection === undefined || connectionState(context.state.connections, connection.id) !== 'connected') {
    return refuse('console.connect/not-connected', text.run.notConnected(connection?.name ?? ''));
  }
  const database = consoleOf(context.state, connection.id)?.session.database ?? savedDatabase(connection);
  return run({
    title: text.connect.title(connection.name),
    steps: connectSteps(connection, database),
    danger: noDanger,
    undo: { cannot: text.connect.nothingWritten },
    publishes: false,
    after: [],
  });
}
