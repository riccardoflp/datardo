/**
 * Reads one value of mongosh syntax with a recursive descent: objects, arrays, strings, numbers, regular expressions,
 * the words `true`, `false`, `null`, `undefined`, `Infinity`, `NaN`, and the helpers of `helpers.ts`. Extended JSON is
 * read too, since it is JSON, and its relaxed forms are made canonical. Nothing is evaluated (R9.1).
 */
import type { Json } from '../../../shared/engine-request';
import { text } from '../text';
import { dateValue, double, isJsonObject, objectField, numberOf, type JsonObject } from './ejson';
import { callHelper, isHelper, uuidValue } from './helpers';
import {
  fail,
  isWordStart,
  peek,
  readNumberText,
  readRegex,
  readString,
  readWord,
  skipSpace,
  numberValue,
  type Cursor,
} from './scanner';

/** How deep arrays and objects may nest (Datardo's choice, R14.4). */
export const deepestNesting = 200;

/** Reads the value that starts at the reader's place, after spaces and comments. */
export function readValue(cursor: Cursor): Json {
  skipSpace(cursor);
  const character = peek(cursor);
  if (character === '') {
    fail(cursor, text.parse.endsEarly);
  }
  if (character === '{') {
    return nested(cursor, readObject);
  }
  if (character === '[') {
    return nested(cursor, readArray);
  }
  if (character === '"' || character === "'") {
    return readString(cursor);
  }
  if (character === '/') {
    return readRegex(cursor);
  }
  if (/[0-9+\-.]/u.test(character)) {
    return numberValue(readNumberText(cursor));
  }
  if (isWordStart(character)) {
    return readWordValue(cursor);
  }
  return fail(cursor, text.parse.unexpected(character));
}

function nested(cursor: Cursor, read: (cursor: Cursor) => Json): Json {
  if (cursor.depth >= deepestNesting) {
    fail(cursor, text.parse.tooDeep);
  }
  cursor.depth += 1;
  const value = read(cursor);
  cursor.depth -= 1;
  return value;
}

/** Expects one character after spaces and comments: a `,`, a closing bracket. */
function expect(cursor: Cursor, characters: string): string {
  skipSpace(cursor);
  const character = peek(cursor);
  if (character === '' || !characters.includes(character)) {
    fail(cursor, character === '' ? text.parse.endsEarly : text.parse.unexpected(character));
  }
  cursor.at += 1;
  return character;
}

function readArray(cursor: Cursor): Json {
  cursor.at += 1;
  const items: Json[] = [];
  for (;;) {
    skipSpace(cursor);
    if (peek(cursor) === ']') {
      cursor.at += 1;
      return items;
    }
    items.push(readValue(cursor));
    if (expect(cursor, ',]') === ']') {
      return items;
    }
  }
}

function readKey(cursor: Cursor): string {
  const character = peek(cursor);
  if (character === '"' || character === "'") {
    return readString(cursor);
  }
  if (isWordStart(character)) {
    return readWord(cursor);
  }
  return fail(cursor, character === '' ? text.parse.endsEarly : text.parse.unexpected(character));
}

function readObject(cursor: Cursor): Json {
  cursor.at += 1;
  const entries = new Map<string, Json>();
  for (;;) {
    skipSpace(cursor);
    if (peek(cursor) === '}') {
      cursor.at += 1;
      break;
    }
    const key = readKey(cursor);
    expect(cursor, ':');
    entries.set(key, readValue(cursor));
    if (expect(cursor, ',}') === '}') {
      break;
    }
  }
  return canonical(Object.fromEntries(entries));
}

function readWordValue(cursor: Cursor): Json {
  const start = cursor.at;
  const word = readWord(cursor);
  switch (word) {
    case 'true':
      return true;
    case 'false':
      return false;
    case 'null':
      return null;
    case 'undefined':
      return { $undefined: true };
    case 'Infinity':
    case 'NaN':
      return double(Number(word));
    case 'new':
      return readNew(cursor);
    default:
      if (!isHelper(word)) {
        fail(cursor, text.parse.unknownName(word), start);
      }
      return callHelper(cursor, word, start, readValue);
  }
}

/** `new Date(…)` and `new ObjectId(…)`: the only words `new` may come before. */
function readNew(cursor: Cursor): Json {
  skipSpace(cursor);
  const start = cursor.at;
  const word = readWord(cursor);
  if (word !== 'Date' && word !== 'ObjectId') {
    fail(cursor, word === '' ? text.parse.unexpected(peek(cursor)) : text.parse.unknownName(`new ${word}`), start);
  }
  return callHelper(cursor, word, start, readValue);
}

/** A whole number of a field of Extended JSON, which canonical Extended JSON writes as a plain number. */
function plainNumber(value: Json | undefined): Json {
  const number = numberOf(value);
  return number === undefined ? (value ?? null) : number;
}

/** The relaxed forms of Extended JSON made canonical; any other object as it is. */
function canonical(value: JsonObject): JsonObject {
  const keys = Object.keys(value);
  if (keys.length !== 1) {
    return value;
  }
  const inner = value[keys[0] ?? ''];
  switch (keys[0]) {
    case '$date':
      return canonicalDate(value, inner);
    case '$uuid':
      return typeof inner === 'string' ? (uuidValue(inner) ?? value) : value;
    case '$timestamp':
      return isJsonObject(inner) ? { $timestamp: { t: plainNumber(inner['t']), i: plainNumber(inner['i']) } } : value;
    case '$minKey':
    case '$maxKey':
      return { [keys[0]]: plainNumber(inner) };
    case undefined:
    default:
      return value;
  }
}

function canonicalDate(value: JsonObject, inner: Json | undefined): JsonObject {
  if (typeof inner === 'string') {
    const time = new Date(inner).getTime();
    return Number.isNaN(time) ? value : dateValue(String(time));
  }
  const number = numberOf(inner);
  if (number !== undefined && objectField(inner, '$numberLong') === undefined) {
    return dateValue(String(Math.trunc(number)));
  }
  return value;
}
