import { describe, expect, it } from 'vitest';
import { classification, type Classification, type ClassifiedConnection } from '../../../src/features/console/classify';
import { commandArguments } from '../../../src/features/console/parse-line';
import type { CommandFlags, ConsoleSession } from '../../../src/features/console/types';
import { session, words } from './context';

const local: ClassifiedConnection = {
  name: 'Cache local',
  readOnly: false,
  version: '7.2.4',
  keys: { database: 1204 },
};
const production: ClassifiedConnection = { name: 'Cache production', readOnly: true, version: '7.2.4' };
const notTold: CommandFlags = { kind: 'not-told' };
const unknown: CommandFlags = { kind: 'unknown' };

function argumentsOf(line: string): readonly Uint8Array[] {
  const read = commandArguments(line);
  return read.kind === 'arguments' ? read.arguments : [];
}

function classify(
  line: string,
  connection: ClassifiedConnection,
  flags: CommandFlags = notTold,
  on: ConsoleSession = session(),
): Classification {
  return classification(argumentsOf(line), flags, on, connection);
}

function codeOf(result: Classification): string {
  return result.kind === 'refuse' ? result.code : result.kind;
}

const inTransaction = (...queued: readonly string[]): ConsoleSession =>
  session({ transaction: { queued: queued.map(argumentsOf), rejected: false } });

