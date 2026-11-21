/**
 * The values of strings and hashes against the test Redis (M14): each write runs through the runner as the key tab
 * starts it, with the arguments the window gives and its confirmation accepted, and the server is looked at
 * afterwards. A write recorded is undone from the Undo history (`undo.last`): the key back with its bytes and the time
 * it had left, its `DUMP` as it was. A read-only connection is refused before anything is sent; a key gone or of
 * another type is refused and recorded nowhere. The reads give what the view draws. The keys are `m14:*` in the
 * databases 4 and 5 of a shared server.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hexOf } from '../../../src/features/value/types';
import type { StringPart } from '../../../src/features/value/read-string';
import type { HashField, ScanPage } from '../../../src/features/value/read-hash';
import type { Json } from '../../../src/shared/engine-request';
import type { Target } from '../../../src/shared/target';
import { cacheId, liveKeys, readOnlyId, type LiveKeys } from '../key/live';

const database = 4;
const other = 5;
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const hex = (value: Uint8Array | string): Json => ({ hex: hexOf(typeof value === 'string' ? bytes(value) : value) });
const onKey = (name: string | Uint8Array, connection = cacheId): Target => ({
  kind: 'key',
  connection,
  database,
  key: typeof name === 'string' ? bytes(name) : name,
});
let live: LiveKeys;
let redis74 = false;

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
const left = async (name: string): Promise<number> => (await live.command(database, 'PTTL', name)) as number;
const dump = async (name: string): Promise<string> => hexOf((await live.command(database, 'DUMP', name)) as Uint8Array);
const recorded = (): number => live.state().undo.entries.length;

async function undoLast(): Promise<void> {
  expect(await live.start('undo.last', { kind: 'app' }, null)).toEqual({ kind: 'done' });
}

beforeAll(async () => {
  live = await liveKeys();
  const info = text(await live.command(database, 'INFO', 'server'));
  const [major = 0, minor = 0] = (/redis_version:(\d+)\.(\d+)/u.exec(info) ?? []).slice(1).map(Number);
  redis74 = major > 7 || (major === 7 && minor >= 4);
});

beforeEach(async () => {
  await unlinkMatching(database, 'm14:*');
  await unlinkMatching(other, 'm14:*');
  live.answers.length = 0;
  live.confirmed.length = 0;
});

afterAll(async () => {
  await unlinkMatching(database, 'm14:*');
  await unlinkMatching(other, 'm14:*');
  await live.close();
});

describe('value.save-string', () => {
  it('sends SET … KEEPTTL: the key still expires in an hour, and Undo puts the old value back with its time', async () => {
    await live.command(database, 'SET', 'm14:s', 'hello', 'PX', '3600000');
    const args = { loaded: hex('hello'), value: { text: 'hello world', format: 'text' } };
    expect(await live.start('value.save-string', onKey('m14:s'), args, 'toolbar')).toEqual({ kind: 'done' });
    expect(text(await live.command(database, 'GET', 'm14:s'))).toBe('hello world');
    expect(await left('m14:s')).toBeGreaterThan(3_500_000);
    await undoLast();
    expect(text(await live.command(database, 'GET', 'm14:s'))).toBe('hello');
    expect(await left('m14:s')).toBeGreaterThan(3_000_000);
  });

  it('asks to overwrite a value changed after it was loaded, and creates a key gone again without an expiry', async () => {
    await live.command(database, 'SET', 'm14:s', 'other');
    const args = { loaded: hex('hello'), value: { text: 'hello world', format: 'text' } };
    expect(await live.start('value.save-string', onKey('m14:s'), args, 'editor')).toEqual({ kind: 'done' });
    expect(live.confirmed).toEqual(['Edit m14:s']);
    expect(text(await live.command(database, 'GET', 'm14:s'))).toBe('hello world');
    expect(await live.start('value.save-string', onKey('m14:gone'), args, 'editor')).toEqual({ kind: 'done' });
    expect(text(await live.command(database, 'GET', 'm14:gone'))).toBe('hello world');
    expect(await left('m14:gone')).toBe(-1);
  });

  it('refuses a read-only connection and text that is not JSON, and writes nothing', async () => {
    await live.command(database, 'SET', 'm14:s', 'hello');
    const args = { loaded: hex('hello'), value: { text: 'hello world', format: 'text' } };
    expect(await live.start('value.save-string', onKey('m14:s', readOnlyId), args)).toMatchObject({
      kind: 'refused',
      code: 'value.save-string/read-only',
    });
    const json = { loaded: hex('hello'), value: { text: '{"a":', format: 'json' } };
    expect(await live.start('value.save-string', onKey('m14:s'), json)).toMatchObject({
      kind: 'refused',
      code: 'value.save-string/invalid',
    });
    expect(text(await live.command(database, 'GET', 'm14:s'))).toBe('hello');
  });
});

describe('value.check', () => {
  it('refuses a save to a key that became a list, and records nothing', async () => {
    await live.command(database, 'RPUSH', 'm14:s', 'a');
    const before = recorded();
    const args = { loaded: hex('hello'), value: { text: 'hello world', format: 'text' } };
    expect(await live.start('value.save-string', onKey('m14:s'), args)).toMatchObject({
      kind: 'refused',
      code: 'value.save-string/type-changed',
    });
    expect(recorded()).toBe(before);
    expect(await live.start('value.check', onKey('m14:none'), null)).toEqual({
      kind: 'read',
      result: { type: 'none' },
    });
  });
});

describe('value.typed-bytes', () => {
  it('edits a string that is not UTF-8 in Hex, and Undo gives back the same DUMP', async () => {
    const notText = Uint8Array.from([0xff, 0x00, 0xfe]);
    await live.command(database, 'SET', 'm14:bin', notText, 'PX', '3600000');
    const before = await dump('m14:bin');
    const args = { loaded: hex(notText), value: { text: 'ff 00 fe 0a', format: 'hex' } };
    expect(await live.start('value.save-string', onKey('m14:bin'), args)).toEqual({ kind: 'done' });
    expect(hexOf((await live.command(database, 'GET', 'm14:bin')) as Uint8Array)).toBe('ff00fe0a');
    await undoLast();
    expect(await dump('m14:bin')).toBe(before);
    expect(await left('m14:bin')).toBeGreaterThan(3_000_000);
  });

  it('edits a field of a hash that is not UTF-8 in Hex, and Undo gives back the same DUMP', async () => {
    const field = Uint8Array.from([0xc3, 0x28]);
    await live.command(database, 'HSET', 'm14:hbin', field, Uint8Array.from([0xff, 0xfe]), 'name', 'Ada');
    const before = await dump('m14:hbin');
    const args = {
      field: hex(field),
      loaded: hex(Uint8Array.from([0xff, 0xfe])),
      value: { text: '00 01', format: 'hex' },
    };
    expect(await live.start('value.edit-field', onKey('m14:hbin'), args, 'editor')).toEqual({ kind: 'done' });
    expect(hexOf((await live.command(database, 'HGET', 'm14:hbin', field)) as Uint8Array)).toBe('0001');
    await undoLast();
    expect(await dump('m14:hbin')).toBe(before);
  });
});

describe('value.add-field', () => {
  it('adds a field with HSET after the form, refuses one that exists, and Undo removes it', async () => {
    await live.command(database, 'HSET', 'm14:h', 'name', 'Ada');
    live.answers.push({ field: 'nickname', fieldFormat: 'text', value: 'Ada', valueFormat: 'text' });
    expect(await live.start('value.add-field', onKey('m14:h'), null, 'toolbar')).toEqual({ kind: 'done' });
    expect(text(await live.command(database, 'HGET', 'm14:h', 'nickname'))).toBe('Ada');
    live.answers.push({ field: 'name', fieldFormat: 'text', value: 'x', valueFormat: 'text' });
    expect(await live.start('value.add-field', onKey('m14:h'), null, 'toolbar')).toMatchObject({
      kind: 'refused',
      code: 'value.add-field/exists',
    });
    await undoLast();
    expect(await live.command(database, 'HEXISTS', 'm14:h', 'nickname')).toBe(0);
  });

  it('refuses a hash that another client replaced with a list', async () => {
    await live.command(database, 'RPUSH', 'm14:h', 'a');
    live.answers.push({ field: 'nickname', fieldFormat: 'text', value: 'Ada', valueFormat: 'text' });
    expect(await live.start('value.add-field', onKey('m14:h'), null)).toMatchObject({
      kind: 'refused',
      code: 'value.add-field/type-changed',
      message: 'm14:h is now a list: it was a hash when this tab read it. Refresh to see it.',
    });
  });
});

describe('value.edit-field', () => {
  it('changes a value with HSET and keeps the expiry of the field on Redis 7.4', async () => {
    await live.command(database, 'HSET', 'm14:h', 'visits', '12', 'name', 'Ada');
    if (redis74) {
      await live.command(database, 'HPEXPIRE', 'm14:h', '90000', 'FIELDS', '1', 'visits');
    }
    const args = { field: hex('visits'), loaded: hex('12'), value: { text: '13', format: 'text' } };
    expect(await live.start('value.edit-field', onKey('m14:h'), args, 'editor')).toEqual({ kind: 'done' });
    expect(text(await live.command(database, 'HGET', 'm14:h', 'visits'))).toBe('13');
    if (redis74) {
      const [ttl] = (await live.command(database, 'HPTTL', 'm14:h', 'FIELDS', '1', 'visits')) as number[];
      expect(ttl).toBeGreaterThan(80_000);
    }
    await undoLast();
    expect(text(await live.command(database, 'HGET', 'm14:h', 'visits'))).toBe('12');
  });
});

describe('value.rename-field', () => {
  it('sets the new name and removes the old one in one transaction, and Undo puts the old name back', async () => {
    await live.command(database, 'HSET', 'm14:h', 'nickname', 'Ada', 'name', 'A');
    const args = { field: hex('nickname'), name: { text: 'nick', format: 'text' } };
    expect(await live.start('value.rename-field', onKey('m14:h'), args, 'editor')).toEqual({ kind: 'done' });
    expect(await live.command(database, 'HEXISTS', 'm14:h', 'nickname')).toBe(0);
    expect(text(await live.command(database, 'HGET', 'm14:h', 'nick'))).toBe('Ada');
    const taken = { field: hex('nick'), name: { text: 'name', format: 'text' } };
    expect(await live.start('value.rename-field', onKey('m14:h'), taken, 'editor')).toMatchObject({ kind: 'refused' });
    await undoLast();
    expect(text(await live.command(database, 'HGET', 'm14:h', 'nickname'))).toBe('Ada');
    expect(await live.command(database, 'HEXISTS', 'm14:h', 'nick')).toBe(0);
  });
});

describe('value.remove-fields', () => {
  it('asks first, removes with HDEL, deletes the key with its last fields, and Undo brings them back', async () => {
    await live.command(database, 'HSET', 'm14:h', 'a', '1', 'b', '2', 'c', '3');
    await live.command(database, 'PEXPIRE', 'm14:h', '3600000');
    expect(await live.start('value.remove-fields', onKey('m14:h'), { fields: [hex('a')] }, 'row-menu')).toEqual({
      kind: 'done',
    });
    expect(live.confirmed).toEqual(['Remove field a from m14:h']);
    expect(await live.command(database, 'HLEN', 'm14:h')).toBe(2);
    const all = { fields: [hex('b'), hex('c')] };
    expect(await live.start('value.remove-fields', onKey('m14:h'), all, 'selection-bar')).toEqual({ kind: 'done' });
    expect(await live.command(database, 'EXISTS', 'm14:h')).toBe(0);
    await undoLast();
    expect(await live.command(database, 'HLEN', 'm14:h')).toBe(2);
    expect(await left('m14:h')).toBeGreaterThan(3_000_000);
  });

  it('is refused on a read-only connection', async () => {
    await live.command(database, 'HSET', 'm14:h', 'a', '1');
    const result = await live.start('value.remove-fields', onKey('m14:h', readOnlyId), { fields: [hex('a')] });
    expect(result).toMatchObject({ kind: 'refused', code: 'value.remove-fields/read-only' });
    expect(await live.command(database, 'HLEN', 'm14:h')).toBe(1);
  });
});

describe('value.count', () => {
  it('reads HLEN of a hash and STRLEN of a string', async () => {
    await live.command(database, 'HSET', 'm14:h', 'a', '1', 'b', '2');
    await live.command(database, 'SET', 'm14:s', 'hello');
    expect(await live.start('value.count', onKey('m14:h'), { type: 'hash' })).toEqual({
      kind: 'read',
      result: { count: 2 },
    });
    expect(await live.start('value.count', onKey('m14:s'), { type: 'string' })).toEqual({
      kind: 'read',
      result: { count: 5 },
    });
  });
});

describe('value.read-hash', () => {
  it('scans the fields from cursor 0, with a filter, and reads the expiry of each on Redis 7.4', async () => {
    await live.command(database, 'HSET', 'm14:h', 'name', 'Ada', 'nickname', 'A', 'visits', '12');
    const page = await live.start('value.read-hash', onKey('m14:h'), { form: 'full', cursor: '0', filter: '' });
    const all = page.kind === 'read' ? (page.result as ScanPage<HashField>) : undefined;
    expect(all?.items.length).toBe(3);
    const found = await live.start('value.read-hash', onKey('m14:h'), { form: 'full', cursor: '0', filter: 'nick' });
    expect(found.kind === 'read' ? (found.result as ScanPage<HashField>).items.length : -1).toBe(1);
    if (redis74) {
      await live.command(database, 'HPEXPIRE', 'm14:h', '90000', 'FIELDS', '1', 'visits');
      const expiries = await live.start('value.read-hash', onKey('m14:h'), { expiryOf: [hex('name'), hex('visits')] });
      const read = expiries.kind === 'read' ? (expiries.result as { expiries: (number | undefined)[] }) : undefined;
      expect(read?.expiries[0]).toBeUndefined();
      expect(read?.expiries[1]).toBeGreaterThan(80_000);
    }
  });
});

describe('value.read-string', () => {
  it('reads a string of 3 MB a part of 1 MB at a time, and the compact form 4,096 bytes', async () => {
    const size = 3 * 1_048_576;
    await live.command(database, 'SET', 'm14:blob', new Uint8Array(size).fill(0x61));
    const first = await live.start('value.read-string', onKey('m14:blob'), { form: 'full', length: size });
    const part = first.kind === 'read' ? (first.result as StringPart) : undefined;
    expect([part?.length, part?.bytes?.length, part?.changed]).toEqual([size, 1_048_576, false]);
    const next = await live.start('value.read-string', onKey('m14:blob'), {
      form: 'full',
      length: size,
      offset: 1_048_576,
    });
    expect(next.kind === 'read' ? (next.result as StringPart).offset : -1).toBe(1_048_576);
    const compact = await live.start('value.read-string', onKey('m14:blob'), { form: 'compact' });
    expect(compact.kind === 'read' ? (compact.result as StringPart).bytes?.length : -1).toBe(4096);
  });
});

describe('value.copy', () => {
  it('copies a string of 3 MB, reading the parts not loaded', async () => {
    const size = 3 * 1_048_576;
    await live.command(database, 'SET', 'm14:blob', new Uint8Array(size).fill(0x61));
    const args = { as: 'value', type: 'string', loaded: hex(new Uint8Array(1_048_576).fill(0x61)), length: size };
    expect(await live.start('value.copy', onKey('m14:blob'), args, 'toolbar')).toEqual({ kind: 'done' });
  });
});

describe('value.refresh', () => {
  it('asks for a refresh of the connection, without a step', async () => {
    const times = live.state().runner.refreshed.times;
    expect(await live.start('value.refresh', onKey('m14:h'), null, 'toolbar')).toEqual({ kind: 'done' });
    expect(live.state().runner.refreshed.times).toBe(times + 1);
  });
});
