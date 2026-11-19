/**
 * The helpers of mongosh syntax read as values (`ObjectId("…")`, `ISODate("…")`, `NumberLong(5)`, …), each turned into
 * its value as canonical Extended JSON. Part of the stand-in for `query.parse` (M9) that the pipeline editor needs
 * until the two are merged: the table of helpers is the card's.
 */
import type { Json } from '../../../shared/engine-request';

/**
 * What a helper needs besides its arguments: the current time and a maker of new ids (`query.parse`). Without them,
 * `ISODate()` and `ObjectId()` are not read, so that a text written again keeps them as they were typed.
 */
export interface Makers {
  /** The time, in milliseconds since 1970 (UTC). */
  readonly now?: number;
  /** A new id of 24 hexadecimal digits. */
  readonly newId?: () => string;
}

/** No time and no maker of ids: `ISODate()` and `ObjectId()` are not read. */
export const noMakers: Makers = {};

/** A helper that cannot be read: the message says why, the parser says where. */
export class HelperProblem extends Error {}

type JsonObject = { readonly [key: string]: Json };

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The digits of a number or of a text: `5` from `{ $numberInt: "5" }` and from `"5"`. */
function numberText(value: Json | undefined): string | undefined {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!isObject(value)) {
    return undefined;
  }
  const inner = value['$numberInt'] ?? value['$numberLong'] ?? value['$numberDouble'];
  return typeof inner === 'string' ? inner : undefined;
}

function text(value: Json | undefined, helper: string): string {
  if (typeof value !== 'string') {
    throw new HelperProblem(`${helper} needs a text in quotes`);
  }
  return value;
}

function wholeText(value: Json | undefined, helper: string): string {
  const digits = numberText(value);
  if (digits === undefined || !/^[-+]?\d+$/u.test(digits)) {
    throw new HelperProblem(`${helper} needs a whole number`);
  }
  return BigInt(digits).toString();
}

function hexOf(value: string, length: number, helper: string): string {
  const hex = value.replaceAll('-', '');
  if (hex.length !== length || !/^[0-9a-fA-F]*$/u.test(hex)) {
    throw new HelperProblem(`${helper} needs ${String(length)} hexadecimal digits`);
  }
  return hex.toLowerCase();
}

function base64OfHex(hex: string): string {
  const bytes = hex.match(/../gu) ?? [];
  return btoa(bytes.map((pair) => String.fromCharCode(parseInt(pair, 16))).join(''));
}

function binary(base64: string, subType: number): Json {
  return { $binary: { base64, subType: subType.toString(16).padStart(2, '0') } };
}

function subTypeOf(value: Json | undefined, helper: string): number {
  const subType = Number(wholeText(value, helper));
  if (subType < 0 || subType > 255) {
    throw new HelperProblem(`${helper} needs a subtype from 0 to 255`);
  }
  return subType;
}

