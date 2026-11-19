import { describe, expect, it } from 'vitest';
import { commandArguments } from '../../../src/features/console/parse-line';
import { commandLine } from '../../../src/features/runner/step-text';
import { bytes, words } from './context';

function argumentsOf(line: string): readonly Uint8Array[] | string {
  const read = commandArguments(line);
  return read.kind === 'arguments' ? read.arguments : read.message;
}

describe('console.parse-line', () => {
  it('gives each row of the table its arguments', () => {
    const rows: readonly (readonly [string, readonly Uint8Array[]])[] = [
      ['GET greeting', words('GET', 'greeting')],
      ['  get   greeting  ', words('get', 'greeting')],
      ['SET greeting "hello world"', words('SET', 'greeting', 'hello world')],
      ["SET note 'it\\'s here'", words('SET', 'note', "it's here")],
      ['SET note "say \\"hi\\""', words('SET', 'note', 'say "hi"')],
      ['SET text "line1\\nline2"', words('SET', 'text', 'line1\nline2')],
      ["SET text 'line1\\nline2'", words('SET', 'text', 'line1\\nline2')],
      ['SET text line1\\nline2', words('SET', 'text', 'line1\\nline2')],
      ['SET bin "\\x00\\xff\\x41"', [...words('SET', 'bin'), bytes(0x00, 0xff, 0x41)]],
      ['SET name "caf\\xc3\\xa9"', words('SET', 'name', 'café')],
      ['SET name café', words('SET', 'name', 'café')],
      ['SET empty ""', words('SET', 'empty', '')],
      ['SET k a"b c"', words('SET', 'k', 'ab c')],
      ['SET k "\\q\\x4"', words('SET', 'k', 'qx4')],
      ['    ', []],
      ['', []],
    ];
    for (const [line, expected] of rows) {
      expect(argumentsOf(line), line).toEqual(expected);
    }
  });

  it('counts the bytes of a line feed, of text in UTF-8 and of the \\xNN escapes', () => {
    const [, , text] = argumentsOf('SET text "line1\\nline2"') as readonly Uint8Array[];
    expect(text?.length).toBe(11);
    expect((argumentsOf("SET text 'line1\\nline2'") as readonly Uint8Array[])[2]?.length).toBe(12);
    expect((argumentsOf('SET bin "\\x00\\xff\\x41"') as readonly Uint8Array[])[2]?.length).toBe(3);
    expect((argumentsOf('SET name café') as readonly Uint8Array[])[2]?.length).toBe(5);
  });

  it('reads the escapes \\r, \\t, \\b, \\a and \\\\ in double quotes, and `\\xNN` in either case', () => {
    expect(argumentsOf('SET k "\\r\\t\\b\\a\\\\\\xFF\\xfe"')).toEqual([
      ...words('SET', 'k'),
      bytes(0x0d, 0x09, 0x08, 0x07, 0x5c, 0xff, 0xfe),
    ]);
  });

  it('refuses a quote that is never closed, with its column', () => {
    expect(commandArguments('SET k "abc')).toEqual({
      kind: 'invalid',
      column: 7,
      message: 'The quote opened at column 7 is never closed.',
    });
    expect(argumentsOf("SET k 'abc")).toBe('The quote opened at column 7 is never closed.');
  });

  it('refuses a closing quote not followed by a space, with its column', () => {
    expect(commandArguments('SET k "a"b')).toEqual({
      kind: 'invalid',
      column: 9,
      message: 'The closing quote at column 9 must be followed by a space.',
    });
  });

  it('gives where each argument is in the line', () => {
    const read = commandArguments('  SET k "a b"');
    expect(read.kind === 'arguments' ? read.spans : []).toEqual([
      { start: 2, end: 5 },
      { start: 6, end: 7 },
      { start: 8, end: 13 },
    ]);
  });

  it('reads back the arguments of the text the runner writes for its step', () => {
    const commands = [
      words('SET', 'greeting', 'hello world'),
      [...words('SET', 'bin'), bytes(0x00, 0xff, 0x41)],
      words('SET', 'json', '{"a":"b"}'),
      words('SET', 'empty', ''),
      words('SET', 'note', "it's here", 'a\\b', 'tab\there', 'café'),
    ];
    for (const command of commands) {
      expect(argumentsOf(commandLine(command))).toEqual(command);
    }
  });
});
