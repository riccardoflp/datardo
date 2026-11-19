import { describe, expect, it } from 'vitest';
import { shown, type Format } from '../../../src/features/value/format';
import { typedBytes, type Typed } from '../../../src/features/value/typed-bytes';
import { bytes, utf8 } from './context';

function bytesOf(result: Typed): readonly number[] {
  if ('problem' in result) {
    throw new Error(result.problem);
  }
  return Array.from(result.bytes);
}

function problemOf(result: Typed): string | undefined {
  return 'problem' in result ? result.problem : undefined;
}

/** The text an editor shows for bytes in a format. */
function editorText(value: Uint8Array, format: Format): string {
  return shown(value, format, 'full').text;
}

describe('value.typed-bytes', () => {
  it('Text: hello typed as hello world', () => {
    expect(bytesOf(typedBytes('hello world', 'text', utf8('hello')))).toEqual(
      Array.from(bytes('68 65 6c 6c 6f 20 77 6f 72 6c 64')),
    );
  });

  it('Text: café typed for a new value', () => {
    expect(bytesOf(typedBytes('café', 'text'))).toEqual(Array.from(bytes('63 61 66 c3 a9')));
  });

  it('Text: a third line added to a value with CR LF', () => {
    expect(bytesOf(typedBytes('a\nb\nc', 'text', bytes('61 0d 0a 62')))).toEqual(
      Array.from(bytes('61 0d 0a 62 0d 0a 63')),
    );
  });

  it('JSON: a compact original stays compact, with its other tokens as they were', () => {
    const original = utf8('{"a":1,"id":12345678901234567890}');
    const text = editorText(original, 'json').replace('"a": 1', '"a": 2');
    expect(new TextDecoder().decode(Uint8Array.from(bytesOf(typedBytes(text, 'json', original))))).toBe(
      '{"a":2,"id":12345678901234567890}',
    );
  });

  it('JSON: an original with spacing is saved as formatted, with the note', () => {
    const original = utf8('{ "a": 1 }');
    const text = editorText(original, 'json').replace('"a": 1', '"a": 2');
    const result = typedBytes(text, 'json', original);
    expect(new TextDecoder().decode(Uint8Array.from(bytesOf(result)))).toBe('{\n  "a": 2\n}');
    expect('note' in result ? result.note : undefined).toBe(
      'Saved as formatted here: the original spacing is not kept. Use Text to keep it.',
    );
  });

  it('JSON: the formatted text untouched gives the original 7 bytes', () => {
    const original = utf8('{"a":1}');
    expect(bytesOf(typedBytes(editorText(original, 'json'), 'json', original))).toEqual(Array.from(original));
  });

  it('JSON: text that does not parse is refused', () => {
    expect(problemOf(typedBytes('{"a":}', 'json', utf8('{"a":1}')))?.startsWith('Not valid JSON: ')).toBe(true);
  });

  it('Hex: 00 FF 0a', () => {
    expect(bytesOf(typedBytes('00 FF 0a', 'hex', bytes('00 ff')))).toEqual([0x00, 0xff, 0x0a]);
  });

  it('Hex: an odd number of digits, and a character that is not a digit', () => {
    expect(problemOf(typedBytes('0 ff', 'hex'))).toBe('Hexadecimal needs two digits a byte: 3 digits found.');
    expect(problemOf(typedBytes('zz', 'hex'))).toBe('Not hexadecimal: "z" at position 1.');
  });

  it('writes nothing new for a value opened in JSON and saved without typing', () => {
    const original = utf8('{"b": [1, 2],  "a": "x"}');
    expect(bytesOf(typedBytes(editorText(original, 'json'), 'json', original))).toEqual(Array.from(original));
  });

  it('saves a compact value of three members compact, the other two members with the same bytes', () => {
    const original = utf8('{"name":"Ada","n":1.50,"tags":["x"]}');
    const text = editorText(original, 'json').replace('"Ada"', '"Grace"');
    expect(new TextDecoder().decode(Uint8Array.from(bytesOf(typedBytes(text, 'json', original))))).toBe(
      '{"name":"Grace","n":1.50,"tags":["x"]}',
    );
  });

  it('saves a text that ends without a line break without one', () => {
    expect(bytesOf(typedBytes('last line', 'text', utf8('first\nsecond')))).toEqual(Array.from(utf8('last line')));
  });
});
