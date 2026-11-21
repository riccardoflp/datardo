/**
 * The writes of the keys area against the test Redis (M13): each runs through the runner as the window starts it,
 * with the answers its question gets and its confirmation accepted, and the server is looked at afterwards. A write
 * that is recorded is undone from the Undo history (`undo.last`), the key back with its value and the time it had
 * left. A read-only connection is refused before anything is sent. The keys are `m13:write:*` in the databases 12
 * and 13.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hexOf } from '../../../src/features/key/types';
import type { Target } from '../../../src/shared/target';
import { cacheId, databases, liveKeys, readOnlyId, type LiveKeys } from './live';

const [database, other] = databases;
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const onDatabase: Target = { kind: 'redis-database', connection: cacheId, database };
const onKey = (name: string, connection = cacheId): Target => ({
  kind: 'key',
  connection,
  database,
  key: bytes(name),
});
let live: LiveKeys;

async function unlinkMatching(number: number, pattern: string): Promise<void> {
  let cursor = '0';
  do {
    const [next, keys] = (await live.command(number, 'SCAN', cursor, 'MATCH', pattern, 'COUNT', '1000')) as [
      Uint8Array,
      Uint8Array[],
    ];
    if (keys.length > 0) {
      await live.command(number, 'UNLINK', ...keys);
    }
    cursor = new TextDecoder().decode(next);
  } while (cursor !== '0');
}

const text = (reply: unknown): string => new TextDecoder().decode(reply as Uint8Array);
const exists = async (name: string, number = database): Promise<number> =>
  (await live.command(number, 'EXISTS', name)) as number;
const left = async (name: string): Promise<number> => (await live.command(database, 'PTTL', name)) as number;

async function undoLast(): Promise<void> {
  expect(await live.start('undo.last', { kind: 'app' }, null)).toEqual({ kind: 'done' });
}

beforeAll(async () => {
  live = await liveKeys();
});

beforeEach(async () => {
  await unlinkMatching(database, 'm13:write:*');
  await unlinkMatching(other, 'm13:write:*');
  live.answers.length = 0;
  live.confirmed.length = 0;
});

afterAll(async () => {
  await unlinkMatching(database, 'm13:write:*');
  await unlinkMatching(other, 'm13:write:*');
  await live.close();
});

describe('key.rename', () => {
  it('renames with RENAMENX, keeps the expiry, and is undone back to the old name', async () => {
    await live.command(database, 'SET', 'm13:write:a', 'v', 'PX', '90000');
    live.answers.push({ name: 'm13:write:b' });
    expect(await live.start('key.rename', onKey('m13:write:a'), null, 'table')).toEqual({ kind: 'done' });
    expect([await exists('m13:write:a'), await exists('m13:write:b')]).toEqual([0, 1]);
    expect(await left('m13:write:b')).toBeGreaterThan(80_000);
    await undoLast();
    expect([await exists('m13:write:a'), await exists('m13:write:b')]).toEqual([1, 0]);
  });
});

describe('key.copy', () => {
  it('copies a key to another database, with its expiry, and leaves the key where it was', async () => {
    await live.command(database, 'HSET', 'm13:write:h', 'f', '1');
    await live.command(database, 'PEXPIRE', 'm13:write:h', '90000');
    live.answers.push({ to: 'm13:write:h', database: String(other) });
    expect(await live.start('key.copy', onKey('m13:write:h'), null, 'table')).toEqual({ kind: 'done' });
    expect(await exists('m13:write:h', other)).toBe(1);
    expect(text(await live.command(other, 'HGET', 'm13:write:h', 'f'))).toBe('1');
    expect((await live.command(other, 'PTTL', 'm13:write:h')) as number).toBeGreaterThan(80_000);
    expect(await exists('m13:write:h')).toBe(1);
  });
});

describe('key.set-expiry', () => {
  it('gives a key an expiry of one hour, undone back to persistent', async () => {
    await live.command(database, 'SET', 'm13:write:e', 'v');
    live.answers.push({ when: 'in', duration: '1h' });
    expect(await live.start('key.set-expiry', onKey('m13:write:e'), null, 'table')).toEqual({ kind: 'done' });
    expect(await left('m13:write:e')).toBeGreaterThan(3_590_000);
    await undoLast();
    expect(await left('m13:write:e')).toBe(-1);
  });
});

describe('key.persist', () => {
  it('removes the expiry of a key', async () => {
    await live.command(database, 'SET', 'm13:write:p', 'v', 'PX', '90000');
    expect(await live.start('key.persist', onKey('m13:write:p'), null, 'table')).toEqual({ kind: 'done' });
    expect(await left('m13:write:p')).toBe(-1);
  });
});

describe('key.delete', () => {
  it('deletes a key after its confirmation, and is undone with its value and the time it had left', async () => {
    await live.command(database, 'RPUSH', 'm13:write:l', 'a', 'b');
    await live.command(database, 'PEXPIRE', 'm13:write:l', '90000');
    expect(await live.start('key.delete', onKey('m13:write:l'), null, 'table')).toEqual({ kind: 'done' });
    expect(live.confirmed).toHaveLength(1);
    expect(await exists('m13:write:l')).toBe(0);
    await undoLast();
    expect(((await live.command(database, 'LRANGE', 'm13:write:l', '0', '-1')) as Uint8Array[]).map(text)).toEqual([
      'a',
      'b',
    ]);
    expect(await left('m13:write:l')).toBeGreaterThan(80_000);
  });
});

describe('key.delete-selected', () => {
  it('deletes the keys selected with one UNLINK, undone all together', async () => {
    const names = ['m13:write:s1', 'm13:write:s2', 'm13:write:s3'];
    for (const name of names) {
      await live.command(database, 'SET', name, name);
    }
    const args = { keys: names.map((name) => hexOf(bytes(name))) };
    expect(await live.start('key.delete-selected', onDatabase, args, 'selection-bar')).toEqual({ kind: 'done' });
    expect(await live.command(database, 'EXISTS', ...names)).toBe(0);
    await undoLast();
    expect(await live.command(database, 'EXISTS', ...names)).toBe(3);
  });
});

describe('key.delete-by-pattern', () => {
  async function fill(count: number): Promise<void> {
    const words = Array.from({ length: count }, (_, index) => [`m13:write:pat:${String(index)}`, 'v']).flat();
    await live.command(database, 'MSET', ...words, 'm13:write:kept', 'v');
  }

  it('counts the keys of the pattern with SCAN, deletes them, and is undone', async () => {
    await fill(1200);
    live.answers.push({ pattern: 'm13:write:pat:*', type: 'all' });
    expect(await live.start('key.delete-by-pattern', onDatabase, null, 'toolbar')).toEqual({ kind: 'done' });
    expect(live.confirmed).toEqual(['Delete keys matching m13:write:pat:*']);
    expect(await exists('m13:write:pat:0')).toBe(0);
    expect(await exists('m13:write:kept')).toBe(1);
    await undoLast();
    expect(await exists('m13:write:pat:1199')).toBe(1);
  });

  it('deletes more keys than the undo history keeps by scanning again, and records nothing', async () => {
    await fill(30);
    live.setSetting('datardo.undo.maxDocumentsPerOperation', 10);
    const before = live.state().undo.entries.length;
    live.answers.push({ pattern: 'm13:write:pat:*', type: 'all' });
    try {
      expect(await live.start('key.delete-by-pattern', onDatabase, null, 'toolbar')).toEqual({ kind: 'done' });
    } finally {
      live.setSetting('datardo.undo.maxDocumentsPerOperation', undefined);
    }
    expect(await exists('m13:write:pat:29')).toBe(0);
    expect(await exists('m13:write:kept')).toBe(1);
    expect(live.state().undo.entries).toHaveLength(before);
  });
});

describe('key.new', () => {
  it('creates a string with SET … NX, and refuses a name that exists', async () => {
    live.answers.push({ name: 'm13:write:n', type: 'string', value: 'hello', expiry: 'none' });
    expect(await live.start('key.new', onDatabase, null, 'toolbar')).toEqual({ kind: 'done' });
    expect(text(await live.command(database, 'GET', 'm13:write:n'))).toBe('hello');
    live.answers.push({ name: 'm13:write:n', type: 'string', value: 'again', expiry: 'none' });
    expect(await live.start('key.new', onDatabase, null, 'toolbar')).toMatchObject({ kind: 'refused' });
    expect(text(await live.command(database, 'GET', 'm13:write:n'))).toBe('hello');
  });
});

describe('connection.read-only', () => {
  it('refuses every write of the keys area on a read-only connection, before anything is sent', async () => {
    await live.command(database, 'SET', 'm13:write:r', 'v');
    const on = onKey('m13:write:r', readOnlyId);
    const onRead: Target = { kind: 'redis-database', connection: readOnlyId, database };
    expect(await live.start('key.rename', on)).toMatchObject({ kind: 'refused', code: 'key.rename/read-only' });
    expect(await live.start('key.delete', on)).toMatchObject({ kind: 'refused', code: 'key.delete/read-only' });
    expect(await live.start('key.import', onRead)).toMatchObject({ kind: 'refused', code: 'key.import/read-only' });
    expect(await exists('m13:write:r')).toBe(1);
  });
});
