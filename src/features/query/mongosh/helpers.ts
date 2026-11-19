/**
 * The helpers of mongosh syntax that make typed values: `ObjectId("…")`, `ISODate("…")`, `NumberLong(5)`, `UUID("…")`
 * and the others of `query.parse`'s table. Their arguments are read as values and checked; nothing is called.
 */
import type { Json } from '../../../shared/engine-request';
import { text } from '../text';
import {
  binary,
  bytesOfBase64,
  bytesOfHex,
  dateValue,
  decimal,
  double,
  int32,
  int64,
  isJsonObject,
  numberOf,
  objectId,
  timestamp,
  type JsonObject,
} from './ejson';
import { fail, fitsInt, numberValue, peek, readNumberText, skipSpace, wholeNumber, type Cursor } from './scanner';

/** An argument of a helper: a number, kept as written, or any other value; and where it starts. */
type Argument =
  | { readonly kind: 'number'; readonly written: string; readonly at: number }
  | { readonly kind: 'value'; readonly value: Json; readonly at: number };

/** What a helper is given: the reader, its arguments, and where its name starts. */
interface Call {
  readonly cursor: Cursor;
  readonly name: string;
  readonly args: readonly Argument[];
  readonly at: number;
}

type Helper = (call: Call) => Json;

function unexpectedHere(cursor: Cursor): never {
  return fail(cursor, peek(cursor) === '' ? text.parse.endsEarly : text.parse.unexpected(peek(cursor)));
}

/** Reads any value: the reader's own `readValue`, given by the reader so that this module does not import it. */
type ValueReader = (cursor: Cursor) => Json;

function readArgument(cursor: Cursor, readValue: ValueReader): Argument {
  const at = cursor.at;
  return /[0-9+\-.]/u.test(peek(cursor))
    ? { kind: 'number', written: readNumberText(cursor), at }
    : { kind: 'value', value: readValue(cursor), at };
}

function readArguments(cursor: Cursor, readValue: ValueReader): readonly Argument[] {
  skipSpace(cursor);
  if (peek(cursor) !== '(') {
    unexpectedHere(cursor);
  }
  cursor.at += 1;
  const args: Argument[] = [];
  for (;;) {
    skipSpace(cursor);
    if (peek(cursor) === ')') {
      cursor.at += 1;
      return args;
    }
    args.push(readArgument(cursor, readValue));
    skipSpace(cursor);
    if (peek(cursor) === ',') {
      cursor.at += 1;
    } else if (peek(cursor) !== ')') {
      unexpectedHere(cursor);
    }
  }
}

function badArgument(call: Call, index = 0): never {
  return fail(call.cursor, text.parse.badArgument(call.name), call.args[index]?.at ?? call.at);
}

function onlyArgument(call: Call): Argument {
  const [first] = call.args;
  return first !== undefined && call.args.length === 1 ? first : badArgument(call, 1);
}

/** The string an argument holds; `undefined` for a number or another value. */
function stringOf(argument: Argument | undefined): string | undefined {
  return argument?.kind === 'value' && typeof argument.value === 'string' ? argument.value : undefined;
}

/** The text of an argument that may be written as a number or as a string of one. */
function numericText(argument: Argument | undefined): string | undefined {
  return argument?.kind === 'number' ? argument.written : stringOf(argument)?.trim();
}

/** The value of an argument, a number read with its type. */
function valueOf(argument: Argument): Json {
  return argument.kind === 'number' ? numberValue(argument.written) : argument.value;
}

/** The whole number an argument holds, written as digits or as a string of digits. */
function wholeArgument(call: Call, index = 0): bigint {
  const written = numericText(call.args[index]);
  return (written === undefined ? undefined : wholeNumber(written)) ?? badArgument(call, index);
}

function objectIdHelper(call: Call): Json {
  if (call.args.length === 0) {
    return objectId(call.cursor.newId());
  }
  const hex = stringOf(onlyArgument(call));
  return hex !== undefined && /^[0-9a-fA-F]{24}$/u.test(hex) ? objectId(hex) : badArgument(call);
}

/** A date from the text JavaScript's `Date` reads; a date and time without an offset is in UTC, as mongosh reads it. */
export function dateOfText(written: string): JsonObject | undefined {
  const utc = /^\d{4}-\d{2}-\d{2}T[\d:.]+$/u.test(written) ? `${written}Z` : written;
  const time = new Date(utc).getTime();
  return Number.isNaN(time) ? undefined : dateValue(String(time));
}

function dateHelper(call: Call): Json {
  if (call.args.length === 0) {
    return dateValue(String(call.cursor.now));
  }
  const argument = onlyArgument(call);
  if (argument.kind === 'number') {
    const milliseconds = wholeArgument(call);
    return fitsInt(milliseconds, 64) ? dateValue(milliseconds.toString()) : badArgument(call);
  }
  const written = stringOf(argument);
  if (written === undefined) {
    return badArgument(call);
  }
  return dateOfText(written) ?? fail(call.cursor, text.parse.invalidDate(written), argument.at);
}

function longHelper(call: Call): Json {
  onlyArgument(call);
  const value = wholeArgument(call);
  return fitsInt(value, 64) ? int64(value.toString()) : badArgument(call);
}

function intHelper(call: Call): Json {
  onlyArgument(call);
  const value = wholeArgument(call);
  return fitsInt(value, 32) ? int32(Number(value)) : badArgument(call);
}

