/**
 * Feature: query.parse
 *
 * Turns the text the user types (a filter, a sort, a value in a cell, a document to insert) into one value with the
 * BSON type of each part kept, as canonical Extended JSON. The text is read, never evaluated: nothing typed can run
 * code (R9.1).
 */
import type { Json } from '../../shared/engine-request';
import { SyntaxProblem, skipSpace, peek, type Cursor } from './mongosh/scanner';
import { readValue } from './mongosh/reader';
import { text as words } from './text';

/** Where a text cannot be read, and why: the line and the column count from 1. */
export interface ParseError {
  readonly message: string;
  readonly line: number;
  readonly column: number;
  /** The offset of the first character that cannot be read, from 0. */
  readonly offset: number;
}

/** A value read from a text, or why it cannot be. */
export type Parsed = { readonly ok: true; readonly value: Json } | { readonly ok: false; readonly error: ParseError };

/** The line and the column, from 1, of an offset of a text. */
export function lineAndColumn(source: string, offset: number): { readonly line: number; readonly column: number } {
  const before = source.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

function failed(source: string, message: string, offset: number): Parsed {
  return { ok: false, error: { message, offset, ...lineAndColumn(source, offset) } };
}

/**
 * Feature: query.parse
 *
 * The value of a text in mongosh syntax, read with the current time (`ISODate()`, `new Date()`) and a maker of new ids
 * (`ObjectId()`). An empty text is not a value: the caller decides what an empty field means.
 */
export function parsedValue(source: string, now: number, newId: () => string): Parsed {
  const cursor: Cursor = { text: source, at: 0, depth: 0, now, newId };
  try {
    skipSpace(cursor);
    if (peek(cursor) === '') {
      return failed(source, words.parse.empty, cursor.at);
    }
    const value = readValue(cursor);
    skipSpace(cursor);
    if (peek(cursor) !== '') {
      return failed(source, words.parse.unexpected(peek(cursor)), cursor.at);
    }
    return { ok: true, value };
  } catch (error: unknown) {
    // A text that cannot be read is the answer, with its place; anything else is a fault of the reader.
    if (error instanceof SyntaxProblem) {
      return failed(source, error.message, error.offset);
    }
    throw error;
  }
}

/**
 * The id `ObjectId()` makes where no maker is given: the id of the time given, with the other bytes zero, as
 * `ObjectId.createFromTime` makes it. `{ _id: { $gte: ObjectId() } }` then means "made from now on".
 */
export function idOfTime(now: number): string {
  return Math.floor(now / 1000)
    .toString(16)
    .padStart(8, '0')
    .slice(-8)
    .padEnd(24, '0');
}
