/**
 * Feature: compare.equality
 *
 * When two documents with the same `_id` are identical: the text `comparable` gives is the same exactly when they
 * compare equal under **Ignore**, **Ignore field order** and **Compare numbers by value**; `compare.read` hashes it
 * with SHA-1, one hash per `_id`. Every other BSON type is compared with its type: the string `"1"` is never the
 * number `1`, a date never its number of milliseconds, a `Decimal128` never another type of number.
 */
import type { Json } from '../../shared/engine-request';
import { wrapperType, type BsonType, type JsonObject } from '../query/mongosh/ejson';
import type { EqualityOptions } from './types';

/** The paths **Ignore** names: split on commas, spaces and new lines, without blanks or duplicates, in their order. */
export function ignoredPaths(text: string): readonly string[] {
  return [...new Set(text.split(/[\s,]+/u).filter((path) => path !== ''))];
}

/** The path of a field under `path`: the path of the fields of array elements has no index (`items.price`). */
export function childPath(path: string, name: string): string {
  return path === '' ? name : `${path}.${name}`;
}

const numberTypes: ReadonlySet<BsonType | undefined> = new Set(['int', 'long', 'double']);

/**
 * The value of an `Int32`, an `Int64` or a `Double` as text that is the same for equal values of the three types:
 * longs exactly beyond the 53 bits of a double, `-0` as `0`, `NaN` as itself, the two infinities apart.
 */
function numberKey(type: BsonType, written: string): string {
  if (type === 'long') {
    return /^-?\d+$/u.test(written) ? BigInt(written).toString() : written;
  }
  const value = Number(written);
  if (Number.isNaN(value)) {
    return 'NaN';
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? 'Infinity' : '-Infinity';
  }
  return Number.isInteger(value) ? BigInt(value).toString() : String(value);
}

function typedText(value: JsonObject, type: BsonType, options: EqualityOptions): string {
  if (options.numbersByValue && numberTypes.has(type)) {
    const written = Object.values(value)[0];
    return `{"$number":${JSON.stringify(numberKey(type, typeof written === 'string' ? written : ''))}}`;
  }
  return JSON.stringify(value);
}

function byName(first: readonly [string, Json], second: readonly [string, Json]): number {
  return first[0] < second[0] ? -1 : first[0] > second[0] ? 1 : 0;
}

function documentText(value: JsonObject, options: EqualityOptions, path: string): string {
  const kept = Object.entries(value).filter(([name]) => !options.ignore.includes(childPath(path, name)));
  const entries = options.ignoreOrder ? [...kept].sort(byName) : kept;
  const fields = entries.map(
    ([name, item]) => `${JSON.stringify(name)}:${comparedText(item, options, childPath(path, name))}`,
  );
  return `{${fields.join(',')}}`;
}

/**
 * The text of a value as it is compared, at `path` of its document: the fields **Ignore** names left out, numbers by
 * value and fields sorted by name as the options say. Two values compare equal when their texts are the same.
 */
export function comparedText(value: Json, options: EqualityOptions, path: string): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${(value as readonly Json[]).map((item) => comparedText(item, options, path)).join(',')}]`;
  }
  const object = value as JsonObject;
  const type = wrapperType(object);
  return type === undefined ? documentText(object, options, path) : typedText(object, type, options);
}

/** Feature: compare.equality — the text that is the same exactly when two documents compare equal. */
export function comparable(document: Json, options: EqualityOptions): string {
  return comparedText(document, options, '');
}
