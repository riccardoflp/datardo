/**
 * MongoDB values as canonical Extended JSON, the form they have in the window and in requests (architecture,
 * "Values"): which BSON type a value is, how each typed value is made, and how its parts are read back. `query.parse`
 * writes these values and `query.format` reads them. Meant to move to `src/shared/mongosh` when the areas are merged.
 */
import type { Json } from '../../../shared/engine-request';

/** A JSON object: a document, a sub-document, or the wrapper of a typed value (`{ $oid: "…" }`). */
export type JsonObject = { readonly [key: string]: Json };

/** The names MongoDB gives the BSON types (`$type`), as the table's tooltips and the builder write them. */
export type BsonType =
  | 'string'
  | 'int'
  | 'long'
  | 'double'
  | 'decimal'
  | 'bool'
  | 'null'
  | 'objectId'
  | 'date'
  | 'timestamp'
  | 'regex'
  | 'binData'
  | 'array'
  | 'object'
  | 'minKey'
  | 'maxKey'
  | 'undefined'
  | 'symbol'
  | 'javascript'
  | 'javascriptWithScope'
  | 'dbPointer';

/** Whether a value is a JSON object (not an array, not null). */
export function isJsonObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: Json | undefined): value is string {
  return typeof value === 'string';
}

/** The type a one-key wrapper stands for, when its key and the shape of its inner value say so. */
function singleWrapperType(key: string, inner: Json | undefined): BsonType | undefined {
  switch (key) {
    case '$oid':
      return isText(inner) ? 'objectId' : undefined;
    case '$numberInt':
      return isText(inner) ? 'int' : undefined;
    case '$numberLong':
      return isText(inner) ? 'long' : undefined;
    case '$numberDouble':
      return isText(inner) ? 'double' : undefined;
    case '$numberDecimal':
      return isText(inner) ? 'decimal' : undefined;
    case '$date':
      return isText(inner) || typeof inner === 'number' || isText(objectField(inner, '$numberLong'))
        ? 'date'
        : undefined;
    case '$binary':
      return isText(objectField(inner, 'base64')) && isText(objectField(inner, 'subType')) ? 'binData' : undefined;
    case '$uuid':
      return isText(inner) ? 'binData' : undefined;
    default:
      return otherWrapperType(key, inner);
  }
}

function otherWrapperType(key: string, inner: Json | undefined): BsonType | undefined {
  switch (key) {
    case '$regularExpression':
      return isText(objectField(inner, 'pattern')) ? 'regex' : undefined;
    case '$timestamp':
      return isJsonObject(inner) && 't' in inner && 'i' in inner ? 'timestamp' : undefined;
    case '$minKey':
      return inner === 1 ? 'minKey' : undefined;
    case '$maxKey':
      return inner === 1 ? 'maxKey' : undefined;
    case '$undefined':
      return inner === true ? 'undefined' : undefined;
    case '$symbol':
      return isText(inner) ? 'symbol' : undefined;
    case '$code':
      return isText(inner) ? 'javascript' : undefined;
    case '$dbPointer':
      return isJsonObject(inner) && '$ref' in inner ? 'dbPointer' : undefined;
    default:
      return undefined;
  }
}

/** The text of a string or a number of Extended JSON, `fallback` for anything else. */
export function textOfJson(value: Json | undefined, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  return typeof value === 'number' ? String(value) : fallback;
}

/** Whether a value of Extended JSON is an array. */
export function isJsonArray(value: Json | undefined): value is readonly Json[] {
  return Array.isArray(value);
}

/** A field of a value when the value is an object. */
export function objectField(value: Json | undefined, name: string): Json | undefined {
  return isJsonObject(value) ? value[name] : undefined;
}

/** The type of a wrapper of Extended JSON, or `undefined` for an object that is a document. */
export function wrapperType(value: JsonObject): BsonType | undefined {
  const keys = Object.keys(value);
  const [first] = keys;
  if (first === undefined) {
    return undefined;
  }
  if (keys.length === 2 && isText(value['$code']) && isJsonObject(value['$scope'])) {
    return 'javascriptWithScope';
  }
  return keys.length === 1 ? singleWrapperType(first, value[first]) : undefined;
}

