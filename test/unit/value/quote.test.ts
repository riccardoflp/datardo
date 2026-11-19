import { describe, expect, it } from 'vitest';
import { quoted } from '../../../src/features/value/quote';
import { bytes, utf8 } from './context';

const escapes: Readonly<Record<string, number>> = { n: 0x0a, r: 0x0d, t: 0x09, b: 0x08, a: 0x07 };

/** One byte of a quoted argument from `at`, and where the next one starts: `\xHH`, `\n` and the others, or itself. */
function quotedByte(input: Uint8Array, at: number): readonly [number, number] {
  if (input[at] !== 0x5c) {
    return [input[at] ?? 0, at + 1];
  }
  const next = String.fromCharCode(input[at + 1] ?? 0);
  if (next === 'x') {
    return [Number.parseInt(String.fromCharCode(input[at + 2] ?? 0, input[at + 3] ?? 0), 16), at + 4];
  }
  return [escapes[next] ?? next.charCodeAt(0), at + 2];
}

/** One argument from `at`, quoted or bare, and where the line goes on after it. */
function argumentAt(input: Uint8Array, start: number): readonly [Uint8Array, number] {
  const word: number[] = [];
  let at = start;
  if (input[at] === 0x22) {
    at += 1;
    while (input[at] !== 0x22) {
      const [byte, next] = quotedByte(input, at);
      word.push(byte);
      at = next;
    }
    return [Uint8Array.from(word), at + 1];
  }
  while (at < input.length && input[at] !== 0x20) {
    word.push(input[at] ?? 0);
    at += 1;
  }
  return [Uint8Array.from(word), at];
}

/** Splits a line as `redis-cli` does (`sdssplitargs`), giving the bytes of each argument. */
function splitArgs(line: string): readonly Uint8Array[] {
  const input = utf8(line);
  const args: Uint8Array[] = [];
  let at = 0;
  while (at < input.length) {
    if (input[at] === 0x20) {
      at += 1;
      continue;
    }
    const [word, next] = argumentAt(input, at);
    args.push(word);
    at = next;
  }
  return args;
}

describe('value.quote', () => {
  const table: readonly (readonly [Uint8Array, string])[] = [
    [utf8('orders:42'), 'orders:42'],
    [utf8('hello world'), '"hello world"'],
    [new Uint8Array(), '""'],
    [utf8('{"a":1}'), '"{\\"a\\":1}"'],
    [utf8('C:\\tmp'), '"C:\\\\tmp"'],
    [utf8("it's"), '"it\'s"'],
    [utf8('#tag'), '"#tag"'],
    [bytes('63 61 66 c3 a9'), '"café"'],
    [bytes('63 61 66 e9'), '"caf\\xe9"'],
    [bytes('00 ff'), '"\\x00\\xff"'],
    [utf8('a\nb'), '"a\\nb"'],
    [utf8('1.5'), '1.5'],
  ];

  it.each(table)('each row of the table gives its text: %s', (value, text) => {
    expect(quoted(value, 'step')).toBe(text);
    expect(quoted(value, 'whole')).toBe(text);
  });

  it('gives one argument with the same bytes for any bytes, split as redis-cli splits a line', () => {
    let seed = 7;
    for (let round = 0; round < 200; round += 1) {
      const value = Uint8Array.from({ length: round % 40 }, () => {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        return seed % 256;
      });
      const args = splitArgs(quoted(value, 'whole'));
      expect(args).toHaveLength(1);
      expect(Array.from(args[0] ?? [])).toEqual(Array.from(value));
    }
  });

  it('cuts a value of 12,345 bytes in a step at 64 bytes, and writes it whole elsewhere', () => {
    const value = utf8('x y'.repeat(4115));
    expect(value.length).toBe(12_345);
    const step = quoted(value, 'step');
    expect(step).toBe(`"${'x y'.repeat(22).slice(0, 64)}…" (12,345 bytes)`);
    const whole = quoted(value, 'whole');
    expect(whole).toBe(`"${'x y'.repeat(4115)}"`);
  });
});
