/**
 * Feature: console.session
 *
 * Keeps track of what the console's connection is in: which database, whether a transaction is open with which
 * commands queued, whether `WATCH` is in force, and the protocol. The prompt and the status line show it, and
 * `console.classify` reads it.
 */
import { text } from './text';
import type { CommandArguments, ConsoleSession, Protocol, Reply } from './types';
import { argumentText, upperWords } from './types';

/** The session of a console just opened on `database`. */
export function openedSession(database: number, protocol: Protocol): ConsoleSession {
  return { database, watching: false, protocol };
}

function isOk(reply: Reply | undefined): boolean {
  return (
    (reply?.kind === 'simple' && reply.text === 'OK') || (reply?.kind === 'bulk' && argumentText(reply.bytes) === 'OK')
  );
}

function isQueued(reply: Reply): boolean {
  return reply.kind === 'simple' && reply.text === 'QUEUED';
}

function databaseOf(command: CommandArguments): number | undefined {
  const number = Number(argumentText(command[1]));
  return Number.isInteger(number) && number >= 0 ? number : undefined;
}

/** The commands the server runs at once inside a transaction instead of queueing them. */
const runInTransaction: ReadonlySet<string> = new Set(['EXEC', 'DISCARD', 'MULTI', 'WATCH']);

/** The database after `EXEC`: the `n` of the last queued `SELECT <n>` whose own reply is `OK`. */
function databaseAfterExec(session: ConsoleSession, reply: Reply): number {
  const queued = session.transaction?.queued ?? [];
  if (reply.kind !== 'array') {
    return session.database;
  }
  let database = session.database;
  queued.forEach((each, index) => {
    const selected = upperWords(each)[0] === 'SELECT' ? databaseOf(each) : undefined;
    if (selected !== undefined && isOk(reply.items[index])) {
      database = selected;
    }
  });
  return database;
}

function closed(session: ConsoleSession, database: number): ConsoleSession {
  return { database, watching: false, protocol: session.protocol };
}

function inTransaction(session: ConsoleSession, command: CommandArguments, reply: Reply): ConsoleSession {
  const transaction = session.transaction ?? { queued: [], rejected: false };
  const name = upperWords(command)[0] ?? '';
  if (name === 'EXEC') {
    return closed(session, databaseAfterExec(session, reply));
  }
  if (name === 'DISCARD') {
    return isOk(reply) ? closed(session, session.database) : session;
  }
  if (runInTransaction.has(name)) {
    return session;
  }
  if (isQueued(reply)) {
    return { ...session, transaction: { ...transaction, queued: [...transaction.queued, command] } };
  }
  return reply.kind === 'error' ? { ...session, transaction: { ...transaction, rejected: true } } : session;
}

/** Feature: console.session — the session after `command` was answered with `reply`. */
export function sessionAfter(session: ConsoleSession, command: CommandArguments, reply: Reply): ConsoleSession {
  if (session.transaction !== undefined) {
    return inTransaction(session, command, reply);
  }
  const name = upperWords(command)[0] ?? '';
  if (!isOk(reply)) {
    return session;
  }
  switch (name) {
    case 'SELECT': {
      const database = databaseOf(command);
      return database === undefined ? session : { ...session, database };
    }
    case 'MULTI':
      return { ...session, transaction: { queued: [], rejected: false } };
    case 'WATCH':
      return { ...session, watching: true };
    case 'UNWATCH':
      return { ...session, watching: false };
    default:
      return session;
  }
}

/** The notes the output adds under a reply: `EXEC` answered nil because a watched key changed. */
export function sessionNotes(session: ConsoleSession, command: CommandArguments, reply: Reply): readonly string[] {
  const name = upperWords(command)[0];
  return session.transaction !== undefined && name === 'EXEC' && reply.kind === 'null'
    ? [text.session.watchedKeyChanged]
    : [];
}

/** The prompt: `db0>`, `db0 (MULTI, 2 queued)>`, `db0 (MULTI, rejected)>`. */
export function promptOf(session: ConsoleSession): string {
  const transaction = session.transaction;
  if (transaction === undefined) {
    return text.session.prompt(session.database);
  }
  return transaction.rejected
    ? text.session.rejected(session.database)
    : text.session.queued(session.database, transaction.queued.length);
}

/**
 * The session once the console's connection is opened again: the same database (`console.connect` selects it), no
 * transaction and no watching; and the notes the output gets.
 */
export function reopenedSession(
  session: ConsoleSession,
  protocol: Protocol,
): { readonly session: ConsoleSession; readonly notes: readonly string[] } {
  return {
    session: openedSession(session.database, protocol),
    notes: [
      text.session.connectedAgain(session.database),
      ...(session.transaction === undefined ? [] : [text.session.transactionDiscarded]),
    ],
  };
}
