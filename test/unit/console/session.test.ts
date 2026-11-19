import { describe, expect, it } from 'vitest';
import { commandArguments } from '../../../src/features/console/parse-line';
import {
  openedSession,
  promptOf,
  reopenedSession,
  sessionAfter,
  sessionNotes,
} from '../../../src/features/console/session';
import type { ConsoleSession, Reply } from '../../../src/features/console/types';
import { simple } from './context';

const ok = simple('OK');
const queued = simple('QUEUED');
const error = (message: string): Reply => ({ kind: 'error', message });

function argumentsOf(line: string): readonly Uint8Array[] {
  const read = commandArguments(line);
  return read.kind === 'arguments' ? read.arguments : [];
}

/** The session after each command and its reply, from db0 with no transaction. */
function after(...steps: readonly (readonly [string, Reply])[]): ConsoleSession {
  return steps.reduce((session, [line, reply]) => sessionAfter(session, argumentsOf(line), reply), openedSession(0, 3));
}

describe('console.session', () => {
  it('gives each row of the table its session and its prompt', () => {
    const select3 = after(['SELECT 3', ok]);
    expect(select3.database).toBe(3);
    expect(promptOf(select3)).toBe('db3>');

    const select99 = after(['SELECT 99', error('ERR DB index is out of range')]);
    expect(promptOf(select99)).toBe('db0>');

    const two = after(['MULTI', ok], ['SET a 1', queued], ['INCR a', queued]);
    expect(two.transaction?.queued.length).toBe(2);
    expect(promptOf(two)).toBe('db0 (MULTI, 2 queued)>');

    const exec: Reply = { kind: 'array', items: [ok, { kind: 'integer', value: 2n }] };
    const executed = after(['MULTI', ok], ['SET a 1', queued], ['INCR a', queued], ['EXEC', exec]);
    expect(executed.transaction).toBeUndefined();
    expect(promptOf(executed)).toBe('db0>');

    const rejected = after(['MULTI', ok], ['SET a', error("ERR wrong number of arguments for 'set' command")]);
    expect(rejected.transaction?.rejected).toBe(true);
    expect(promptOf(rejected)).toBe('db0 (MULTI, rejected)>');

    const aborted = after(
      ['MULTI', ok],
      ['SET a', error("ERR wrong number of arguments for 'set' command")],
      ['EXEC', error('EXECABORT Transaction discarded because of previous errors.')],
    );
    expect(promptOf(aborted)).toBe('db0>');

    const selected = after(['MULTI', ok], ['SELECT 2', queued], ['EXEC', { kind: 'array', items: [ok] }]);
    expect(selected).toEqual({ database: 2, watching: false, protocol: 3 });
    expect(promptOf(selected)).toBe('db2>');

    expect(promptOf(after(['MULTI', ok], ['DISCARD', ok]))).toBe('db0>');

    const watched = after(['WATCH a', ok], ['MULTI', ok], ['SET a 1', queued], ['EXEC', { kind: 'null' }]);
    expect(watched).toEqual({ database: 0, watching: false, protocol: 3 });
  });

  it('says under (nil) that the transaction did not run because a watched key changed', () => {
    const before = after(['WATCH a', ok], ['MULTI', ok], ['SET a 1', queued]);
    expect(sessionNotes(before, argumentsOf('EXEC'), { kind: 'null' })).toEqual([
      'The transaction did not run: a watched key changed.',
    ]);
    expect(sessionNotes(before, argumentsOf('EXEC'), { kind: 'array', items: [ok] })).toEqual([]);
  });

  it('starts and ends the watching with WATCH and UNWATCH; SWAPDB does not change the database', () => {
    expect(after(['WATCH a', ok]).watching).toBe(true);
    expect(after(['WATCH a', ok], ['UNWATCH', ok]).watching).toBe(false);
    expect(after(['SWAPDB 0 1', ok]).database).toBe(0);
    expect(after(['select 4', ok]).database).toBe(4);
  });

  it('sets the database to the last queued SELECT whose own reply in EXEC is OK', () => {
    const exec: Reply = { kind: 'array', items: [ok, error('ERR DB index is out of range')] };
    expect(after(['MULTI', ok], ['SELECT 2', queued], ['SELECT 99', queued], ['EXEC', exec]).database).toBe(2);
  });

  it('after the connection closed with 2 commands queued, keeps the database and says the transaction was discarded', () => {
    const two = after(['SELECT 2', ok], ['MULTI', ok], ['SET a 1', queued], ['INCR a', queued]);
    const reopened = reopenedSession(two, 3);
    expect(reopened.session).toEqual({ database: 2, watching: false, protocol: 3 });
    expect(promptOf(reopened.session)).toBe('db2>');
    expect(reopened.notes).toEqual([
      'Connected again on db2.',
      "The transaction was discarded: the console's connection closed.",
    ]);
  });
});
