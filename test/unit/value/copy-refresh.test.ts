import { describe, expect, it } from 'vitest';
import * as copy from '../../../src/features/value/copy';
import * as refresh from '../../../src/features/value/refresh';
import { hexOf } from '../../../src/features/value/types';
import { bytes, keyContext, needOf, planOf, refusalOf, utf8 } from './context';

const hex = (text: string): { readonly hex: string } => ({ hex: hexOf(utf8(text)) });

function copiedText(outcome: ReturnType<typeof copy.plan>): string {
  const after = planOf(outcome).after[0];
  return after?.kind === 'copy' ? after.text : '';
}

describe('value.copy', () => {
  const context = keyContext('value.copy');

  it('copies the cell Ada Lovelace without quotes', () => {
    expect(copiedText(copy.plan(context, { type: 'hash', cell: hex('Ada Lovelace') }))).toBe('Ada Lovelace');
  });

  it('copies a value shown as JSON as it is stored', () => {
    const string = keyContext('value.copy', { key: 'doc' });
    expect(copiedText(copy.plan(string, { type: 'string', length: 7, loaded: hex('{"a":1}') }))).toBe('{"a":1}');
  });

  it('copies 00 ff as pairs, and hello as hexadecimal', () => {
    expect(copiedText(copy.plan(context, { type: 'hash', cell: { hex: hexOf(bytes('00 ff')) } }))).toBe('00 ff');
    expect(copiedText(copy.plan(context, { type: 'hash', cell: hex('hello'), as: 'hex' }))).toBe('68 65 6c 6c 6f');
  });

  it('copies the rows name and visits of user:7 as a command, and as two lines', () => {
    const items = [
      [hex('name'), hex('Ada')],
      [hex('visits'), hex('12')],
    ];
    expect(copiedText(copy.plan(context, { type: 'hash', items, as: 'command' }))).toBe(
      'HSET user:7 name Ada visits 12',
    );
    expect(copiedText(copy.plan(context, { type: 'hash', items, as: 'rows' }))).toBe('name\tAda\nvisits\t12');
  });

  it('copies the string orders:42 as a command', () => {
    const string = keyContext('value.copy', { key: 'orders:42' });
    const outcome = copy.plan(string, { type: 'string', length: 11, loaded: hex('hello world'), as: 'command' });
    expect(copiedText(outcome)).toBe('SET orders:42 "hello world"');
  });

  it('reads the rest of a string of 3 MB of which 1 MB is loaded, then copies the 3 MB', () => {
    const length = 3 * 1_048_576;
    const loaded = { hex: '61'.repeat(1_048_576) };
    expect(needOf(copy.plan(context, { type: 'string', length, loaded }))).toEqual({
      key: 'part:1048576',
      read: 'value.read-string',
      args: { form: 'full', length, offset: 1_048_576 },
    });
    const part = (offset: number): unknown => ({
      length,
      offset,
      bytes: new Uint8Array(1_048_576).fill(0x61),
      changed: false,
    });
    const outcome = copy.plan(context, {
      type: 'string',
      length,
      loaded,
      'part:1048576': part(1_048_576),
      'part:2097152': part(2_097_152),
    });
    expect(copiedText(outcome)).toHaveLength(length);
  });

  it('refuses a string of 20 MB', () => {
    expect(refusalOf(copy.plan(context, { type: 'string', length: 20 * 1_048_576 }))).toEqual({
      code: 'value.copy/too-large',
      message: 'Too large to copy: export the key to a file instead.',
    });
  });

  it('works on a read-only connection', () => {
    const readOnly = keyContext('value.copy', { readOnly: true });
    expect(copiedText(copy.plan(readOnly, { type: 'hash', cell: hex('Ada') }))).toBe('Ada');
  });

  it('writes the lines of each type as key.export-text does', () => {
    const key = utf8('k');
    expect(copy.commandLines('list', key, [[utf8('a')], [utf8('c d')]])).toBe('RPUSH k a "c d"');
    expect(copy.commandLines('zset', key, [[utf8('1.5'), utf8('ada')]])).toBe('ZADD k 1.5 ada');
    expect(copy.commandLines('stream', key, [[utf8('1-0'), utf8('type'), utf8('signup')]])).toBe(
      'XADD k 1-0 type signup',
    );
  });
});

describe('value.refresh', () => {
  it('reads the key again, with nothing to undo', () => {
    const plan = planOf(refresh.plan(keyContext('value.refresh'), {}));
    expect(plan.steps).toEqual([]);
    expect(plan.danger).toEqual({ kind: 'none' });
    expect(plan.after).toEqual([{ kind: 'refresh', connection: 'c-cache' }]);
  });

  it('asks Discard your changes to orders:42? with a string edited and not saved', () => {
    const plan = planOf(refresh.plan(keyContext('value.refresh', { key: 'orders:42' }), { unsaved: true }));
    expect(plan.title).toBe('Discard your changes to orders:42?');
    expect(plan.danger).toEqual({ kind: 'confirm', text: '', button: 'Discard' });
  });
});
