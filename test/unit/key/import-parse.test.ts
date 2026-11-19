import { describe, expect, it } from 'vitest';
import type { ExportedKey } from '../../../src/features/key/export-text';
import { exportText } from '../../../src/features/key/export-text';
import type { ImportedFile, ImportedKey } from '../../../src/features/key/import-parse';
import { importedKeys } from '../../../src/features/key/import-parse';
import { name } from './context';
import { exampleFile } from './example';

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

function keysOf(file: ImportedFile): readonly ImportedKey[] {
  if (file.kind !== 'keys') {
    throw new Error(file.message);
  }
  return file.keys;
}

function summary(file: ImportedFile): unknown {
  return file.kind === 'error'
    ? file.message
    : file.keys.map((key) => ({ name: text(key.name), type: key.type, commands: key.commands.length }));
}

describe('key.import-parse', () => {
  it.each([
    ['SET a 1', [{ name: 'a', type: 'string', commands: 1 }]],
    ['HSET h f "v w"\nPEXPIREAT h 1798761600000', [{ name: 'h', type: 'hash', commands: 2 }]],
    ['hset h f v', [{ name: 'h', type: 'hash', commands: 1 }]],
    [
      'RPUSH q a\nSADD s m\nRPUSH q b',
      [
        { name: 'q', type: 'list', commands: 2 },
        { name: 's', type: 'set', commands: 1 },
      ],
    ],
    ['# comment\n\nSET a 1', [{ name: 'a', type: 'string', commands: 1 }]],
    ['SET a 1 EX 10', 'Line 1: SET needs a key and a value.'],
    ['SET a "1', 'Line 1: unbalanced quotes.'],
    [
      'DEL a',
      'Line 1: only the commands Datardo exports can be imported (SET, APPEND, HSET, RPUSH, SADD, ZADD, XADD, RESTORE, PEXPIREAT): found DEL.',
    ],
    ['SET a 1\nHSET a f v', 'Line 2: a is a string earlier in the file.'],
    ['PEXPIREAT a 1798761600000', 'Line 1: a has no value before its expiry.'],
  ])('reads %j as %j', (fileText, expected) => {
    expect(summary(importedKeys(fileText))).toEqual(expected);
  });

  it('reads back the name, type, bytes and expiry key.export-text writes, with quotes, line breaks and bytes', () => {
    const written: ExportedKey = {
      name: Uint8Array.of(0x75, 0x73, 0x65, 0x72, 0x3a, 0xff),
      value: { type: 'string', bytes: Uint8Array.of(0x22, 0x0a, 0x5c, 0x00, 0xff, 0x27, 0x20) },
      expiresAt: 1_798_761_600_000,
    };
    const [key] = keysOf(importedKeys(exportText(written).join('\n')));
    expect(key?.name).toEqual(written.name);
    expect(key?.type).toBe('string');
    expect(key?.commands.map((command) => command.words)).toEqual([
      [name('SET'), written.name, Uint8Array.of(0x22, 0x0a, 0x5c, 0x00, 0xff, 0x27, 0x20)],
      [name('PEXPIREAT'), written.name, name('1798761600000')],
    ]);
  });

  it('reads the example of key.export-text as its five keys', () => {
    const keys = keysOf(importedKeys(`${exampleFile}\n`));
    expect(keys.map((key) => [text(key.name), key.type])).toEqual([
      ['session:1', 'string'],
      ['user:7', 'hash'],
      ['queue:mail', 'list'],
      ['board', 'zset'],
      ['events', 'stream'],
    ]);
    expect(keys[2]?.commands[0]?.words[4]).toEqual(Uint8Array.of(0, 0xff));
  });

  it('refuses XADD s * f v with Line 1: XADD needs a full ID, not *.', () => {
    expect(importedKeys('XADD s * f v')).toEqual({
      kind: 'error',
      line: 1,
      message: 'Line 1: XADD needs a full ID, not *.',
    });
  });

  it('reads a file that ends without a final line feed to its last line, and lines ending with CR LF', () => {
    const keys = keysOf(importedKeys('SET a 1\r\nSET b 2'));
    expect(keys.map((key) => text(key.name))).toEqual(['a', 'b']);
  });

  it('refuses a second SET of the same key, and FLUSHALL', () => {
    expect(summary(importedKeys('SET a 1\nSET b 2\nSET a 3'))).toBe('Line 3: a is already set at line 1.');
    expect(summary(importedKeys('SET a 1\nFLUSHALL'))).toMatch(/^Line 2: only the commands .*: found FLUSHALL\.$/u);
  });
});
