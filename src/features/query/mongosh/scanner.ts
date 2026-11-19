/**
 * The lowest level of reading mongosh syntax: where the reader is in the text, spaces and comments, strings, numbers,
 * regular expressions and words. Nothing here evaluates anything (R9.1): each piece is read character by character.
 */
import type { Json } from '../../../shared/engine-request';
import { text } from '../text';
import { double, int32, int64, regex } from './ejson';

/** Where the reader is, and what a value made from nothing needs: the time and new ids. */
export interface Cursor {
  readonly text: string;
  at: number;
  depth: number;
  readonly now: number;
  readonly newId: () => string;
}

/** A text that cannot be read, at the offset of its first character that cannot. */
export class SyntaxProblem extends Error {
  /** Where the problem is, from 0. */
  readonly offset: number;

  constructor(message: string, offset: number) {
    super(message);
    this.offset = offset;
  }
}

/** Stops reading with a message, at the reader's place or another. */
export function fail(cursor: Cursor, message: string, at: number = cursor.at): never {
  throw new SyntaxProblem(message, at);
}

/** The character at the reader's place, or a later one; empty at the end. */
export function peek(cursor: Cursor, ahead = 0): string {
  return cursor.text.charAt(cursor.at + ahead);
}

/** Skips spaces, line ends and comments. */
export function skipSpace(cursor: Cursor): void {
  for (;;) {
    const character = peek(cursor);
    if (/\s/u.test(character) || character === '﻿') {
      cursor.at += 1;
    } else if (character === '/' && peek(cursor, 1) === '/') {
      const end = cursor.text.indexOf('\n', cursor.at);
      cursor.at = end < 0 ? cursor.text.length : end;
    } else if (character === '/' && peek(cursor, 1) === '*') {
      const end = cursor.text.indexOf('*/', cursor.at + 2);
      if (end < 0) {
        fail(cursor, text.parse.openComment);
      }
      cursor.at = end + 2;
    } else {
      return;
    }
  }
}

/** Whether a character can start a word: a letter, `_` or `$`. */
export function isWordStart(character: string): boolean {
  return /^[\p{L}_$]$/u.test(character);
}

/** Reads a word: letters, digits, `_` and `$`. */
export function readWord(cursor: Cursor): string {
  const start = cursor.at;
  while (/^[\p{L}\p{N}_$]$/u.test(peek(cursor))) {
    cursor.at += 1;
  }
  return cursor.text.slice(start, cursor.at);
}

const simpleEscapes: Readonly<Record<string, string>> = {
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
};

function hexEscape(cursor: Cursor, length: number): string {
  const digits = cursor.text.slice(cursor.at, cursor.at + length);
  if (!new RegExp(`^[0-9a-fA-F]{${String(length)}}$`, 'u').test(digits)) {
    fail(cursor, text.parse.badEscape);
  }
  cursor.at += length;
  return String.fromCharCode(Number.parseInt(digits, 16));
}

function escaped(cursor: Cursor): string {
  const character = peek(cursor);
  cursor.at += 1;
  if (character === 'x') {
    return hexEscape(cursor, 2);
  }
  if (character === 'u') {
    return hexEscape(cursor, 4);
  }
  if (character === '0' && !/[0-9]/u.test(peek(cursor))) {
    return '\0';
  }
  if (character === '\r' && peek(cursor) === '\n') {
    cursor.at += 1;
    return '';
  }
  return character === '\n' || character === '\r' || character === ' ' || character === ' '
    ? ''
    : (simpleEscapes[character] ?? character);
}

/** Reads a string in double or single quotes, with JSON5's escapes; it must close on its line. */
export function readString(cursor: Cursor): string {
  const quote = peek(cursor);
  const start = cursor.at;
  cursor.at += 1;
  let value = '';
  for (;;) {
    const character = peek(cursor);
    if (character === '' || character === '\n' || character === '\r') {
      fail(cursor, text.parse.openString, character === '' ? cursor.at : start);
    }
    cursor.at += 1;
    if (character === quote) {
      return value;
    }
    value += character === '\\' ? escaped(cursor) : character;
  }
}

const numberPattern = /[+-]?(?:0[xX][0-9a-fA-F]+|Infinity|NaN|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/uy;

/** The smallest and largest `Int32` and `Int64`. */
const int32Range = { low: -2147483648n, high: 2147483647n };
const int64Range = { low: -9223372036854775808n, high: 9223372036854775807n };

/** The number as written, without reading it: `-5`, `0x1F`, `1e3`, `.5`. */
export function readNumberText(cursor: Cursor): string {
  numberPattern.lastIndex = cursor.at;
  const match = numberPattern.exec(cursor.text);
  if (match === null) {
    fail(cursor, text.parse.unexpected(peek(cursor)));
  }
  cursor.at += match[0].length;
  return match[0];
}

/** The whole number a text of digits or of `0x…` stands for, or `undefined` when it has a fraction or an exponent. */
export function wholeNumber(written: string): bigint | undefined {
  const sign = written.startsWith('-') ? -1n : 1n;
  const unsigned = written.replace(/^[+-]/u, '');
  if (/^0[xX][0-9a-fA-F]+$/u.test(unsigned) || /^\d+$/u.test(unsigned)) {
    return sign * BigInt(unsigned);
  }
  return undefined;
}

/** A number by how it is written: digits alone are an `Int32`, then an `Int64`, then a `Double`. */
export function numberValue(written: string): Json {
  const whole = wholeNumber(written);
  if (whole === undefined) {
    return double(Number(written.replace(/^\+/u, '')));
  }
  if (whole >= int32Range.low && whole <= int32Range.high) {
    return int32(Number(whole));
  }
  return whole >= int64Range.low && whole <= int64Range.high ? int64(whole.toString()) : double(Number(whole));
}

/** Whether a whole number fits 32 bits, or 64 bits. */
export function fitsInt(value: bigint, bits: 32 | 64): boolean {
  const range = bits === 32 ? int32Range : int64Range;
  return value >= range.low && value <= range.high;
}

function regexClass(cursor: Cursor): string {
  let part = '';
  for (;;) {
    const character = peek(cursor);
    if (character === '' || character === '\n') {
      fail(cursor, text.parse.openRegex);
    }
    cursor.at += 1;
    part += character;
    if (character === '\\') {
      part += peek(cursor);
      cursor.at += 1;
    } else if (character === ']') {
      return part;
    }
  }
}

/** The options kept from the letters after a regular expression: `i`, `m`, `s`, `x`, `u`, once each, in order. */
export function regexOptions(letters: string): string {
  return [...new Set(letters.replace(/[^imsxu]/gu, ''))].sort().join('');
}

/** Reads `/pattern/options` on one line; `\/` in the pattern is a slash. */
export function readRegex(cursor: Cursor): Json {
  cursor.at += 1;
  let pattern = '';
  for (;;) {
    const character = peek(cursor);
    if (character === '' || character === '\n' || character === '\r') {
      fail(cursor, text.parse.openRegex);
    }
    cursor.at += 1;
    if (character === '/') {
      break;
    }
    if (character === '\\') {
      const next = peek(cursor);
      if (next === '' || next === '\n' || next === '\r') {
        fail(cursor, text.parse.openRegex);
      }
      cursor.at += 1;
      pattern += next === '/' ? '/' : `\\${next}`;
    } else {
      pattern += character === '[' ? `[${regexClass(cursor)}` : character;
    }
  }
  const start = cursor.at;
  while (/[A-Za-z]/u.test(peek(cursor))) {
    cursor.at += 1;
  }
  return regex(pattern, regexOptions(cursor.text.slice(start, cursor.at)));
}