describe('console.classify', () => {
  it('gives each row of the examples its result', () => {
    for (const connection of [local, production]) {
      expect(classify('GET greeting', connection)).toEqual({ kind: 'run', writes: false });
      expect(codeOf(classify('subscribe orders', connection))).toBe('console.run/subscribe');
      expect(classify('HELLO', connection).kind).toBe('run');
      expect(codeOf(classify('HELLO 2', connection))).toBe('console.run/connection-state');
      expect(codeOf(classify('XREAD BLOCK 0 STREAMS events $', connection))).toBe('console.run/blocks-forever');
      expect(classify('XREAD COUNT 10 STREAMS events 0', connection).kind).toBe('run');
      expect(classify('CONFIG GET maxmemory', connection).kind).toBe('run');
      const manyKeys = { ...connection, keys: { database: 10_001 } };
      expect(classify('KEYS *', manyKeys)).toMatchObject({ kind: 'confirm', danger: 'confirm' });
    }
    expect(classify('SET greeting hi', local)).toEqual({ kind: 'run', writes: true });
    expect(classify('SET greeting hi', production)).toEqual({
      kind: 'refuse',
      code: 'console.run/read-only',
      message: 'The connection Cache production is read-only. SET writes, so the console did not send it.',
      offersPubSub: false,
    });
    expect(classify('SORT queue', production)).toMatchObject({
      code: 'console.run/read-only',
      message:
        'The connection Cache production is read-only. SORT writes, so the console did not send it. Use SORT_RO to read.',
    });
    expect(codeOf(classify('PUBLISH orders hi', production))).toBe('console.run/read-only');
    expect(classify('SCRIPT LOAD "return 1"', production).kind).toBe('run');
    expect(classify('MYMODULE.DO x', production, unknown)).toMatchObject({
      code: 'console.run/unknown-command',
      message:
        'The connection Cache production is read-only, and Datardo cannot tell whether MYMODULE.DO writes. The console did not send it.',
    });
    expect(classify('MYMODULE.DO x', local, unknown).kind).toBe('run');
    expect(codeOf(classify('BLPOP queue 0', local))).toBe('console.run/blocks-forever');
    expect(codeOf(classify('BLPOP queue 0', production))).toBe('console.run/read-only');
    expect(classify('FLUSHDB ASYNC', local)).toMatchObject({ kind: 'confirm', danger: 'destructive', name: 'db0' });
    expect(classify('SHUTDOWN ABORT', local).kind).toBe('run');
    expect(classify('CONFIG SET maxmemory 1gb', local)).toMatchObject({ kind: 'confirm', danger: 'confirm' });
    expect(codeOf(classify('CONFIG SET maxmemory 1gb', production))).toBe('console.run/read-only');
    expect(classify('KEYS *', { ...local, keys: { database: 10_000 } }).kind).toBe('run');
    expect(classify('FLUSHALL', local, notTold, inTransaction()).kind).toBe('run');
    expect(classify('EXEC', local, notTold, inTransaction('FLUSHALL'))).toMatchObject({
      kind: 'confirm',
      danger: 'destructive',
    });
  });

  it('says what each refusal of rule 1 says, and offers Pub/Sub for SUBSCRIBE', () => {
    expect(classify('SUBSCRIBE orders', local)).toEqual({
      kind: 'refuse',
      code: 'console.run/subscribe',
      message:
        "SUBSCRIBE would turn the console's connection into a subscriber, which runs no other command. Follow channels in the Pub/Sub page.",
      offersPubSub: true,
    });
    expect(codeOf(classify('ssubscribe orders', local))).toBe('console.run/subscribe');
    expect(classify('MONITOR', local)).toMatchObject({
      code: 'console.run/monitor',
      message:
        'MONITOR sends every command the server runs, without end, and slows the server down. The console does not run it.',
    });
    expect(classify('PSYNC ? -1', local)).toMatchObject({
      code: 'console.run/replication-stream',
      message: 'PSYNC starts a replication stream, which the console cannot read.',
    });
    expect(classify('RESET', local)).toMatchObject({
      code: 'console.run/connection-state',
      message:
        "RESET changes how the console's connection reads replies, so the console does not send it. Close the tab and open the console again to start afresh.",
    });
    for (const line of ['CLIENT REPLY OFF', 'client reply skip', 'CLIENT TRACKING on']) {
      expect(codeOf(classify(line, local)), line).toBe('console.run/connection-state');
    }
    expect(classify('CLIENT REPLY ON', local).kind).toBe('run');
    expect(classify('HELLO 2', local, notTold, session({ protocol: 2 })).kind).toBe('run');
    expect(classify('UNSUBSCRIBE', local).kind).toBe('run');
    expect(classify('QUIT', local).kind).toBe('run');
  });

  it('gives each command of the table of rule 4 its danger, its text and its name to type', () => {
    const counted: ClassifiedConnection = {
      ...local,
      keys: { database: 1204, server: { keys: 1_204_311, databases: 3 } },
    };
    const rows: readonly (readonly [
      string,
      'confirm' | 'destructive',
      string,
      string | undefined,
      string | undefined,
    ])[] = [
      [
        'FLUSHALL',
        'destructive',
        'FLUSHALL deletes every key of every database of this server, for every client.',
        'Cache local',
        '1,204,311 keys in 3 databases',
      ],
      ['FLUSHDB', 'destructive', 'FLUSHDB deletes every key of db0, for every client.', 'db0', '1,204 keys'],
      [
        'SHUTDOWN',
        'destructive',
        'The server stops and every client is disconnected. Datardo cannot start it again.',
        'Cache local',
        undefined,
      ],
      [
        'SHUTDOWN NOSAVE',
        'destructive',
        'The server stops and every client is disconnected. Datardo cannot start it again. What changed since the last save is lost.',
        'Cache local',
        undefined,
      ],
      [
        'REPLICAOF 10.0.0.5 6379',
        'destructive',
        'The server deletes its own keys and copies those of 10.0.0.5:6379.',
        'Cache local',
        '1,204,311 keys in 3 databases',
      ],
      [
        'SLAVEOF 10.0.0.5 6379',
        'destructive',
        'The server deletes its own keys and copies those of 10.0.0.5:6379.',
        'Cache local',
        '1,204,311 keys in 3 databases',
      ],
      [
        'FUNCTION FLUSH',
        'destructive',
        'FUNCTION FLUSH deletes every library of functions of this server.',
        'Cache local',
        undefined,
      ],
      ['DEBUG SEGFAULT', 'destructive', 'This command stops or restarts the server.', 'Cache local', undefined],
      [
        'DEBUG crash-and-recover',
        'destructive',
        'This command stops or restarts the server.',
        'Cache local',
        undefined,
      ],
      [
        'DEBUG RELOAD',
        'confirm',
        'DEBUG commands are made for developing Redis: some block the server or change its data.',
        undefined,
        undefined,
      ],
      [
        'SWAPDB 0 1',
        'confirm',
        'Every client connected to db0 sees the keys of db1 at once, and the other way round.',
        undefined,
        undefined,
      ],
      ['REPLICAOF NO ONE', 'confirm', 'The server stops copying its master and accepts writes.', undefined, undefined],
      ['slaveof no one', 'confirm', 'The server stops copying its master and accepts writes.', undefined, undefined],
      [
        'FAILOVER',
        'confirm',
        'A replica takes the place of this master; its clients must follow.',
        undefined,
        undefined,
      ],
      [
        'CONFIG SET maxmemory 1gb',
        'confirm',
        'The change applies at once, for every client. It is lost when the server restarts, unless CONFIG REWRITE saves it.',
        undefined,
        undefined,
      ],
      [
        'CONFIG REWRITE',
        'confirm',
        'The server writes its current configuration over its configuration file.',
        undefined,
        undefined,
      ],
      [
        'CONFIG RESETSTAT',
        'confirm',
        'The counters of INFO, the latency data and the statistics of the commands start again from zero.',
        undefined,
        undefined,
      ],
      [
        'SCRIPT FLUSH',
        'confirm',
        'Every cached script is removed: clients that call EVALSHA get NOSCRIPT until they load their scripts again.',
        undefined,
        undefined,
      ],
      [
        'FUNCTION DELETE mylib',
        'confirm',
        'Libraries of functions are deleted or replaced, for every client.',
        undefined,
        undefined,
      ],
      [
        'FUNCTION RESTORE payload REPLACE',
        'confirm',
        'Libraries of functions are deleted or replaced, for every client.',
        undefined,
        undefined,
      ],
      [
        'ACL SETUSER app on',
        'confirm',
        'This changes who may connect and what they may run. The user of this connection can lock itself out.',
        undefined,
        undefined,
      ],
      [
        'ACL DELUSER app',
        'confirm',
        'This changes who may connect and what they may run. The user of this connection can lock itself out.',
        undefined,
        undefined,
      ],
      ['MODULE LOAD /m.so', 'confirm', 'This loads code into the server, or removes it.', undefined, undefined],
      ['CLIENT KILL ID 7', 'confirm', 'The connections of other clients are closed.', undefined, undefined],
      [
        'CLIENT PAUSE 1000',
        'confirm',
        'The server stops serving its clients for the time given.',
        undefined,
        undefined,
      ],
      [
        'MIGRATE h 6379 k 0 5000',
        'confirm',
        'The keys are deleted from this server once the other one has them.',
        undefined,
        undefined,
      ],
      [
        'SAVE',
        'confirm',
        'The server serves no client until the whole dataset is written to disk.',
        undefined,
        undefined,
      ],
    ];
    for (const [line, danger, said, name, touches] of rows) {
      const result = classify(line, counted);
      expect(result.kind, line).toBe('confirm');
      if (result.kind === 'confirm') {
        expect(result.danger, line).toBe(danger);
        expect(result.texts, line).toEqual([said]);
        expect(result.name, line).toBe(name);
        expect(result.touches, line).toBe(touches);
      }
    }
    expect(classify('FLUSHALL', counted)).toMatchObject({
      title: 'Run FLUSHALL on Cache local?',
      button: 'Run FLUSHALL',
    });
    expect(classify('config set maxmemory 1gb', local)).toMatchObject({ title: 'Run CONFIG SET on Cache local?' });
    expect(classify('KEYS *', { ...local, keys: { database: 1_204_311 } })).toMatchObject({
      texts: [
        'KEYS reads every key of db0 in one command, and the server serves no other client meanwhile. The keys tab lists the same keys a page at a time.',
      ],
      touches: '1,204,311 keys',
    });
    for (const line of ['MIGRATE h 6379 k 0 5000 COPY', 'FUNCTION RESTORE payload', 'DEBUG HELP', 'DEL a', 'KEYS *']) {
      expect(classify(line, { ...local, keys: {} }).kind, line).toBe('run');
    }
  });

  it('on a read-only connection sends no command of rule 2, whatever its case and the flags the server gives it', () => {
    const lines = [
      'eval "return 1" 0',
      'EVALSHA abc 0',
      'FCALL f 0',
      'publish orders hi',
      'SPUBLISH orders hi',
      'shutdown',
      'config set maxmemory 1gb',
      'CONFIG REWRITE',
      'CONFIG RESETSTAT',
      'debug reload',
      'SCRIPT FLUSH',
      'SCRIPT KILL',
      'FUNCTION KILL',
      'REPLICAOF NO ONE',
      'SLAVEOF h 1',
      'FAILOVER',
      'ACL SETUSER app',
      'ACL DELUSER app',
      'ACL LOAD',
      'ACL SAVE',
      'acl log reset',
      'MODULE LOAD x',
      'MODULE LOADEX x',
      'MODULE UNLOAD x',
      'CLIENT KILL ID 1',
      'CLIENT PAUSE 10',
      'CLIENT UNPAUSE',
      'CLIENT UNBLOCK 1',
      'SAVE',
      'BGSAVE',
      'BGREWRITEAOF',
      'SLOWLOG RESET',
      'LATENCY RESET',
      'MEMORY PURGE',
    ];
    const readOnlyFlags: CommandFlags = { kind: 'told', flags: ['readonly', 'fast'] };
    for (const line of lines) {
      expect(codeOf(classify(line, production, readOnlyFlags)), line).toBe('console.run/read-only');
    }
    expect(classify('EVAL "return 1" 0', production)).toMatchObject({
      message:
        'The connection Cache production is read-only. EVAL may write, so the console did not send it. Use EVAL_RO to read.',
    });
    expect(classify('PUBLISH orders hi', production)).toMatchObject({
      message:
        'The connection Cache production is read-only. PUBLISH sends a message to other clients, so the console did not send it.',
    });
    expect(classify('CONFIG SET maxmemory 1gb', production)).toMatchObject({
      message:
        'The connection Cache production is read-only. CONFIG SET changes the server, so the console did not send it.',
    });
    for (const line of [
      'EVAL_RO "return 1" 0',
      'MULTI',
      'EXEC',
      'DISCARD',
      'WATCH a',
      'UNWATCH',
      'SELECT 3',
      'AUTH x',
      'DEBUG HELP',
    ]) {
      expect(classify(line, production).kind, line).toBe('run');
    }
  });

  it('refuses a command not in the built-in list when the server does not tell, and uses the list when it is', () => {
    expect(codeOf(classify('MYMODULE.DO x', production, notTold))).toBe('console.run/unknown-command');
    expect(codeOf(classify('HSET h f v', production, notTold))).toBe('console.run/read-only');
    expect(classify('HGET h f', production, notTold).kind).toBe('run');
    expect(codeOf(classify('FUNCTION FLUSH', production, notTold))).toBe('console.run/read-only');
    expect(classify('FUNCTION LIST', production, notTold).kind).toBe('run');
  });

  it('queues BLPOP queue 0 typed after MULTI, and refuses a write before it is queued on a read-only connection', () => {
    expect(classify('BLPOP queue 0', local, notTold, inTransaction())).toEqual({ kind: 'run', writes: true });
    expect(codeOf(classify('SET a 1', production, notTold, inTransaction()))).toBe('console.run/read-only');
  });

  it('confirms the EXEC after MULTI, SET a 1, FLUSHDB once, with the steps of the whole transaction', () => {
    const result = classify('EXEC', local, notTold, inTransaction('SET a 1', 'FLUSHDB'));
    expect(result).toMatchObject({
      kind: 'confirm',
      danger: 'destructive',
      name: 'db0',
      title: 'Run EXEC on Cache local?',
      texts: ['FLUSHDB deletes every key of db0, for every client.'],
    });
    const steps = result.kind === 'confirm' ? (result.steps ?? []) : [];
    expect(steps).toEqual([words('MULTI'), words('SET', 'a', '1'), words('FLUSHDB'), words('EXEC')]);
    expect(classify('EXEC', local, notTold, inTransaction('SET a 1'))).toEqual({ kind: 'run', writes: false });
  });

  it('leaves SORT_RO out of the refusal of SORT queue on a Redis 6.2 server', () => {
    const old = { ...production, version: '6.2.14' };
    expect(classify('SORT queue', old)).toMatchObject({
      message: 'The connection Cache production is read-only. SORT writes, so the console did not send it.',
    });
    expect(classify('GEORADIUS g 0 0 1 km', old)).toMatchObject({
      message: expect.stringContaining('Use GEORADIUS_RO to read.') as unknown,
    });
  });

  it('refuses each command that would wait forever, with an example that has a timeout', () => {
    expect(classify('BLPOP queue 0', local)).toMatchObject({
      message:
        "BLPOP with the timeout 0 waits until another client pushes, however long, and holds the console's connection. Give it a timeout, for example BLPOP queue 5.",
    });
    for (const line of [
      'BRPOP a 0.0',
      'BZPOPMIN z 0',
      'BLMOVE a b LEFT RIGHT 0',
      'BLMPOP 0 1 a LEFT',
      'BZMPOP 0 1 z MIN',
      'XREADGROUP GROUP g c block 0 STREAMS s >',
      'WAIT 1 0',
      'WAITAOF 1 0 0',
    ]) {
      expect(codeOf(classify(line, local)), line).toBe('console.run/blocks-forever');
    }
    for (const line of ['BLPOP queue 5', 'BLMPOP 5 1 a LEFT', 'WAIT 1 100', 'XREAD STREAMS s 0']) {
      expect(classify(line, local).kind, line).toBe('run');
    }
  });
});
