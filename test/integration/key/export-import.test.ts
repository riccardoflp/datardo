/**
 * `key.export` and `key.import` against the test Redis (M13; QA3): a key of each type, whose name and values are not
 * valid UTF-8, is exported to a file, deleted, imported from that file, and is then equal by `DUMP`, with the same
 * expiry to the second. The keys are `m13:qa3:*` in database 13; the file is in a temporary folder.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Target } from '../../../src/shared/target';
import { cacheId, databases, liveKeys, type LiveKeys } from './live';

const [database] = databases;
const onDatabase: Target = { kind: 'redis-database', connection: cacheId, database };
const bytes = (...parts: (string | number)[]): Uint8Array =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? [...new TextEncoder().encode(part)] : [part])));
const hex = (value: unknown): string => Buffer.from(value as Uint8Array).toString('hex');
let live: LiveKeys;

/** One key of each type, its name ending with the byte 0xff and its values holding 0x00, 0xfe and 0xff. */
const keys = {
  string: bytes('m13:qa3:string:', 0xff),
  list: bytes('m13:qa3:list:', 0xff),
  set: bytes('m13:qa3:set:', 0xff),
  zset: bytes('m13:qa3:zset:', 0xff),
  hash: bytes('m13:qa3:hash:', 0xff),
  stream: bytes('m13:qa3:stream:', 0xff),
};
const raw = bytes('a', 0x00, 0xfe, 'b', 0xff);
const expiresAt = String(Date.now() + 3_600_000);

async function unlinkOwn(): Promise<void> {
  let cursor = '0';
  do {
    const [next, found] = (await live.command(database, 'SCAN', cursor, 'MATCH', 'm13:qa3:*', 'COUNT', '1000')) as [
      Uint8Array,
      Uint8Array[],
    ];
    if (found.length > 0) {
      await live.command(database, 'UNLINK', ...found);
    }
    cursor = new TextDecoder().decode(next);
  } while (cursor !== '0');
}

async function fill(): Promise<void> {
  await live.command(database, 'SET', keys.string, raw);
  await live.command(database, 'RPUSH', keys.list, raw, 'two', bytes(0x00));
  await live.command(database, 'SADD', keys.set, raw, 'two');
  await live.command(database, 'ZADD', keys.zset, '1.5', raw, '-inf', 'low', '+inf', 'high');
  await live.command(database, 'HSET', keys.hash, raw, raw, 'plain', '12');
  await live.command(database, 'XADD', keys.stream, '1700000000000-0', raw, raw);
  await live.command(database, 'XADD', keys.stream, '1700000000001-5', 'type', 'signup');
  for (const name of Object.values(keys)) {
    await live.command(database, 'PEXPIREAT', name, expiresAt);
  }
}

async function dumps(): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  for (const [type, name] of Object.entries(keys)) {
    found[type] = hex(await live.command(database, 'DUMP', name));
  }
  return found;
}

async function expiries(): Promise<number[]> {
  return Promise.all(
    Object.values(keys).map(async (name) => (await live.command(database, 'PEXPIRETIME', name)) as number),
  );
}

beforeAll(async () => {
  live = await liveKeys();
  await unlinkOwn();
  await fill();
});

afterAll(async () => {
  await unlinkOwn();
  await live.close();
});

describe('key.export', () => {
  it('writes every key of the pattern to the file chosen, with no .part left', async () => {
    live.file = join(live.folder, 'keys.redis');
    const args = { pattern: 'm13:qa3:*', type: 'all' };
    expect(await live.start('key.export', onDatabase, args, 'toolbar')).toEqual({ kind: 'done' });
    const lines = (await readFile(live.file, 'utf8')).split('\n').filter((line) => line !== '');
    expect(lines.length).toBeGreaterThanOrEqual(Object.keys(keys).length);
    await expect(readFile(`${live.file}.part`)).rejects.toThrow();
  });
});

describe('key.import', () => {
  it('brings back each key exported, equal by DUMP, with the same expiry to the second', async () => {
    const before = await dumps();
    const expired = await expiries();
    await unlinkOwn();
    expect(await live.command(database, 'EXISTS', ...Object.values(keys))).toBe(0);
    live.file = join(live.folder, 'keys.redis');
    live.answers.push({ existing: 'replace' });
    expect(await live.start('key.import', onDatabase, null, 'toolbar')).toEqual({ kind: 'done' });
    expect(await dumps()).toEqual(before);
    const after = await expiries();
    after.forEach((each, index) => {
      expect(Math.abs(each - (expired[index] ?? 0))).toBeLessThan(1000);
    });
  });

  it('replaces the keys that exist when asked to, and leaves them as they were when asked to skip them', async () => {
    await live.command(database, 'SET', keys.string, 'changed');
    live.answers.push({ existing: 'skip' });
    expect(await live.start('key.import', onDatabase, null, 'toolbar')).toEqual({ kind: 'done' });
    expect(new TextDecoder().decode((await live.command(database, 'GET', keys.string)) as Uint8Array)).toBe('changed');
    live.answers.push({ existing: 'replace' });
    expect(await live.start('key.import', onDatabase, null, 'toolbar')).toEqual({ kind: 'done' });
    expect(hex(await live.command(database, 'GET', keys.string))).toBe(hex(raw));
  });
});
