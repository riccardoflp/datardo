/**
 * The console against the test Redis (M16): its own connection, named `datardo-console`, commands sent as arrays of
 * arguments with their replies typed, the session, the refusals of a read-only connection, the confirmations, the
 * secrets written `***`, the history kept in its file, and **Stop**. The keys are `m16:*` in the databases 6 and 7 of a
 * shared server; nothing is sent that would reach the other databases or the other clients (a `FLUSHALL` is tried and
 * cancelled at its confirmation).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputEntry } from '../../../src/shared/state/consoles';
import { cacheId, databases, liveConsoles, readOnlyId, type LiveConsoles } from './live';

vi.mock('../../../src/main/connections', () => import('./fake-connections'));

const [database, other] = databases;
const decoder = new TextDecoder();
let live: LiveConsoles;

function last(connection = cacheId): OutputEntry {
  const entries = live.console(connection).entries;
  const found = entries[entries.length - 1];
  if (found === undefined) {
    throw new Error('The output is empty.');
  }
  return found;
}

function logText(): string {
  return live
    .state()
    .runner.log.map((line) => line.text)
    .join('\n');
}

async function clientList(): Promise<string> {
  return decoder.decode((await live.command(0, 'CLIENT', 'LIST')) as Uint8Array);
}

async function unlinkOurs(number: number): Promise<void> {
  let cursor = '0';
  do {
    const [next, keys] = (await live.command(number, 'SCAN', cursor, 'MATCH', 'm16:*', 'COUNT', '1000')) as [
      Uint8Array,
      Uint8Array[],
    ];
    if (keys.length > 0) {
      await live.command(number, 'UNLINK', ...keys);
    }
    cursor = decoder.decode(next);
  } while (cursor !== '0');
}

beforeAll(async () => {
  live = await liveConsoles();
}, 60_000);

beforeEach(async () => {
  live.accept = true;
  live.confirmed.length = 0;
  await unlinkOurs(database);
  await unlinkOurs(other);
  if (live.console(cacheId).session.database !== database) {
    await live.run(`SELECT ${String(database)}`);
  }
});

afterAll(async () => {
  await unlinkOurs(database);
  await unlinkOurs(other);
  await live.close();
});

describe('console.connect', () => {
  it('opens one connection named datardo-console, in RESP3 from Redis 7.0, on the saved database', async () => {
    const lines = (await clientList()).split('\n').filter((line) => line.includes('name=datardo-console'));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    if (Number(live.version.split('.')[0]) >= 7) {
      expect(lines.some((line) => line.includes('resp=3'))).toBe(true);
    }
    expect(live.console(cacheId).session).toMatchObject({ database, protocol: 3 });
    expect(live.console(readOnlyId).session.database).toBe(other);
    expect(logText()).toContain('[console.connect] HELLO 3 SETNAME datardo-console');
  });

  it('leaves the ordinary client of the connection on its own database after SELECT', async () => {
    await live.command(database, 'SET', 'm16:where', 'db6');
    expect((await live.run(`SELECT ${String(other)}`)).kind).toBe('done');
    expect(live.console(cacheId).session.database).toBe(other);
    const read = await live.engines.send(
      {
        connection: cacheId,
        request: {
          engine: 'redis',
          database,
          command: [new TextEncoder().encode('GET'), new TextEncoder().encode('m16:where')],
        },
      },
      AbortSignal.timeout(5000),
    );
    expect(decoder.decode(read as Uint8Array)).toBe('db6');
  });
});

describe('console.run', () => {
  it('sends SET with its three arguments, shows OK, and writes the command in the Log', async () => {
    expect(await live.run('SET m16:greeting "hello world"')).toEqual({ kind: 'done' });
    expect(last()).toMatchObject({ line: 'SET m16:greeting "hello world"', reply: { kind: 'simple', text: 'OK' } });
    expect(logText()).toContain('[console.run] SET m16:greeting "hello world"');
    expect(decoder.decode((await live.command(database, 'GET', 'm16:greeting')) as Uint8Array)).toBe('hello world');
    await live.run('get m16:greeting');
    expect(last().reply).toEqual({ kind: 'bulk', bytes: new TextEncoder().encode('hello world') });
  });

  it('refuses SET on the read-only connection and sends GET', async () => {
    expect(await live.run('SET m16:greeting hi', readOnlyId)).toMatchObject({
      kind: 'refused',
      code: 'console.run/read-only',
    });
    expect(last(readOnlyId).refusal?.message).toBe(
      'The connection Cache read-only is read-only. SET writes, so the console did not send it.',
    );
    expect(await live.command(other, 'EXISTS', 'm16:greeting')).toBe(0);
    expect((await live.run('GET m16:greeting', readOnlyId)).kind).toBe('done');
    for (const line of ['PUBLISH m16:channel hi', 'CONFIG SET maxmemory 1gb', 'EVAL "return 1" 0']) {
      expect(await live.run(line, readOnlyId), line).toMatchObject({ kind: 'refused', code: 'console.run/read-only' });
    }
  });

  it('shows the error of the server as the reply of a command it does not know', async () => {
    expect((await live.run('FOO')).kind).toBe('done');
    const reply = last().reply;
    expect(reply?.kind === 'error' ? reply.message : '').toMatch(/^ERR unknown command/u);
  });

  it('asks COMMAND INFO of a name once on a console connection', async () => {
    live.sent.length = 0;
    for (const value of ['1', '2', '3']) {
      await live.run(`SET m16:once ${value}`);
    }
    expect(live.sent.filter((words) => words === 'COMMAND INFO set')).toHaveLength(0);
    await live.run('HSET m16:hash f 1');
    await live.run('HSET m16:hash f 2');
    expect(live.sent.filter((words) => words === 'COMMAND INFO hset').length).toBeLessThanOrEqual(1);
  });

  it('confirms FLUSHDB with the name of the database, and FLUSHALL with the connection name, sending nothing when cancelled', async () => {
    await live.command(database, 'SET', 'm16:flush', '1');
    live.accept = false;
    expect((await live.run('FLUSHALL')).kind).toBe('cancelled');
    expect(live.confirmed[0]?.danger).toMatchObject({ kind: 'destructive', name: 'Cache' });
    expect(await live.command(database, 'EXISTS', 'm16:flush')).toBe(1);
    live.accept = true;
    expect((await live.run('FLUSHDB')).kind).toBe('done');
    expect(live.confirmed[1]).toMatchObject({ title: 'Run FLUSHDB on Cache?' });
    expect(live.confirmed[1]?.danger).toMatchObject({ kind: 'destructive', name: `db${String(database)}` });
    expect(await live.command(database, 'EXISTS', 'm16:flush')).toBe(0);
  });

  it('runs KEYS through the console, after its count', async () => {
    await live.command(database, 'SET', 'm16:k1', '1');
    expect((await live.run('KEYS m16:k*')).kind).toBe('done');
    expect(last().reply).toEqual({
      kind: 'array',
      items: [{ kind: 'bulk', bytes: new TextEncoder().encode('m16:k1') }],
    });
  });
});

describe('console.secret-arguments', () => {
  it('writes AUTH and CONFIG SET requirepass as *** in the output, the Log and the history', async () => {
    await live.run('AUTH app s3cret');
    expect(last().line).toBe('AUTH app ***');
    live.accept = false;
    await live.run('CONFIG SET requirepass s3cret');
    live.accept = true;
    expect(logText()).toContain('[console.run] AUTH app ***');
    expect(logText()).not.toContain('s3cret');
    expect(live.console(cacheId).history.join('\n')).not.toContain('s3cret');
    expect(JSON.stringify(live.confirmed)).not.toContain('s3cret');
  });
});

describe('console.history', () => {
  it('keeps the lines sent in the file of the connection, and never a secret', async () => {
    await live.run('GET m16:history');
    const history = live.console(cacheId).history;
    expect(history[history.length - 1]).toBe('GET m16:history');
    await vi.waitFor(async () => {
      const file = JSON.parse(await readFile(join(live.folder, 'state', `${cacheId}.json`), 'utf8')) as {
        consoleHistory?: string[];
      };
      expect(file.consoleHistory).toContain('GET m16:history');
      expect(JSON.stringify(file)).not.toContain('s3cret');
    }, 5000);
    expect(live.console(readOnlyId).history).not.toContain('GET m16:history');
  });
});

describe('console.session', () => {
  it('follows a transaction, and writes in the database it selected', async () => {
    await live.run('MULTI');
    await live.run('SET m16:tx 1');
    await live.run('INCR m16:tx');
    expect(live.console(cacheId).session.transaction?.queued).toHaveLength(2);
    await live.run('EXEC');
    expect(live.console(cacheId).session.transaction).toBeUndefined();
    expect(decoder.decode((await live.command(database, 'GET', 'm16:tx')) as Uint8Array)).toBe('2');
  });
});

describe('console.stop', () => {
  it('stops BLPOP at once, pops nothing, and opens the connection again on the same database', async () => {
    const waiting = live.run('BLPOP m16:queue 30');
    await live.until(cacheId, (console) => console.status === 'running');
    expect(await live.run('GET m16:queue')).toMatchObject({ kind: 'refused', code: 'console.run/busy' });
    expect((await live.start('console.stop', cacheId)).kind).toBe('done');
    expect((await waiting).kind).toBe('cancelled');
    const stopped = live.console(cacheId).entries.find((entry) => entry.line === 'BLPOP m16:queue 30');
    expect(stopped?.notes[0]).toMatch(/^Stopped after /u);
    await live.command(database, 'LPUSH', 'm16:queue', 'x');
    expect(await live.command(database, 'LLEN', 'm16:queue')).toBe(1);
    expect(live.console(cacheId).session.database).toBe(database);
    expect(last().notes).toContain(`Connected again on db${String(database)}.`);
    expect((await live.run('LLEN m16:queue')).kind).toBe('done');
    expect(last().reply).toEqual({ kind: 'integer', value: 1n });
  });
});

describe('console.connect', () => {
  it('opens the connection again for the next command after the server closed it', async () => {
    await live.run('CLIENT ID');
    const reply = last().reply;
    const id = reply?.kind === 'integer' ? String(reply.value) : '';
    await live.command(0, 'CLIENT', 'KILL', 'ID', id);
    await live.until(cacheId, (console) => console.status === 'closed');
    expect(last().notes).toEqual(["The console's connection closed."]);
    await live.command(database, 'SET', 'm16:greeting', 'back');
    expect((await live.run('GET m16:greeting')).kind).toBe('done');
    const entries = live.console(cacheId).entries;
    expect(entries[entries.length - 2]?.notes).toContain(`Connected again on db${String(database)}.`);
    expect(last().reply).toEqual({ kind: 'bulk', bytes: new TextEncoder().encode('back') });
  });

  it('closes the console connection with its connection, and keeps the output', async () => {
    const kept = live.console(cacheId).entries.length;
    live.dispatch({ slice: 'connections', type: 'state', connection: cacheId, state: 'not-connected' });
    expect(live.console(cacheId).status).toBe('closed');
    expect(live.console(cacheId).entries).toHaveLength(kept);
    expect(await live.run('GET m16:greeting')).toMatchObject({ kind: 'refused', code: 'console.run/not-connected' });
    live.dispatch({ slice: 'connections', type: 'state', connection: cacheId, state: 'connected' });
    await live.until(cacheId, (console) => console.status === 'ready');
  });
});

describe('console.show', () => {
  it('closes the console connection with its tab', async () => {
    const before = (await clientList()).split('\n').filter((line) => line.includes('name=datardo-console')).length;
    const tab = live
      .state()
      .tabs.tabs.find((each) => each.shows.kind === 'console' && each.shows.connection === readOnlyId);
    live.dispatch({ slice: 'tabs', type: 'closed', tab: tab?.id ?? ('' as never), at: Date.now() });
    expect(live.state().consoles[readOnlyId]).toBeUndefined();
    await vi.waitFor(async () => {
      const after = (await clientList()).split('\n').filter((line) => line.includes('name=datardo-console')).length;
      expect(after).toBe(before - 1);
    }, 5000);
  });
});
