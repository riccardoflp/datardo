import { describe, expect, it } from 'vitest';
import { flagsKey, parseKeyCount, plan } from '../../../src/features/console/run';
import type { CommandFlags, ConsoleState } from '../../../src/features/console/types';
import type { Answers, EngineStep, Outcome, Plan } from '../../../src/shared/feature';
import type { AppState } from '../../../src/shared/state';
import { cacheLocal, cacheProduction, consoleContext, consoleOn, consoleState, session, words } from './context';

const decoder = new TextDecoder();
const notTold: CommandFlags = { kind: 'not-told' };

function runOn(
  line: string,
  state: AppState = consoleState([consoleOn(cacheLocal)]),
  connection = cacheLocal,
  extra: Answers = { flags: notTold },
): Outcome {
  return plan(consoleContext('console.run', state, connection), { args: { line }, ...extra });
}

function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

function sent(outcome: Outcome): readonly string[] {
  const step = planOf(outcome).steps[0] as EngineStep;
  return step.request.engine === 'redis' ? step.request.command.map((word) => decoder.decode(word)) : [];
}

describe('console.run', () => {
  it('sends SET greeting "hello world" as three arguments on the console\'s connection, and its step text', () => {
    const outcome = runOn('SET greeting "hello world"');
    expect(sent(outcome)).toEqual(['SET', 'greeting', 'hello world']);
    expect(planOf(outcome)).toMatchObject({
      title: 'SET',
      danger: { kind: 'none' },
      steps: [{ kind: 'engine', connection: 'c-cache#console', writes: true, text: 'SET greeting "hello world"' }],
    });
  });

  it('runs set greeting hi in lower case the same as SET greeting hi', () => {
    expect(planOf(runOn('set greeting hi')).steps[0]).toMatchObject({ writes: true, text: 'set greeting hi' });
    expect(planOf(runOn('SET greeting hi')).steps[0]).toMatchObject({ writes: true });
  });

  it('sends nothing of SET greeting hi on Cache production, and runs GET greeting there', () => {
    const state = consoleState([consoleOn(cacheProduction)]);
    expect(runOn('SET greeting hi', state, cacheProduction)).toEqual({
      kind: 'refuse',
      code: 'console.run/read-only',
      message: 'The connection Cache production is read-only. SET writes, so the console did not send it.',
    });
    expect(sent(runOn('GET greeting', state, cacheProduction))).toEqual(['GET', 'greeting']);
  });

  it('refuses EVAL on Cache production and sends EVAL_RO', () => {
    const state = consoleState([consoleOn(cacheProduction)]);
    expect(runOn('EVAL "return 1" 0', state, cacheProduction)).toMatchObject({ code: 'console.run/read-only' });
    expect(sent(runOn('EVAL_RO "return 1" 0', state, cacheProduction))).toEqual(['EVAL_RO', 'return 1', '0']);
  });

  it('confirms FLUSHDB on db0 of Cache local, with 1,204 keys, the step FLUSHDB and db0 to type', () => {
    const asked = runOn('FLUSHDB');
    expect(asked).toEqual({
      kind: 'read',
      need: { key: 'keys', read: 'console.key-count', args: { connection: 'c-cache', database: 0, count: 'database' } },
    });
    const outcome = runOn('FLUSHDB', undefined, cacheLocal, { flags: notTold, keys: parseKeyCount([1204]) });
    expect(planOf(outcome)).toMatchObject({
      title: 'Run FLUSHDB on Cache local?',
      touches: '1,204 keys',
      steps: [{ text: 'FLUSHDB' }],
      danger: {
        kind: 'destructive',
        name: 'db0',
        button: 'Run FLUSHDB',
        text: 'FLUSHDB deletes every key of db0, for every client.',
      },
      undo: { cannot: 'This cannot be undone: commands run in the console are not recorded in the undo history.' },
    });
  });

  it('leaves the count out of the confirmation when the read failed', () => {
    const outcome = runOn('FLUSHDB', undefined, cacheLocal, { flags: notTold, keys: parseKeyCount([]) });
    expect(planOf(outcome).touches).toBeUndefined();
  });

  it('counts the keys of every database of INFO keyspace for FLUSHALL', () => {
    const info = new TextEncoder().encode('# Keyspace\r\ndb0:keys=1204,expires=0\r\ndb2:keys=7,expires=1\r\n');
    expect(parseKeyCount([info])).toEqual({ server: { keys: 1211, databases: 2 } });
  });

  it('sends nothing of SUBSCRIBE orders, with the code that offers Open Pub/Sub', () => {
    expect(runOn('SUBSCRIBE orders')).toMatchObject({ kind: 'refuse', code: 'console.run/subscribe' });
  });

  it('refuses BLPOP queue 0 and sends BLPOP queue 5', () => {
    expect(runOn('BLPOP queue 0')).toMatchObject({ code: 'console.run/blocks-forever' });
    expect(sent(runOn('BLPOP queue 5'))).toEqual(['BLPOP', 'queue', '5']);
  });

  it('writes AUTH app s3cret as AUTH app *** in its step, and sends the password', () => {
    const outcome = runOn('AUTH app s3cret');
    expect(planOf(outcome).steps[0]?.text).toBe('AUTH app ***');
    expect(sent(outcome)).toEqual(['AUTH', 'app', 's3cret']);
  });

  it('refuses a second command while BLPOP queue 30 waits', () => {
    const state = consoleState([consoleOn(cacheLocal, { status: 'running', running: 'BLPOP' })]);
    expect(runOn('GET greeting', state)).toEqual({
      kind: 'refuse',
      code: 'console.run/busy',
      message: 'Wait for BLPOP to answer, or stop it.',
    });
  });

  it('records nothing in the undo history: DEL greeting cannot be undone', () => {
    const deleted = planOf(runOn('DEL greeting'));
    expect(deleted.undo).toEqual({
      cannot: 'This cannot be undone: commands run in the console are not recorded in the undo history.',
    });
    expect(deleted.danger).toEqual({ kind: 'none' });
  });

  it('reads the pages of the connection again after a command that writes', () => {
    expect(planOf(runOn('SET orders:99 x')).after).toContainEqual({ kind: 'refresh', connection: 'c-cache' });
    expect(planOf(runOn('GET orders:99')).after).not.toContainEqual({ kind: 'refresh', connection: 'c-cache' });
  });

  it('sends FOO on Cache local, which the server answers with an error', () => {
    expect(sent(runOn('FOO', undefined, cacheLocal, { flags: { kind: 'unknown' } }))).toEqual(['FOO']);
  });

  it('refuses a line that cannot be read, with the message of console.parse-line', () => {
    expect(runOn('SET b "2')).toEqual({
      kind: 'refuse',
      code: 'console.run/invalid-line',
      message: 'The quote opened at column 7 is never closed.',
    });
  });

  it('runs nothing of a run of 501 lines', () => {
    const outcome = plan(consoleContext('console.run', consoleState([consoleOn(cacheLocal)])), {
      args: { line: 'GET a', lines: 501 },
    });
    expect(outcome).toEqual({
      kind: 'refuse',
      code: 'console.run/too-many-lines',
      message: 'The console runs up to 500 lines at a time. To load many keys, use Import in the keys tab.',
    });
  });

  it('refuses a connection that is not connected', () => {
    const state = consoleState([consoleOn(cacheLocal)]);
    const disconnected = { ...state, connections: { ...state.connections, live: {} } } as AppState;
    expect(runOn('GET a', disconnected)).toEqual({
      kind: 'refuse',
      code: 'console.run/not-connected',
      message: 'Cache local is not connected.',
    });
  });

  it("reads COMMAND INFO set the first time SET runs on a console's connection, and keeps it for the next", () => {
    const first = plan(consoleContext('console.run', consoleState([consoleOn(cacheLocal)])), {
      args: { line: 'SET a 1' },
    });
    expect(first).toEqual({
      kind: 'read',
      need: {
        key: 'flags',
        read: 'console.command-flags',
        args: { connection: 'c-cache', name: 'SET' },
      },
    });
    const answered = planOf(runOn('SET a 1', undefined, cacheLocal, { flags: { kind: 'told', flags: ['write'] } }));
    const remembered = answered.after.find((after) => after.kind === 'remember');
    expect(remembered).toEqual({
      kind: 'remember',
      key: flagsKey,
      value: { 'c-cache': { opened: 1, flags: { set: ['write'] } } },
    });
    const kept = remembered?.kind === 'remember' ? remembered.value : null;
    for (const line of ['SET b 2', 'set c 3']) {
      const again = plan(
        consoleContext('console.run', consoleState([consoleOn(cacheLocal)], '7.2.4', { [flagsKey]: kept })),
        { args: { line } },
      );
      expect(again.kind, line).toBe('run');
    }
    expect(
      plan(consoleContext('console.run', consoleState([consoleOn(cacheLocal)])), { args: { line: 'FUNCTION FLUSH' } }),
    ).toMatchObject({ need: { args: { connection: 'c-cache', name: 'FUNCTION', subcommand: 'FLUSH' } } });
    const reopened: ConsoleState = consoleOn(cacheLocal, { opened: 2 });
    const stale = plan(consoleContext('console.run', consoleState([reopened], '7.2.4', { [flagsKey]: kept })), {
      args: { line: 'SET a 1' },
    });
    expect(stale.kind).toBe('read');
  });

  it('sends the command in the database of the console, and the EXEC after a FLUSHDB queued with the steps shown', () => {
    expect(
      planOf(runOn('GET a', consoleState([consoleOn(cacheLocal, { session: session({ database: 3 }) })]))).steps[0],
    ).toMatchObject({
      request: { database: 3 },
    });
    const queued = consoleOn(cacheLocal, {
      session: session({ transaction: { queued: [words('SET', 'a', '1'), words('FLUSHDB')], rejected: false } }),
    });
    const exec = planOf(runOn('EXEC', consoleState([queued]), cacheLocal, { flags: notTold, keys: { database: 3 } }));
    expect(exec.steps.map((step) => step.text)).toEqual(['MULTI', 'SET a 1', 'FLUSHDB', 'EXEC']);
    expect(exec.steps.map((step) => step.kind)).toEqual(['app', 'app', 'app', 'engine']);
    expect(exec.danger).toMatchObject({ kind: 'destructive', name: 'db0' });
  });
});
