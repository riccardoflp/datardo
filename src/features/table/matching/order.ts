/**
 * The order of values as MongoDB compares them (`table.match`): the type brackets first, then the values within a
 * bracket. Numbers are compared across `Int32`, `Int64` and `Double` exactly, an `Int64` beyond 2⁵³ too; a `Decimal128`
 * as a JavaScript number. Strings by code point, which is the order of their UTF-8 bytes. Values are canonical
 * Extended JSON; a field that is not there is `missing`, equal to `null`.
 */
import type { Json } from '../../../shared/engine-request';
import {
  bsonType,
  bytesOfBase64,
  bytesOfHex,
  dateMilliseconds,
  isJsonArray,
  objectField,
  textOfJson,
  type BsonType,
  type JsonObject,
} from '../../query/mongosh/ejson';

/** A field that is not there. */
export const missing: unique symbol = Symbol('missing');

/** A value found at a path, or `missing`. */
export type Found = Json | typeof missing;

/** A number, exactly when it is whole (`Int32`, `Int64`, a whole JSON number), as a double otherwise. */
export type Numeric =
  { readonly whole: true; readonly value: bigint } | { readonly whole: false; readonly value: number };

/** The type of a found value; `undefined` for `missing`. */
export function typeOf(value: Found): BsonType | undefined {
  return value === missing ? undefined : bsonType(value);
}

/** The digits of an integer's text as a bigint; throws for a text that is not one (the predicate then fails). */
function wholeOf(text: string): bigint {
  if (!/^-?\d+$/u.test(text)) {
    throw new RangeError(`Not a whole number: ${text}`);
  }
  return BigInt(text);
}

/** The number a numeric value holds, or `undefined` when it is not a number. */
export function numericOf(value: Found): Numeric | undefined {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { whole: true, value: BigInt(value) } : { whole: false, value };
  }
  const type = typeOf(value);
  const written = type === undefined ? '' : textOfJson(Object.values(value as JsonObject)[0]);
  if (type === 'int' || type === 'long') {
    return { whole: true, value: wholeOf(written) };
  }
  return type === 'double' || type === 'decimal' ? { whole: false, value: Number(written) } : undefined;
}

function sign(difference: number | bigint): number {
  return difference < 0 ? -1 : difference > 0 ? 1 : 0;
}

/** Two doubles: `NaN` equals `NaN` and sorts before every other number. */
function compareDoubles(first: number, second: number): number {
  if (Number.isNaN(first) || Number.isNaN(second)) {
    return Number(Number.isNaN(second)) - Number(Number.isNaN(first));
  }
  return first < second ? -1 : first > second ? 1 : 0;
}

/** A whole number with a double, exactly: a double that is not whole lies between two integers. */
function compareWholeDouble(whole: bigint, double: number): number {
  if (Number.isNaN(double)) {
    return 1;
  }
  if (!Number.isFinite(double)) {
    return double > 0 ? -1 : 1;
  }
  if (Number.isInteger(double)) {
    return sign(whole - BigInt(double));
  }
  return whole <= BigInt(Math.floor(double)) ? -1 : 1;
}

/** Two numbers of any of the four types. */
export function compareNumerics(first: Numeric, second: Numeric): number {
  if (first.whole && second.whole) {
    return sign(first.value - second.value);
  }
  if (!first.whole && !second.whole) {
    return compareDoubles(first.value, second.value);
  }
  return first.whole
    ? compareWholeDouble(first.value, second.value as number)
    : -compareWholeDouble(second.value as bigint, first.value);
}

/** Strings by code point, as MongoDB compares them without a collation. */
export function compareStrings(first: string, second: string): number {
  let [left, right] = [0, 0];
  while (left < first.length && right < second.length) {
    const [leftPoint, rightPoint] = [first.codePointAt(left) ?? 0, second.codePointAt(right) ?? 0];
    if (leftPoint !== rightPoint) {
      return sign(leftPoint - rightPoint);
    }
    left += leftPoint > 0xffff ? 2 : 1;
    right += rightPoint > 0xffff ? 2 : 1;
  }
  // One of the two has ended: the other, if anything is left of it, is the greater.
  return sign(first.length - left - (second.length - right));
}

const brackets: Readonly<Record<BsonType, number>> = {
  minKey: 1,
  undefined: 2,
  null: 2,
  int: 3,
  long: 3,
  double: 3,
  decimal: 3,
  string: 4,
  symbol: 4,
  object: 5,
  array: 6,
  binData: 7,
  objectId: 8,
  bool: 9,
  date: 10,
  timestamp: 11,
  regex: 12,
  dbPointer: 13,
  javascript: 14,
  javascriptWithScope: 15,
  maxKey: 16,
};

/** Where a value sorts among the types; a missing field is with `null`. */
export function bracketOf(value: Found): number {
  const type = typeOf(value);
  return type === undefined ? brackets.null : brackets[type];
}

function textOf(value: Found): string {
  return typeof value === 'string' ? value : textOfJson(objectField(value as Json, '$symbol'));
}

