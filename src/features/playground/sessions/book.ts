/**
 * The sessions of one run, as the main process keeps them (`playground.sessions`): which are open, which have a
 * transaction, and the writes of each transaction that wait for its commit before they are published for redis-oplog
 * (`oplog.playground-writes`). Each change gives a new book; the main process carries out on the driver what each
 * says. Ported from Mongoster's `ShellSession.pending`, `sink`, `publish` and `Shell.closeSessions`.
 */
import { text } from '../text';
import type { PlaygroundWrite } from '../writes';

/** A session of the run. */
export interface OpenSession {
  /** Its number in the run, which the calls made in it carry. */
  readonly id: number;
  readonly inTransaction: boolean;
  readonly ended: boolean;
  /** The writes of its transaction, waiting for the commit, in order. */
  readonly pending: readonly PlaygroundWrite[];
}

/** The sessions of a run. */
export interface SessionBook {
  readonly sessions: readonly OpenSession[];
  /** The run was stopped: no session starts, and the sessions were closed once. */
  readonly cancelled: boolean;
}

/** Why the sessions still open are closed: the script ended, failed, or was stopped. */
export type CloseReason = 'end' | 'error' | 'cancel';

/** The book of a run that has started no session. */
export const emptyBook: SessionBook = { sessions: [], cancelled: false };

function changed(book: SessionBook, id: number, change: (session: OpenSession) => OpenSession): SessionBook {
  return { ...book, sessions: book.sessions.map((each) => (each.id === id ? change(each) : each)) };
}

/** A session started: its number, and the book with it. */
export function started(book: SessionBook): { readonly book: SessionBook; readonly id: number } {
  const id = book.sessions.reduce((highest, each) => Math.max(highest, each.id), 0) + 1;
  return {
    book: { ...book, sessions: [...book.sessions, { id, inTransaction: false, ended: false, pending: [] }] },
    id,
  };
}

/** `startTransaction()`, or a new attempt of `withTransaction`: the writes of an attempt before are dropped. */
export function transactionStarted(book: SessionBook, id: number): SessionBook {
  return changed(book, id, (session) => ({ ...session, inTransaction: true, pending: [] }));
}

/**
 * A write to documents made: in a transaction it waits for the commit; otherwise it is published now. The write
 * carries the session it was made in, when it was.
 */
export function written(
  book: SessionBook,
  write: PlaygroundWrite,
): { readonly book: SessionBook; readonly publishNow?: PlaygroundWrite } {
  const session = book.sessions.find((each) => each.id === write.session);
  if (session?.inTransaction !== true) {
    return { book, publishNow: write };
  }
  return { book: changed(book, session.id, (each) => ({ ...each, pending: [...each.pending, write] })) };
}

/** `commitTransaction()` succeeded: the writes of the transaction to publish, in order. */
export function committed(
  book: SessionBook,
  id: number,
): { readonly book: SessionBook; readonly publish: readonly PlaygroundWrite[] } {
  const publish = book.sessions.find((each) => each.id === id)?.pending ?? [];
  return { book: changed(book, id, (session) => ({ ...session, inTransaction: false, pending: [] })), publish };
}

/** `abortTransaction()`, or a commit that failed: its writes are dropped, never published. */
export function aborted(book: SessionBook, id: number): SessionBook {
  return changed(book, id, (session) => ({ ...session, inTransaction: false, pending: [] }));
}

/** `endSession()`: a transaction still open is aborted first. */
export function ended(book: SessionBook, id: number): SessionBook {
  return changed(book, id, (session) => ({ ...session, inTransaction: false, ended: true, pending: [] }));
}

function why(reason: CloseReason): string {
  switch (reason) {
    case 'end':
      return text.sessions.atTheEnd;
    case 'error':
      return text.sessions.afterTheError;
    case 'cancel':
      return text.sessions.becauseCancelled;
  }
}

/** What closing the sessions still open does: the transactions to abort, the sessions to end, and the notes. */
export interface Closing {
  readonly book: SessionBook;
  /** The sessions whose transaction is aborted, never committed. */
  readonly abort: readonly number[];
  /** Every session still open, ended after the aborts. */
  readonly end: readonly number[];
  /** The notes the output ends with. */
  readonly notes: readonly string[];
}

/**
 * When the script ends, fails or is stopped: every session still open is ended, a transaction still open aborted, and
 * the output says so. After a stop, closing again does nothing.
 */
export function closed(book: SessionBook, reason: CloseReason): Closing {
  if (book.cancelled) {
    return { book, abort: [], end: [], notes: [] };
  }
  const open = book.sessions.filter((each) => !each.ended);
  const abort = open.filter((each) => each.inTransaction).map((each) => each.id);
  const sessions = open.length - abort.length;
  const notes = [
    ...(abort.length === 0 ? [] : [text.sessions.transactionsAborted(abort.length, why(reason))]),
    ...(sessions === 0 ? [] : [text.sessions.sessionsEnded(sessions)]),
  ];
  const after: SessionBook = {
    cancelled: reason === 'cancel',
    sessions: book.sessions.map((each) => ({ ...each, inTransaction: false, ended: true, pending: [] })),
  };
  return { book: after, abort, end: open.map((each) => each.id), notes };
}
