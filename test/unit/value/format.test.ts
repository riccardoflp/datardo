import { describe, expect, it } from 'vitest';
import { decidedFormat, hexDump, shown, type Format } from '../../../src/features/value/format';
import { bytes, utf8 } from './context';

describe('value.format', () => {
  const table: readonly (readonly [string, Uint8Array, Format])[] = [
    ['hello', bytes('68 65 6c 6c 6f'), 'text'],
    ['café', bytes('63 61 66 c3 a9'), 'text'],
    ['two lines with a tab', bytes('6c 31 0a 6c 32 09 78'), 'text'],
    ['an object', bytes('7b 22 61 22 3a 31 7d'), 'json'],
    ['an array and a line feed', utf8('[1, 2]\n'), 'json'],
    ['big numbers', utf8('{"id":12345678901234567890,"n":1.0}'), 'json'],
    ['a number alone', bytes('34 32'), 'text'],
    ['a string alone', bytes('22 68 69 22'), 'text'],
    ['JSON that does not parse', utf8('{"a":1'), 'text'],
    ['café in Latin-1', bytes('63 61 66 e9'), 'hex'],
    ['a NUL', bytes('61 62 63 00'), 'hex'],
    ['an escape character', bytes('1b 5b 33 31 6d 72 65 64'), 'hex'],
    ['control characters', bytes('00 00 00 2a'), 'hex'],
    ['UTF-16', bytes('ff fe 68 00 69 00'), 'hex'],
    ['an overlong form', bytes('c0 af'), 'hex'],
    ['a character cut short', bytes('e2 82'), 'hex'],
    ['gzip', bytes('1f 8b 08 00'), 'hex'],
    ['MessagePack', bytes('82 a1 61 01'), 'hex'],
    ['a serialized Java object', bytes('ac ed 00 05'), 'hex'],
  ];

  it.each(table)('each row of the table gives its format: %s', (_name, value, format) => {
    expect(decidedFormat(value)).toBe(format);
  });

  it('shows an object as JSON on three lines, and text and tab as they are', () => {
    expect(shown(bytes('7b 22 61 22 3a 31 7d'), undefined, 'full').text).toBe('{\n  "a": 1\n}');
    expect(shown(bytes('6c 31 0a 6c 32 09 78'), undefined, 'full').text).toBe('l1\nl2\tx');
  });

  it('the 16 bytes of the example give exactly the line shown', () => {
    expect(hexDump(bytes('de ad be ef 00 01 02 03 68 65 6c 6c 6f 0a ff fe'))).toBe(
      '00000000  de ad be ef 00 01 02 03  68 65 6c 6c 6f 0a ff fe  |........hello...|',
    );
  });

  it('keeps big numbers and numbers as written', () => {
    const text = shown(utf8('{"id":12345678901234567890,"n":1.0}'), 'json', 'full').text;
    expect(text).toContain('"id": 12345678901234567890');
    expect(text).toContain('"n": 1.0');
    expect(text).not.toContain('12345678901234567000');
  });

  it('keeps both members of the same name', () => {
    expect(shown(utf8('{"a":1,"a":2}'), 'json', 'full').text).toBe('{\n  "a": 1,\n  "a": 2\n}');
  });

  it('shows Hex on hello as pairs, and Text on bytes that are not UTF-8 read-only with a note', () => {
    expect(shown(utf8('hello'), 'hex', 'full').text).toContain('68 65 6c 6c 6f');
    const text = shown(bytes('63 61 66 e9'), 'text', 'full');
    expect(text.text).toBe('caf�');
    expect(text.editable).toBe(false);
    expect(text.note).toContain('UTF-8');
  });

  it('shows JSON chosen on hello as text, with a note that starts with Not JSON:', () => {
    const json = shown(utf8('hello'), 'json', 'full');
    expect(json.text).toBe('hello');
    expect(json.note?.startsWith('Not JSON:')).toBe(true);
  });

  it('cuts a long text in a cell at 200 characters, and a long value that is not text at 32 pairs', () => {
    const text = shown(utf8('a'.repeat(500)), undefined, 'compact').text;
    expect(text).toBe(`${'a'.repeat(200)}…`);
    const binary = shown(new Uint8Array(1024).fill(0xff), undefined, 'compact').text;
    expect(binary).toBe(`${Array.from({ length: 32 }, () => 'ff').join(' ')}… (1,024 bytes)`);
  });

  it('shows a text of 2 MB that is valid JSON as text until JSON is chosen', () => {
    const big = utf8(`[${'1,'.repeat(1_048_576)}1]`);
    expect(decidedFormat(big)).toBe('text');
    expect(shown(big, 'json', 'full').format).toBe('json');
  });
});
