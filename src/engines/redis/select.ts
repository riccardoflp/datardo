/**
 * Each Redis request names its database; one client serves them all. A command is sent in its database: when the
 * client is in another one, `SELECT` goes first, and requests wait behind a change of database so that no command runs
 * in a database it did not name. `KEYS` is never sent (R9.3).
 */
import type { RedisRequest } from '../../shared/engine-request';
import { EngineError } from '../engine';

/** The database the client is in. */
export interface Selected {
  database: number;
  /** The changes of database not yet done, and the requests waiting behind them. */
  waiting: Promise<unknown>;
  pending: number;
}

/** A fresh client is in database 0. */
export function selectedAtStart(): Selected {
  return { database: 0, waiting: Promise.resolve(), pending: 0 };
}

/** The commands whose effect does not depend on the database the client is in. */
const anyDatabase = new Set([
  'PING',
  'ECHO',
  'INFO',
  'HELLO',
  'CLIENT',
  'CONFIG',
  'COMMAND',
  'TIME',
  'LASTSAVE',
  'ACL',
  'SLOWLOG',
  'LATENCY',
  'ROLE',
  'MODULE',
  'PUBSUB',
  'PUBLISH',
  'SPUBLISH',
  'FUNCTION',
  'SCRIPT',
]);

const decoder = new TextDecoder();

/** The name of the command of a request, in capitals. */
export function commandName(request: RedisRequest): string {
  const first = request.command[0];
  return first === undefined ? '' : decoder.decode(first).toUpperCase();
}

/** Whether the command needs the client in the database of the request. */
export function needsDatabase(request: RedisRequest): boolean {
  return !anyDatabase.has(commandName(request));
}

/** What sends one command through the client. */
export type SendCommand = (command: readonly Uint8Array[]) => Promise<unknown>;

const encoder = new TextEncoder();

async function selectThenSend(selected: Selected, request: RedisRequest, send: SendCommand): Promise<unknown> {
  if (selected.database !== request.database) {
    await send([encoder.encode('SELECT'), encoder.encode(String(request.database))]);
    selected.database = request.database;
  }
  return send(request.command);
}

/** Sends a request in its database, and refuses `KEYS`. */
export function sendInDatabase(selected: Selected, request: RedisRequest, send: SendCommand): Promise<unknown> {
  const name = commandName(request);
  if (name === '') {
    return Promise.reject(new EngineError('A Redis command needs a name.'));
  }
  if (name === 'KEYS') {
    return Promise.reject(
      new EngineError('Datardo never sends KEYS: it would block the server. SCAN is used instead.'),
    );
  }
  if (!needsDatabase(request) || (selected.pending === 0 && selected.database === request.database)) {
    return send(request.command);
  }
  selected.pending += 1;
  const reply = selected.waiting.then(() => selectThenSend(selected, request, send));
  selected.waiting = reply
    .catch(() => undefined)
    .finally(() => {
      selected.pending -= 1;
    });
  return reply;
}