const decimalPattern = /^[+-]?(?:(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|NaN|Infinity)$/u;

function doubleHelper(call: Call): Json {
  const written = numericText(onlyArgument(call));
  return written !== undefined && decimalPattern.test(written)
    ? double(Number(written.replace(/^\+/u, '')))
    : badArgument(call);
}

function decimalHelper(call: Call): Json {
  const written = numericText(onlyArgument(call));
  return written !== undefined && decimalPattern.test(written) ? decimal(written) : badArgument(call);
}

/** A UUID from its 32 hexadecimal digits, with or without dashes, in any case; `undefined` when it is not one. */
export function uuidValue(written: string): JsonObject | undefined {
  const hex = written.replace(/-/gu, '');
  const bytes = /^[0-9a-fA-F]{32}$/u.test(hex) ? bytesOfHex(hex) : undefined;
  return bytes === undefined ? undefined : binary(bytes, 4);
}

function uuidHelper(call: Call): Json {
  const written = stringOf(onlyArgument(call));
  return (written === undefined ? undefined : uuidValue(written)) ?? badArgument(call);
}

/** `BinData(0, "…")` and `HexData(0, "…")`: a subtype from 0 to 255, and bytes read by `bytesOf`. */
function binaryHelper(bytesOf: (data: string) => Uint8Array | undefined): Helper {
  return (call) => {
    if (call.args.length !== 2) {
      return badArgument(call, call.args.length);
    }
    const subType = wholeArgument(call);
    const data = stringOf(call.args[1]);
    const bytes = data === undefined ? undefined : bytesOf(data);
    if (subType < 0n || subType > 255n) {
      return badArgument(call);
    }
    return bytes === undefined ? badArgument(call, 1) : binary(bytes, Number(subType));
  };
}

function md5Helper(call: Call): Json {
  const written = stringOf(onlyArgument(call));
  const bytes = written !== undefined && /^[0-9a-fA-F]{32}$/u.test(written) ? bytesOfHex(written) : undefined;
  return bytes === undefined ? badArgument(call) : binary(bytes, 5);
}

function timestampPart(call: Call, value: Json | undefined, index: number): number {
  const number = numberOf(value);
  return number !== undefined && Number.isInteger(number) && number >= 0 && number <= 4294967295
    ? number
    : badArgument(call, index);
}

function timestampHelper(call: Call): Json {
  const [first, second] = call.args;
  if (call.args.length === 1 && first?.kind === 'value' && isJsonObject(first.value)) {
    const fields = first.value;
    if (Object.keys(fields).length !== 2) {
      return badArgument(call);
    }
    return timestamp(timestampPart(call, fields['t'], 0), timestampPart(call, fields['i'], 0));
  }
  if (first === undefined || second === undefined || call.args.length !== 2) {
    return badArgument(call, call.args.length);
  }
  return timestamp(timestampPart(call, valueOf(first), 0), timestampPart(call, valueOf(second), 1));
}

function dbRefHelper(call: Call): Json {
  const [collection, id, database] = call.args;
  const name = stringOf(collection);
  if (name === undefined || id === undefined || call.args.length > 3) {
    return badArgument(call, name === undefined ? 0 : 3);
  }
  const db = stringOf(database);
  if (database !== undefined && db === undefined) {
    return badArgument(call, 2);
  }
  return { $ref: name, $id: valueOf(id), ...(db === undefined ? {} : { $db: db }) };
}

function codeHelper(call: Call): Json {
  const [code, scope] = call.args;
  const body = stringOf(code);
  if (body === undefined || call.args.length > 2) {
    return badArgument(call, body === undefined ? 0 : 2);
  }
  if (scope === undefined) {
    return { $code: body };
  }
  return scope.kind === 'value' && isJsonObject(scope.value)
    ? { $code: body, $scope: scope.value }
    : badArgument(call, 1);
}

function symbolHelper(call: Call): Json {
  const value = stringOf(onlyArgument(call));
  return value === undefined ? badArgument(call) : { $symbol: value };
}

function keyHelper(key: '$minKey' | '$maxKey'): Helper {
  return (call) => (call.args.length > 0 ? badArgument(call) : { [key]: 1 });
}

const helpers: Readonly<Record<string, Helper>> = {
  ObjectId: objectIdHelper,
  ISODate: dateHelper,
  Date: dateHelper,
  NumberLong: longHelper,
  Long: longHelper,
  NumberInt: intHelper,
  Int32: intHelper,
  Double: doubleHelper,
  NumberDecimal: decimalHelper,
  Decimal128: decimalHelper,
  UUID: uuidHelper,
  BinData: binaryHelper(bytesOfBase64),
  HexData: binaryHelper(bytesOfHex),
  MD5: md5Helper,
  Timestamp: timestampHelper,
  MinKey: keyHelper('$minKey'),
  MaxKey: keyHelper('$maxKey'),
  DBRef: dbRefHelper,
  Code: codeHelper,
  BSONSymbol: symbolHelper,
};

/** Whether a word is the name of a helper. */
export function isHelper(word: string): boolean {
  return Object.hasOwn(helpers, word);
}

/** Reads the arguments of a helper whose name was just read, and makes its value. */
export function callHelper(cursor: Cursor, name: string, at: number, readValue: ValueReader): Json {
  const helper = helpers[name];
  if (helper === undefined) {
    return fail(cursor, text.parse.unknownName(name), at);
  }
  return helper({ cursor, name, args: readArguments(cursor, readValue), at });
}