/** Whether a value is a sub-document: an object that is not one typed value however it travels. */
export function isSubdocument(value: Json | undefined): value is JsonObject {
  return isJsonObject(value) && wrapperType(value) === undefined;
}

/** Whether a value is an object of query operators, `{ $gte: 1, $lt: 5 }`: every key starts with `$`. */
export function isOperatorObject(value: Json | undefined): value is JsonObject {
  if (!isSubdocument(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => key.startsWith('$')) && !('$ref' in value && '$id' in value);
}

/** The BSON type of a value; a plain JSON number is an `int` when whole and within 32 bits, a `double` otherwise. */
export function bsonType(value: Json): BsonType {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return 'string';
  }
  if (typeof value === 'boolean') {
    return 'bool';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) && Math.abs(value) <= 2147483647 ? 'int' : 'double';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return wrapperType(value as JsonObject) ?? 'object';
}

/** The text Extended JSON gives a double: `5.0`, `5.5`, `1e+21`, `-0.0`, `NaN`, `Infinity`, `-Infinity`. */
export function doubleText(value: number): string {
  if (Object.is(value, -0)) {
    return '-0.0';
  }
  const written = String(value);
  return Number.isInteger(value) && !written.includes('e') ? `${written}.0` : written;
}

/** An `Int32`. */
export function int32(value: number): JsonObject {
  return { $numberInt: String(value) };
}

/** An `Int64`, from its digits. */
export function int64(digits: string): JsonObject {
  return { $numberLong: digits };
}

/** A `Double`. */
export function double(value: number): JsonObject {
  return { $numberDouble: doubleText(value) };
}

/** A `Decimal128`, with its digits as written. */
export function decimal(digits: string): JsonObject {
  return { $numberDecimal: digits };
}

/** An `ObjectId`, from its 24 hexadecimal digits. */
export function objectId(hex: string): JsonObject {
  return { $oid: hex.toLowerCase() };
}

/** A date, from its milliseconds since 1970 as digits (which may be beyond what JavaScript's `Date` holds). */
export function dateValue(milliseconds: string): JsonObject {
  return { $date: { $numberLong: milliseconds } };
}

/** A `Binary` of a subtype, from its bytes. */
export function binary(bytes: Uint8Array, subType: number): JsonObject {
  return { $binary: { base64: base64OfBytes(bytes), subType: subType.toString(16).padStart(2, '0') } };
}

/** A regular expression. */
export function regex(pattern: string, options: string): JsonObject {
  return { $regularExpression: { pattern, options } };
}

/** A `Timestamp`. */
export function timestamp(seconds: number, increment: number): JsonObject {
  return { $timestamp: { t: seconds, i: increment } };
}

/** The milliseconds of a date wrapper, as digits; `undefined` when the value is not a date. */
export function dateMilliseconds(value: Json): string | undefined {
  const inner = objectField(value, '$date');
  if (isText(inner)) {
    const time = new Date(inner).getTime();
    return Number.isNaN(time) ? undefined : String(time);
  }
  if (typeof inner === 'number') {
    return String(Math.trunc(inner));
  }
  const digits = objectField(inner, '$numberLong');
  return isText(digits) ? digits : undefined;
}

/** The number a numeric value holds (`Int32`, `Int64`, `Double`, `Decimal128`, a plain number), or `undefined`. */
export function numberOf(value: Json | undefined): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (!isJsonObject(value)) {
    return undefined;
  }
  for (const key of ['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal']) {
    const inner = value[key];
    if (isText(inner) && Object.keys(value).length === 1) {
      return Number(inner);
    }
  }
  return undefined;
}

/** The bytes of base64 text; `undefined` when the text is not base64. */
export function bytesOfBase64(text: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(text) || text.length % 4 !== 0) {
    return undefined;
  }
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

/** The base64 text of bytes. */
export function base64OfBytes(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

/** The bytes of hexadecimal text; `undefined` when the text is not pairs of hexadecimal digits. */
export function bytesOfHex(text: string): Uint8Array | undefined {
  if (!/^(?:[0-9a-fA-F]{2})*$/u.test(text)) {
    return undefined;
  }
  return Uint8Array.from(text.match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16));
}

/** The hexadecimal text of bytes, in lower case. */
export function hexOfBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
