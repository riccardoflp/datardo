import { describe, expect, it } from 'vitest';
import * as check from '../../../src/features/value/check';
import * as count from '../../../src/features/value/count';
import * as readHash from '../../../src/features/value/read-hash';
import * as readSet from '../../../src/features/value/read-set';
import * as readString from '../../../src/features/value/read-string';
import { keyContext, readCommands, utf8 } from './context';
import { recordedRead } from './replies';

const text = (value: Uint8Array): string => new TextDecoder().decode(value);

describe('value.check', () => {
  it('sends TYPE <key>, and gives the type the server answered', () => {
    const context = keyContext('value.check');
    expect(readCommands(check.request(context, null))).toEqual(['TYPE user:7']);
    expect(check.parse(recordedRead('type-hash').replies)).toEqual({ type: 'hash' });
    expect(check.parse(recordedRead('type-none').replies)).toEqual({ type: 'none' });
  });

  it('sends the commands a write compares, and gives their replies as they are', () => {
    const { args, replies } = recordedRead('check-hget');
    const context = keyContext('value.check');
    expect(readCommands(check.request(context, args))).toEqual(['HGET user:7 nickname', 'HEXISTS user:7 email']);
    const parsed = check.parse(replies, args);
    expect('replies' in parsed && parsed.replies[1]).toBe(0);
  });

  it('sends no command that writes', () => {
    const context = keyContext('value.check');
    expect(() => check.request(context, { commands: [['DEL', 'user:7']] })).toThrow();
  });
});

describe('value.count', () => {
  it('sends HLEN for a hash, and shows 2 fields', () => {
    const context = keyContext('value.count');
    expect(readCommands(count.request(context, { type: 'hash' }))).toEqual(['HLEN user:7']);
    expect(count.parse(recordedRead('count-hash').replies)).toEqual({ count: 3 });
    expect(count.countText('hash', 2)).toBe('2 fields');
  });

  it('counts each type with its command and its word', () => {
    const context = keyContext('value.count', { key: 'queue:mail' });
    expect(readCommands(count.request(context, { type: 'list' }))).toEqual(['LLEN queue:mail']);
    expect(readCommands(count.request(context, { type: 'string' }))).toEqual(['STRLEN queue:mail']);
    expect(readCommands(count.request(context, { type: 'zset' }))).toEqual(['ZCARD queue:mail']);
    expect(readCommands(count.request(context, { type: 'stream' }))).toEqual(['XLEN queue:mail']);
    expect(count.countText('list', 1)).toBe('1 element');
    expect(count.countText('string', 1204)).toBe('1,204 bytes');
    expect(count.countText('hash', 3)).toBe('3 fields');
  });

  it('writes the note of a filter and of the compact form', () => {
    expect(count.foundText('hash', 38, 1204)).toBe('38 fields found of 1,204');
    expect(count.firstItemsText('hash', 20, 1204)).toBe('First 20 of 1,204 fields.');
  });
});

describe('value.read-string', () => {
  const context = keyContext('value.read-string', { key: 'orders:blob' });

  it('reads a string of 1,204 bytes with STRLEN and GET, and it can be edited', () => {
    expect(readCommands(readString.request(context, {}))).toEqual(['STRLEN orders:blob']);
    expect(readCommands(readString.request(context, { length: 1204 }))).toEqual([
      'STRLEN orders:blob',
      'GET orders:blob',
    ]);
    expect(readString.isEditable({ length: 1204, loaded: new Uint8Array(1204) })).toBe(true);
  });

  it('parses the recorded replies of a whole string and of bytes that are not text', () => {
    const whole = recordedRead('string-whole');
    const part = readString.parse(whole.replies, whole.args);
    expect(part.length).toBe(5);
    expect(text(part.bytes ?? new Uint8Array())).toBe('hello');
    expect(part.changed).toBe(false);
    const raw = recordedRead('string-not-text');
    expect(Array.from(readString.parse(raw.replies, raw.args).bytes ?? [])).toEqual([0x00, 0xff, 0x41]);
  });

  it('reads the first MB of a string of 3 MB, read-only, with its note', () => {
    const length = 3 * 1_048_576;
    expect(readCommands(readString.request(context, { length }))).toEqual([
      'STRLEN orders:blob',
      'GETRANGE orders:blob 0 1048575',
    ]);
    const load = { length, loaded: new Uint8Array(1_048_576) };
    expect(readString.isEditable(load)).toBe(false);
    expect(readString.stringNote(load, 'full')).toBe('Showing the first 1 MB of 3 MB.');
  });

  it('loads more from where the first part ended, and is editable once whole', () => {
    const length = 3 * 1_048_576;
    let load: readString.StringLoad = { length, loaded: new Uint8Array(1_048_576) };
    const next = readString.nextPart(load);
    expect(next).toEqual({ form: 'full', length, offset: 1_048_576 });
    expect(readCommands(readString.request(context, next as never))).toEqual([
      'STRLEN orders:blob',
      'GETRANGE orders:blob 1048576 2097151',
    ]);
    for (const offset of [1_048_576, 2_097_152]) {
      load = readString.withPart(load, { length, offset, bytes: new Uint8Array(1_048_576), changed: false });
    }
    expect(readString.isEditable(load)).toBe(true);
    expect(readString.nextPart(load)).toBeUndefined();
  });

  it('offers no Load the whole value on a string of 20 MB', () => {
    const load = { length: 20 * 1_048_576, loaded: new Uint8Array(1_048_576) };
    expect(readString.canLoadWhole(load)).toBe(false);
    expect(readString.stringNote(load, 'full')).toBe('This value is 20 MB: Datardo edits strings of up to 16 MB.');
  });

  it('shows a part cut in the middle of é without its first byte, still as text', () => {
    const loaded = Uint8Array.from([...utf8('caf'), 0xc3]);
    const shownBytes = readString.bytesShown({ length: 5, loaded });
    expect(text(shownBytes)).toBe('caf');
  });

  it('reads the start of the string in the compact form', () => {
    expect(readCommands(readString.request(context, { form: 'compact' }))).toEqual([
      'STRLEN orders:blob',
      'GETRANGE orders:blob 0 4095',
    ]);
    const compact = recordedRead('string-compact');
    expect(text(readString.parse(compact.replies, compact.args).bytes ?? new Uint8Array())).toBe('hello');
  });

  it('reads the value again from the start when its length changed', () => {
    const part = readString.parse([7, utf8('changed')], { length: 3 * 1_048_576, offset: 1_048_576 });
    expect(part.changed).toBe(true);
  });
});