/** The text of a Double as canonical Extended JSON writes it: `5.0`, `5.5`, `-0.0`, `Infinity`. */
export function doubleText(value: number): string {
  if (Object.is(value, -0)) {
    return '-0.0';
  }
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

/** A text without an offset is read as UTC, as mongosh reads it; JavaScript would read it in the local time. */
function utcText(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T[\d:.]+$/u.test(value.trim()) ? `${value.trim()}Z` : value;
}

/** A date as canonical Extended JSON, from milliseconds since 1970. */
export function dateValue(milliseconds: number): Json {
  return { $date: { $numberLong: String(Math.trunc(milliseconds)) } };
}

function date(args: readonly Json[], makers: Makers, helper: string): Json {
  const [first] = args;
  if (first === undefined) {
    if (makers.now === undefined) {
      throw new HelperProblem(`${helper}() needs the current time`);
    }
    return dateValue(makers.now);
  }
  if (typeof first === 'string') {
    const time = new Date(utcText(first)).getTime();
    if (Number.isNaN(time)) {
      throw new HelperProblem(`Invalid date: ${JSON.stringify(first)}`);
    }
    return dateValue(time);
  }
  return dateValue(Number(wholeText(first, helper)));
}

function decimal(value: Json | undefined): Json {
  const digits = numberText(value);
  if (digits === undefined || !/^([-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?|NaN|[-+]?Infinity)$/u.test(digits)) {
    throw new HelperProblem('NumberDecimal needs a number');
  }
  return { $numberDecimal: digits };
}

function double(value: Json | undefined): Json {
  const digits = numberText(value);
  const number = digits === undefined || digits === '' ? Number.NaN : Number(digits);
  if (Number.isNaN(number) && digits !== 'NaN') {
    throw new HelperProblem('Double needs a number');
  }
  return { $numberDouble: doubleText(number) };
}

function int32(value: Json | undefined): Json {
  const whole = Number(wholeText(value, 'NumberInt'));
  if (whole < -2147483648 || whole > 2147483647) {
    throw new HelperProblem('NumberInt needs a number from -2147483648 to 2147483647');
  }
  return { $numberInt: String(whole) };
}

function timestamp(args: readonly Json[]): Json {
  const [first, second] = args;
  const [t, i] = isObject(first) ? [first['t'], first['i']] : [first, second];
  return { $timestamp: { t: Number(wholeText(t, 'Timestamp')), i: Number(wholeText(i, 'Timestamp')) } };
}

function dbRef(args: readonly Json[]): Json {
  const [collection, id, database] = args;
  const reference: Record<string, Json> = { $ref: text(collection, 'DBRef'), $id: id ?? null };
  return database === undefined ? reference : { ...reference, $db: text(database, 'DBRef') };
}

function code(args: readonly Json[]): Json {
  const [source, scope] = args;
  return scope === undefined ? { $code: text(source, 'Code') } : { $code: text(source, 'Code'), $scope: scope };
}

function objectId(args: readonly Json[], makers: Makers): Json {
  const [first] = args;
  if (first !== undefined) {
    return { $oid: hexOf(text(first, 'ObjectId'), 24, 'ObjectId') };
  }
  if (makers.newId === undefined) {
    throw new HelperProblem('ObjectId() needs a new id');
  }
  return { $oid: makers.newId() };
}

type Helper = (args: readonly Json[], makers: Makers) => Json;

/** The helpers by name, as `query.parse` lists them. */
const helpers: Readonly<Record<string, Helper>> = {
  ObjectId: objectId,
  ISODate: (args, makers) => date(args, makers, 'ISODate'),
  Date: (args, makers) => date(args, makers, 'Date'),
  NumberLong: ([value]) => ({ $numberLong: wholeText(value, 'NumberLong') }),
  Long: ([value]) => ({ $numberLong: wholeText(value, 'Long') }),
  NumberInt: ([value]) => int32(value),
  Int32: ([value]) => int32(value),
  Double: ([value]) => double(value),
  NumberDecimal: ([value]) => decimal(value),
  Decimal128: ([value]) => decimal(value),
  UUID: ([value]) => binary(base64OfHex(hexOf(text(value, 'UUID'), 32, 'UUID')), 4),
  BinData: ([subType, data]) => binary(text(data, 'BinData'), subTypeOf(subType, 'BinData')),
  HexData: ([subType, data]) => binary(base64OfHex(text(data, 'HexData').toLowerCase()), subTypeOf(subType, 'HexData')),
  MD5: ([value]) => binary(base64OfHex(hexOf(text(value, 'MD5'), 32, 'MD5')), 5),
  Timestamp: (args) => timestamp(args),
  MinKey: () => ({ $minKey: 1 }),
  MaxKey: () => ({ $maxKey: 1 }),
  DBRef: (args) => dbRef(args),
  Code: (args) => code(args),
  BSONSymbol: ([value]) => ({ $symbol: text(value, 'BSONSymbol') }),
};

/** Whether a word names a helper; `new` may come only before `Date` and `ObjectId`. */
export function isHelper(name: string, afterNew: boolean): boolean {
  return afterNew ? name === 'Date' || name === 'ObjectId' : name in helpers && name !== 'Date';
}

/** The value of a helper, or a {@link HelperProblem}. */
export function helperValue(name: string, args: readonly Json[], makers: Makers): Json {
  const helper = helpers[name];
  if (helper === undefined) {
    throw new HelperProblem(`${name} is not a helper of mongosh syntax`);
  }
  return helper(args, makers);
}
