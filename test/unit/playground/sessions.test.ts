import { describe, expect, it } from 'vitest';
import {
  aborted,
  callbackProblem,
  closed,
  committed,
  databaseNameProblem,
  emptyBook,
  ended,
  session,
  sessionValue,
  started,
  transactionOptions,
  transactionStarted,
  withReplicaSetHint,
  written,
} from '../../../src/features/playground/sessions';
import type { PlaygroundWrite } from '../../../src/features/playground/writes';

function write(method: string, session?: number): PlaygroundWrite {
  return {
    database: 'shop',
    collection: method === 'insertOne' ? 'orders' : 'stock',
    method,
    arguments: [],
    ...(session === undefined ? {} : { session }),
  };
}

describe('playground.sessions', () => {
  it('starts a session with the defaults of its transactions', () => {
    expect(
      session(
        { cancelled: false },
        {
          causalConsistency: true,
          readConcern: { level: 'majority' },
          readPreference: 'primary',
          defaultTransactionOptions: { writeConcern: { w: 'majority' } },
        },
      ),
    ).toEqual({
      kind: 'start',
      options: {
        causalConsistency: true,
        defaultTransactionOptions: {
          writeConcern: { w: 'majority' },
          readConcern: { level: 'majority' },
          readPreference: { mode: 'primary' },
        },
      },
    });
  });

  it('takes a read preference as a mode or as { mode, tags, maxStalenessSeconds }', () => {
    expect(
      transactionOptions({ readPreference: { mode: 'secondary', tags: [{ dc: 'a' }], maxStalenessSeconds: 90 } }),
    ).toEqual({ readPreference: { mode: 'secondary', tags: [{ dc: 'a' }], maxStalenessSeconds: 90 } });
  });

  it('starts no session after a stop', () => {
    expect(session({ cancelled: true }, undefined)).toEqual({ kind: 'refused', message: 'The run was cancelled.' });
  });

  it('refuses a database name that is not a string, and a callback that is not a function', () => {
    expect(databaseNameProblem(3)).toBe('getDatabase(): the database name is a string');
    expect(databaseNameProblem('shop')).toBeUndefined();
    expect(callbackProblem).toBe('withTransaction(): the first argument is a function');
  });

  it('shows a session as { id, inTransaction, hasEnded }', () => {
    expect(sessionValue({ id: 'x' }, false, true)).toEqual({ id: { id: 'x' }, inTransaction: false, hasEnded: true });
  });

  it('publishes the writes of the worked example after the commit, the insert first, and notes the session', () => {
    const first = started(emptyBook);
    let book = transactionStarted(first.book, first.id);
    const insert = written(book, write('insertOne', first.id));
    expect(insert.publishNow).toBeUndefined();
    const update = written(insert.book, write('updateOne', first.id));
    expect(update.publishNow).toBeUndefined();
    const commit = committed(update.book, first.id);
    expect(commit.publish.map((each) => each.method)).toEqual(['insertOne', 'updateOne']);
    book = commit.book;
    expect(closed(book, 'end')).toMatchObject({
      abort: [],
      end: [1],
      notes: ['Note: a session left open was ended.'],
    });
  });

  it('publishes nothing of an aborted transaction, and starts a retry over', () => {
    const first = started(emptyBook);
    const book = written(transactionStarted(first.book, first.id), write('insertOne', first.id)).book;
    expect(committed(aborted(book, first.id), first.id).publish).toEqual([]);
    expect(committed(transactionStarted(book, first.id), first.id).publish).toEqual([]);
  });

  it('publishes a write out of a transaction now', () => {
    expect(written(emptyBook, write('insertOne')).publishNow).toEqual(write('insertOne'));
  });

  it('aborts a transaction left open at the end of the script, with its note', () => {
    const first = started(emptyBook);
    const closing = closed(transactionStarted(first.book, first.id), 'end');
    expect(closing.abort).toEqual([1]);
    expect(closing.notes).toEqual([
      'Note: The transaction still open was aborted at the end of the script: nothing of it was committed (session.commitTransaction() commits).',
    ]);
  });

  it('counts several transactions and sessions, after an error or a stop', () => {
    let book = emptyBook;
    for (let index = 0; index < 4; index += 1) {
      book = started(book).book;
    }
    book = transactionStarted(transactionStarted(book, 1), 2);
    expect(closed(book, 'error').notes).toEqual([
      'Note: The 2 transactions still open were aborted after the error: nothing of them was committed (session.commitTransaction() commits).',
      'Note: 2 sessions left open were ended.',
    ]);
    const stop = closed(book, 'cancel');
    expect(stop.notes[0]).toContain('because the run was cancelled');
    expect(closed(stop.book, 'end').notes).toEqual([]);
  });

  it('leaves a session ended by the script out of the notes', () => {
    const first = started(emptyBook);
    expect(closed(ended(first.book, first.id), 'end').notes).toEqual([]);
  });

  it('adds the sentence about replica sets to the error of a standalone server', () => {
    const message = 'Transaction numbers are only allowed on a replica set member or mongos';
    expect(withReplicaSetHint(message)).toBe(
      `${message} — transactions need a replica set or a sharded cluster (a single-node replica set is enough).`,
    );
    expect(withReplicaSetHint('E11000 duplicate key')).toBe('E11000 duplicate key');
  });
});
