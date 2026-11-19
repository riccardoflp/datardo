/**
 * Feature: playground.sessions
 *
 * A script starts sessions and transactions as in mongosh, and what it leaves open is closed for it. The process of a
 * run asks for each session with {@link session}; the main process keeps the driver's sessions and, with the book of
 * `sessions/book.ts`, the writes of each transaction that wait for its commit, and the notes of what was closed at the
 * end. Ported from Mongoster's `src/playground/shell.ts` (`ShellSession`, `Shell.startSession`,
 * `Shell.closeSessions`, `transactionOptions`).
 */
import type { Json } from '../../shared/engine-request';
import { text } from './text';
import { jsonObject, type JsonObject } from './types';

export type { CloseReason, OpenSession, SessionBook } from './sessions/book';
export { aborted, closed, committed, emptyBook, ended, started, transactionStarted, written } from './sessions/book';

/** What `session` needs to know of the run: whether it was stopped, after which no session starts. */
export interface SessionRuntime {
  readonly cancelled: boolean;
}

/** A session to start, with the options the driver takes, or the error the script gets. */
export type SessionStart =
  { readonly kind: 'start'; readonly options: Json } | { readonly kind: 'refused'; readonly message: string };

function objectOf(value: Json | undefined): JsonObject {
  return jsonObject(value) ?? {};
}

/** A read preference as a mode (`"secondary"`), or as `{ mode, tags, maxStalenessSeconds }`, as one object. */
export function readPreferenceOf(value: Json | undefined): Json | undefined {
  if (typeof value === 'string') {
    return { mode: value };
  }
  const given = objectOf(value);
  if (typeof given['mode'] !== 'string') {
    return undefined;
  }
  return {
    mode: given['mode'],
    ...(given['tags'] === undefined ? {} : { tags: given['tags'] }),
    ...(given['maxStalenessSeconds'] === undefined ? {} : { maxStalenessSeconds: given['maxStalenessSeconds'] }),
  };
}

/** The options of a transaction as the driver takes them, from mongosh's (`startTransaction`, `withTransaction`). */
export function transactionOptions(value: Json | undefined): JsonObject {
  const { readPreference, ...rest } = objectOf(value);
  const preference = readPreferenceOf(readPreference);
  return { ...rest, ...(preference === undefined ? {} : { readPreference: preference }) };
}

/**
 * Feature: playground.sessions — `db.getMongo().startSession(options)`: the options the driver starts the session
 * with. Its `readConcern`, `writeConcern` and `readPreference`, and those of `defaultTransactionOptions`, are the
 * defaults of its transactions. After a stop the script can start no session: *The run was cancelled.*
 */
export function session(runtime: SessionRuntime, options: Json | undefined): SessionStart {
  if (runtime.cancelled) {
    return { kind: 'refused', message: text.sessions.cancelled };
  }
  const { readConcern, writeConcern, readPreference, defaultTransactionOptions, ...rest } = objectOf(options);
  const defaults = transactionOptions({
    ...objectOf(defaultTransactionOptions),
    ...(readConcern === undefined ? {} : { readConcern }),
    ...(writeConcern === undefined ? {} : { writeConcern }),
    ...(readPreference === undefined ? {} : { readPreference }),
  });
  return { kind: 'start', options: { ...rest, defaultTransactionOptions: defaults } };
}

/** The error of `session.getDatabase(name)` with a name that is not a string; nothing when it is one. */
export function databaseNameProblem(name: Json | undefined): string | undefined {
  return typeof name === 'string' && name !== '' ? undefined : text.sessions.databaseName;
}

/** The error of `withTransaction(fn)` with a first argument that is not a function. */
export const callbackProblem: string = text.sessions.callback;

/** What a session shows as a result: `{ id, inTransaction, hasEnded }`. */
export function sessionValue(id: Json, inTransaction: boolean, hasEnded: boolean): Json {
  return { id, inTransaction, hasEnded };
}

/** The server's message of a transaction refused by a standalone server, with the sentence about replica sets. */
export function withReplicaSetHint(message: string): string {
  const standalone = /only allowed on a replica set member or mongos|Transactions? (are|is) not supported/iu;
  return standalone.test(message) ? `${message}${text.sessions.replicaSet}` : message;
}
