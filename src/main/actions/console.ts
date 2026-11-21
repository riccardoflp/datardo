/**
 * The actions of the console area: the app steps of `console.connect` (`console.open`, `console.hello`, `console.auth`,
 * `console.setname`, `console.select`), of `console.stop` (`console.close`), of `console.clear` and of
 * `console.clear-history`. The password `HELLO` and `AUTH` send is read here from the secret storage and goes to the
 * console's client only: no step, no state and no line of the Log holds it.
 */
import type { AreaActions } from '.';
import type { Json } from '../../shared/engine-request';
import type { ConnectionId } from '../../shared/ids';
import { isConsoleAnswer, type ConsoleAnswer } from '../../shared/typed-reply';
import { redisConnectMs } from '../../features/connection/connect';
import { consoleClientName } from '../../features/console/connect';
import { text } from '../../features/console/text';
import { consoleClient, type Protocol } from '../../features/console/types';
import { EngineError, redisAddress } from '../../engines';
import type { AppAction } from '../../runner/ports';
import { change, closeClient, consoleNow, liveOf, need, saveHistory } from '../consoles';
import { clientSettings, connectionEngines, findConnection, fullConnectionString } from '../connections';

function fieldOf(args: Json, name: string): Json | undefined {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as { readonly [key: string]: Json })[name]
    : undefined;
}

function connectionOf(args: Json): ConnectionId {
  const value = fieldOf(args, 'connection');
  if (typeof value !== 'string') {
    throw new Error('The action needs connection.');
  }
  return value as ConnectionId;
}

const encoder = new TextEncoder();

/** Sends words on the console's client, past the watch of `console.run`: what `console.connect` says. */
async function sendWords(
  connection: ConnectionId,
  words: readonly string[],
  signal: AbortSignal,
): Promise<ConsoleAnswer> {
  const answer = await connectionEngines().send(
    {
      connection: consoleClient(connection),
      request: { engine: 'redis', database: 0, command: words.map((word) => encoder.encode(word)) },
    },
    signal,
  );
  if (!isConsoleAnswer(answer)) {
    throw new EngineError("The console's connection gave no reply.");
  }
  return answer;
}

/** The error of a reply, as a failure of the step; its code is the start of the message that says what it is. */
function failIfError(answer: ConsoleAnswer): void {
  if (answer.reply.kind !== 'error') {
    return;
  }
  const message = answer.reply.message;
  const code = message.startsWith('NOPROTO')
    ? 'NOPROTO'
    : message.startsWith('ERR unknown command')
      ? 'ERR unknown command'
      : undefined;
  throw new EngineError(message, code);
}

/** The password of the connection, from its connection string in the secret storage; empty when it has none. */
function passwordOf(connection: ConnectionId): string {
  const full = fullConnectionString(connection);
  return full === undefined ? '' : redisAddress(full).password;
}

function userOf(args: Json): string | undefined {
  const user = fieldOf(args, 'user');
  return typeof user === 'string' ? user : undefined;
}

/** `console.open` `{ connection }`: opens the console's client, through the connection's TLS options and tunnel. */
const openAction: AppAction = async (args, signal) => {
  const connection = connectionOf(args);
  const saved = findConnection(connection);
  const settings = saved === undefined ? undefined : clientSettings(saved, redisConnectMs);
  if (settings === undefined) {
    throw new EngineError(text.run.notConnected(saved?.name ?? connection));
  }
  const live = liveOf(connection);
  live.protocol = 3;
  live.closing = false;
  change(connection, { status: 'connecting' });
  await connectionEngines().openConsole(consoleClient(connection), settings, signal);
  return null;
};

/** `console.hello` `{ connection, user? }`: `HELLO 3`, with `AUTH` and the password when there is a user. */
const helloAction: AppAction = async (args, signal) => {
  const connection = connectionOf(args);
  const user = userOf(args);
  const auth = user === undefined ? [] : ['AUTH', user, passwordOf(connection)];
  failIfError(await sendWords(connection, ['HELLO', '3', ...auth, 'SETNAME', consoleClientName], signal));
  liveOf(connection).protocol = 3;
  return null;
};

/** `console.auth` `{ connection, user }`: `AUTH` on a server without RESP3. */
const authAction: AppAction = async (args, signal) => {
  const connection = connectionOf(args);
  failIfError(await sendWords(connection, ['AUTH', userOf(args) ?? 'default', passwordOf(connection)], signal));
  liveOf(connection).protocol = 2;
  return null;
};

/** `console.setname` and `console.select` `{ connection, words }`: the words, as the step's text writes them. */
const wordsAction =
  (protocol?: Protocol): AppAction =>
  async (args, signal) => {
    const connection = connectionOf(args);
    const words = fieldOf(args, 'words');
    const list = Array.isArray(words) ? words.filter((each): each is string => typeof each === 'string') : [];
    failIfError(await sendWords(connection, list, signal));
    if (protocol !== undefined) {
      liveOf(connection).protocol = protocol;
    }
    return null;
  };

/** `console.close` `{ connection }`: the first step of `console.stop`. */
const closeAction: AppAction = async (args) => {
  const connection = connectionOf(args);
  const live = liveOf(connection);
  live.stopping = consoleNow(connection)?.status === 'running';
  change(connection, { status: 'connecting' });
  await closeClient(connection);
  return null;
};

/** `console.clear` `{ connection }`. */
const clearAction: AppAction = (args) => {
  need().state.dispatch({ slice: 'consoles', type: 'cleared', connection: connectionOf(args) });
  return Promise.resolve(null);
};

/** `console.clear-history` `{ connection }`: in the open console and in the file. */
const clearHistoryAction: AppAction = async (args) => {
  const connection = connectionOf(args);
  if (consoleNow(connection) !== undefined) {
    change(connection, { history: [] });
  }
  await saveHistory(connection, []);
  return null;
};

/** The actions of the console area, by name. */
export const actions: AreaActions = () => ({
  'console.open': openAction,
  'console.hello': helloAction,
  'console.auth': authAction,
  'console.setname': wordsAction(2),
  'console.select': wordsAction(),
  'console.close': closeAction,
  'console.clear': clearAction,
  'console.clear-history': clearHistoryAction,
  // A command queued before an EXEC that is confirmed: shown in the confirmation, sent before.
  'console.queued': () => Promise.resolve(null),
});
