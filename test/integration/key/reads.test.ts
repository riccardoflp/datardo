/**
 * The reads of the keys tab against the test Redis (M13; QA7, R9.3): `key.scan` with a pattern and a type,
 * `key.details`, `key.inspect`, the database of each tab (`key.switch-database`), and a large database opened with
 * `SCAN` alone. The server's `INFO commandstats` shows that it never received `KEYS`. The keys are `m13:read:*` in
 * database 13, and `m13:many:*` for the large database, whose size `DATARDO_TEST_MANY_KEYS` sets (500,000 by default;
 * 5,000,000 for QA7 as written).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DetailsRead } from '../../../src/features/key/details';
import { detailsArgs } from '../../../src/features/key/details';
import type { InspectedKey } from '../../../src/features/key/inspect';
import type { ScanPage } from '../../../src/features/key/scan';
import { hexOf } from '../../../src/features/key/types';
import type { Target } from '../../../src/shared/target';
import { cacheId, databases, liveKeys, type LiveKeys } from './live';

const [database, other] = databases;
const onDatabase = (number: number = database): Target => ({
  kind: 'redis-database',
  connection: cacheId,
  database: number,
});
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const many = Number(process.env['DATARDO_TEST_MANY_KEYS'] ?? '500000');
let live: LiveKeys;

async function keysCalls(): Promise<number> {
  const info = new TextDecoder().decode((await live.command(database, 'INFO', 'commandstats')) as Uint8Array);
  return Number(/cmdstat_keys:calls=(\d+)/u.exec(info)?.[1] ?? '0');
}

async function unlinkMatching(number: number, pattern: string): Promise<void> {
  let cursor = '0';
  do {
    const [next, keys] = (await live.command(number, 'SCAN', cursor, 'MATCH', pattern, 'COUNT', '5000')) as [
      Uint8Array,
      Uint8Array[],
    ];
    if (keys.length > 0) {
      await live.command(number, 'UNLINK', ...keys);
    }
    cursor = new TextDecoder().decode(next);
  } while (cursor !== '0');
}

async function scan(pattern: string, type = 'all', number = database): Promise<ScanPage> {
  const args = { connection: cacheId, database: number, pattern, type, cursor: '0' };
  const result = await live.start('key.scan', onDatabase(number), args);
  if (result.kind !== 'read') {
    throw new Error(JSON.stringify(result));
  }
  return result.result as ScanPage;
}

async function scanAll(pattern: string, type = 'all'): Promise<string[]> {
  const names: string[] = [];
  let cursor = '0';
  do {
    const args = { connection: cacheId, database, pattern, type, cursor };
    const result = await live.start('key.scan', onDatabase(), args);
    const page = (result as { result: ScanPage }).result;
    names.push(...page.keys.map((key) => new TextDecoder().decode(key)));
    cursor = page.cursor;
  } while (cursor !== '0');
  return names.sort();
}

beforeAll(async () => {
  live = await liveKeys();
  await unlinkMatching(database, 'm13:read:*');
  await live.command(database, 'HSET', 'm13:read:user:7', 'name', 'Ada', 'visits', '12');
  await live.command(database, 'SET', 'm13:read:session:1', 'x', 'PX', '7500000');
  await live.command(database, 'RPUSH', 'm13:read:queue', 'a', 'b');
  await live.command(database, 'SET', Uint8Array.from([...bytes('m13:read:bin:'), 0xff]), 'raw');
  await live.command(other, 'SET', 'm13:read:other', 'in 14');
});

afterAll(async () => {
  await unlinkMatching(database, 'm13:read:*');
  await unlinkMatching(other, 'm13:read:*');
  await unlinkMatching(database, 'm13:many:*');
  await live.close();
});

describe('key.scan', () => {
  it('finds the keys of a pattern with SCAN, and those of a type with SCAN … TYPE, never KEYS', async () => {
    const before = await keysCalls();
    expect(await scanAll('m13:read:*')).toEqual([
      'm13:read:bin:�',
      'm13:read:queue',
      'm13:read:session:1',
      'm13:read:user:7',
    ]);
    expect(await scanAll('m13:read:*', 'hash')).toEqual(['m13:read:user:7']);
    expect(await keysCalls()).toBe(before);
  });

  it('keeps the bytes of a name that is not UTF-8', async () => {
    const found = await scanAllNames('m13:read:bin:*');
    expect(found.map(hexOf)).toEqual([hexOf(Uint8Array.from([...bytes('m13:read:bin:'), 0xff]))]);
  });
});

async function scanAllNames(pattern: string): Promise<Uint8Array[]> {
  const names: Uint8Array[] = [];
  let cursor = '0';
  do {
    const args = { connection: cacheId, database, pattern, type: 'all', cursor };
    const page = ((await live.start('key.scan', onDatabase(), args)) as { result: ScanPage }).result;
    names.push(...page.keys);
    cursor = page.cursor;
  } while (cursor !== '0');
  return names;
}

describe('key.details', () => {
  it('reads the expiry and the size of the rows, and marks a key that is gone', async () => {
    const names = ['m13:read:session:1', 'm13:read:user:7', 'm13:read:nothing'].map(bytes);
    const result = await live.start('key.details', onDatabase(), detailsArgs(cacheId, database, names));
    const read = (result as { result: DetailsRead }).result;
    const [session, user, gone] = read.keys;
    expect(session?.timeLeft).toBeGreaterThan(7_000_000);
    expect(user).toMatchObject({ gone: false, timeLeft: null });
    expect(user?.size).toBeGreaterThan(0);
    expect(gone?.gone).toBe(true);
  });
});

describe('key.inspect', () => {
  it('reads the type, the expiry, the size and the encoding of the key selected', async () => {
    const args = { connection: cacheId, database, key: hexOf(bytes('m13:read:user:7')) };
    const result = await live.start('key.inspect:read', onDatabase(), args);
    const key = (result as { result: InspectedKey }).result;
    expect(key).toMatchObject({ type: 'hash', timeLeft: null, encoding: 'listpack' });
  });
});

describe('key.switch-database', () => {
  it('sends the commands of each tab to its own database, whatever the other tab sent last', async () => {
    expect((await scan('m13:read:other', 'all', other)).keys.map(hexOf)).toEqual([hexOf(bytes('m13:read:other'))]);
    expect((await scan('m13:read:other', 'all', database)).keys).toEqual([]);
    expect((await scan('m13:read:other', 'all', other)).keys).toHaveLength(1);
  });
});

describe('key.show', () => {
  it(`opens a database of ${many.toLocaleString('en-US')} keys with SCAN alone, its first rows in under 1 second`, async () => {
    for (let start = 0; start < many; start += 10_000) {
      const words: string[] = [];
      for (let index = start; index < Math.min(many, start + 10_000); index += 1) {
        words.push(`m13:many:${String(index)}`, '1');
      }
      await live.command(database, 'MSET', ...words);
    }
    const before = await keysCalls();
    const started = performance.now();
    const page = await scan('*');
    const took = performance.now() - started;
    expect(page.keys.length).toBeGreaterThan(0);
    expect(page.total).toBeGreaterThanOrEqual(many);
    expect(took).toBeLessThan(1000);
    expect(await keysCalls()).toBe(before);
  }, 600_000);
});