describe('value.read-hash', () => {
  const context = keyContext('value.read-hash');

  it('scans user:7 with HSCAN user:7 0 COUNT 200, and parses the recorded reply', () => {
    expect(readCommands(readHash.request(context, {}))).toEqual(['HSCAN user:7 0 COUNT 200']);
    const scan = recordedRead('hash-scan');
    const page = readHash.parse(scan.replies, scan.args);
    expect('items' in page && page.items.map((each) => [text(each.field), text(each.value)])).toEqual([
      ['nickname', 'Ada'],
      ['name', 'Ada Lovelace'],
      ['age', '36'],
    ]);
  });

  it('filters with MATCH *nick*', () => {
    expect(readCommands(readHash.request(context, { filter: 'nick' }))).toEqual([
      'HSCAN user:7 0 MATCH *nick* COUNT 200',
    ]);
  });

  it('stops a run at 200 found, and Load more goes on from the cursor', () => {
    const items = Array.from({ length: 200 }, (_, index) => ({ field: utf8(`f${String(index)}`), value: utf8('v') }));
    const paused = readHash.afterScanPage(
      readHash.scanStart<readHash.HashField>(),
      { cursor: '4096', items },
      (each) => each.field,
    );
    expect(paused.ended).toBe('paused');
    expect(readHash.nextScanArgs(paused, '')).toBeUndefined();
    expect(readHash.nextScanArgs(readHash.nextRun(paused), '')).toEqual({ form: 'full', cursor: '4096', filter: '' });
  });

  it('stops a run that finds nothing after 100 calls, and offers Load more', () => {
    let state = readHash.scanStart<{ readonly field: Uint8Array }>();
    for (let call = 0; call < 100; call += 1) {
      state = readHash.afterScanPage(state, { cursor: '17', items: [] }, (each) => each.field);
    }
    expect(state.calls).toBe(100);
    expect(state.ended).toBe('paused');
  });

  it('reads the expiry of each field with HPTTL, from the recorded reply', () => {
    const expiry = recordedRead('hash-expiry');
    expect(readCommands(readHash.request(context, expiry.args))).toEqual(['HPTTL user:7 FIELDS 2 nickname name']);
    const parsed = readHash.parse(expiry.replies, expiry.args);
    const expiries = 'expiries' in parsed ? parsed.expiries : [];
    expect(expiries[0]).toBeGreaterThan(0);
    expect(expiries[1]).toBeUndefined();
  });
});

describe('value.read-set', () => {
  const context = keyContext('value.read-set', { key: 'tags' });

  it('scans tags with SSCAN tags 0 COUNT 200, and with MATCH *red*', () => {
    expect(readCommands(readSet.request(context, {}))).toEqual(['SSCAN tags 0 COUNT 200']);
    expect(readCommands(readSet.request(context, { filter: 'red' }))).toEqual(['SSCAN tags 0 MATCH *red* COUNT 200']);
    const page = readSet.parse(recordedRead('set-scan').replies);
    expect(page.items.map(text)).toEqual(['red', 'green', 'blue']);
  });

  it('lists a member returned by two replies once', () => {
    const name = (each: Uint8Array): Uint8Array => each;
    const first = readHash.afterScanPage(readHash.scanStart<Uint8Array>(), { cursor: '5', items: [utf8('red')] }, name);
    const second = readHash.afterScanPage(first, { cursor: '0', items: [utf8('red'), utf8('blue')] }, name);
    expect(second.items.map(text)).toEqual(['red', 'blue']);
    expect(second.ended).toBe('whole');
  });
});