/** The bytes of a binary, with its subtype: compared by length, then subtype, then bytes. */
function binaryKey(value: Json): readonly [number, number, string] {
  const uuid = objectField(value, '$uuid');
  if (typeof uuid === 'string') {
    const bytes = bytesOfHex(uuid.replace(/-/gu, '')) ?? new Uint8Array();
    return [bytes.length, 4, uuid.replace(/-/gu, '').toLowerCase()];
  }
  const inner = objectField(value, '$binary');
  const bytes = bytesOfBase64(textOfJson(objectField(inner, 'base64'))) ?? new Uint8Array();
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [bytes.length, Number.parseInt(textOfJson(objectField(inner, 'subType'), '0'), 16), hex];
}

function compareBinaries(first: Json, second: Json): number {
  const [left, right] = [binaryKey(first), binaryKey(second)];
  return sign(left[0] - right[0]) || sign(left[1] - right[1]) || compareStrings(left[2], right[2]);
}

function dateOf(value: Json): bigint {
  return wholeOf(dateMilliseconds(value) ?? '');
}

function compareTimestamps(first: Json, second: Json): number {
  const part = (value: Json, name: string): number => Number(objectField(objectField(value, '$timestamp'), name));
  return sign(part(first, 't') - part(second, 't')) || sign(part(first, 'i') - part(second, 'i'));
}

function compareRegexes(first: Json, second: Json): number {
  const part = (value: Json, name: string): string =>
    textOfJson(objectField(objectField(value, '$regularExpression'), name));
  return (
    compareStrings(part(first, 'pattern'), part(second, 'pattern')) ||
    compareStrings(part(first, 'options'), part(second, 'options'))
  );
}

/** Two sub-documents, field by field: the type of the values, then the names, then the values. */
function compareDocuments(first: JsonObject, second: JsonObject): number {
  const [left, right] = [Object.entries(first), Object.entries(second)];
  for (let at = 0; at < Math.min(left.length, right.length); at += 1) {
    const [[leftName, leftValue], [rightName, rightValue]] = [left[at] ?? ['', null], right[at] ?? ['', null]];
    const difference =
      sign(bracketOf(leftValue) - bracketOf(rightValue)) ||
      compareStrings(leftName, rightName) ||
      compareInOrder(leftValue, rightValue);
    if (difference !== 0) {
      return difference;
    }
  }
  return sign(left.length - right.length);
}

function compareArrays(first: readonly Json[], second: readonly Json[]): number {
  for (let at = 0; at < Math.min(first.length, second.length); at += 1) {
    const difference = compareInOrder(first[at] ?? null, second[at] ?? null);
    if (difference !== 0) {
      return difference;
    }
  }
  return sign(first.length - second.length);
}

/** `undefined` sorts before `null`, which a missing field equals. */
function compareNulls(first: Found, second: Found): number {
  return Number(typeOf(first) !== 'undefined') - Number(typeOf(second) !== 'undefined');
}

function compareObjects(bracket: number, first: Json, second: Json): number {
  switch (bracket) {
    case brackets.object:
      return compareDocuments(first as JsonObject, second as JsonObject);
    case brackets.array:
      return compareArrays(first as readonly Json[], second as readonly Json[]);
    case brackets.binData:
      return compareBinaries(first, second);
    case brackets.objectId:
      return compareStrings(
        textOfJson(objectField(first, '$oid')).toLowerCase(),
        textOfJson(objectField(second, '$oid')).toLowerCase(),
      );
    case brackets.date:
      return sign(dateOf(first) - dateOf(second));
    case brackets.timestamp:
      return compareTimestamps(first, second);
    case brackets.regex:
      return compareRegexes(first, second);
    default:
      return compareStrings(JSON.stringify(first), JSON.stringify(second));
  }
}

function compareWithin(bracket: number, first: Found, second: Found): number {
  switch (bracket) {
    case brackets.minKey:
    case brackets.maxKey:
      return 0;
    case brackets.null:
      return compareNulls(first, second);
    case brackets.int:
      return compareNumerics(numericOf(first) as Numeric, numericOf(second) as Numeric);
    case brackets.string:
      return compareStrings(textOf(first), textOf(second));
    case brackets.bool:
      return sign(Number(first) - Number(second));
    default:
      return compareObjects(bracket, first as Json, second as Json);
  }
}

/** The whole order, types first: for the fields of sub-documents and the elements of arrays. */
export function compareInOrder(first: Found, second: Found): number {
  const [left, right] = [bracketOf(first), bracketOf(second)];
  return left === right ? compareWithin(left, first, second) : sign(left - right);
}

/** -1, 0 or 1 for two values of the same type bracket; `undefined` for two others, which never compare. */
export function compareValues(first: Found, second: Found): number | undefined {
  const bracket = bracketOf(first);
  return bracket === bracketOf(second) ? compareWithin(bracket, first, second) : undefined;
}

/** Equal as `$eq`: the same bracket and value; numbers across their types; `null` and a missing field. */
export function equalValues(first: Found, second: Found): boolean {
  return compareValues(first, second) === 0;
}

/** Whether a found value is an array. */
export function isArrayFound(value: Found): value is readonly Json[] {
  return value !== missing && isJsonArray(value);
}
