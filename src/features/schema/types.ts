/**
 * What the schema area decides from and gives: the BSON types of values given as canonical Extended JSON, and the
 * summary of a sample (`schema.analyze`): its fields, their types, their values and ranges, their nested fields.
 */
import type { Json } from '../../shared/engine-request';

/** The BSON types an analysis tells apart, by the names `$type` takes. */
export type BsonType =
  | 'string'
  | 'int'
  | 'double'
  | 'long'
  | 'decimal'
  | 'bool'
  | 'date'
  | 'objectId'
  | 'null'
  | 'object'
  | 'array'
  | 'binData'
  | 'regex'
  | 'timestamp'
  | 'javascript'
  | 'symbol'
  | 'minKey'
  | 'maxKey'
  | 'undefined'
  | 'dbPointer';

/** A document of Extended JSON. */
export type JsonDocument = { readonly [key: string]: Json };

/** Whether a value is a document of Extended JSON (not an array, not null). */
export function isJsonDocument(value: Json | undefined): value is JsonDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const wrapperTypes: Readonly<Record<string, BsonType>> = {
  $oid: 'objectId',
  $date: 'date',
  $numberInt: 'int',
  $numberDouble: 'double',
  $numberLong: 'long',
  $numberDecimal: 'decimal',
  $binary: 'binData',
  $uuid: 'binData',
  $regularExpression: 'regex',
  $timestamp: 'timestamp',
  $code: 'javascript',
  $symbol: 'symbol',
  $minKey: 'minKey',
  $maxKey: 'maxKey',
  $undefined: 'undefined',
  $dbPointer: 'dbPointer',
};

/** The key of a value of a BSON type in Extended JSON (`$date`, `$oid`), or `undefined` for any other value. */
export function wrapperKey(value: Json | undefined): string | undefined {
  if (!isJsonDocument(value)) {
    return undefined;
  }
  const keys = Object.keys(value);
  const [first] = keys;
  return first !== undefined && first in wrapperTypes && (keys.length === 1 || first === '$code') ? first : undefined;
}

/** The BSON type of a value of canonical Extended JSON; a number of plain JSON is an `int` when whole. */
export function bsonTypeOf(value: Json | undefined): BsonType {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'string') {
    return 'string';
  }
  if (typeof value === 'boolean') {
    return 'bool';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'int' : 'double';
  }
  const key = wrapperKey(value);
  return key === undefined ? 'object' : (wrapperTypes[key] ?? 'object');
}

/** The types whose distinct values are counted. */
export const valueTypes: ReadonlySet<BsonType> = new Set([
  'string',
  'int',
  'double',
  'long',
  'decimal',
  'bool',
  'date',
  'objectId',
]);

/** The number types. */
export const numberTypes: ReadonlySet<BsonType> = new Set(['int', 'double', 'long', 'decimal']);

/** A number or a date as a number of JavaScript (a date as its milliseconds); `undefined` for any other value. */
export function numberOfValue(value: Json, type: BsonType): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (!isJsonDocument(value)) {
    return undefined;
  }
  if (numberTypes.has(type)) {
    return Number(Object.values(value)[0]);
  }
  if (type !== 'date') {
    return undefined;
  }
  const inner = value['$date'];
  if (typeof inner === 'string') {
    return Date.parse(inner);
  }
  return isJsonDocument(inner) ? Number(inner['$numberLong']) : Number(inner);
}

/** A value and how many times it was seen. The value is canonical Extended JSON, its type kept. */
export interface ValueCount {
  readonly value: Json;
  readonly count: number;
}

/** A range of a histogram: `from` included, `to` excluded, as values of the type (a date is a date). */
export interface ValueRange {
  readonly from: Json;
  readonly to: Json;
  readonly count: number;
}

/** What a type has beyond what the Schema section shows, asked by `transfer.generate`. */
export interface TypeDetails {
  /** Every distinct value with its count, the most frequent first, when there are at most 200 in 50,000 characters. */
  readonly values?: readonly ValueCount[];
  /** Strings: their length in characters. */
  readonly characters?: { readonly smallest: number; readonly largest: number; readonly average: number };
  /** `double` and `decimal`: the most digits after the decimal point, at most 15. */
  readonly decimals?: number;
  /** Dates: whether all are at midnight UTC. */
  readonly midnight?: boolean;
  /** Arrays: the 20 most frequent lengths with their counts. */
  readonly lengths?: readonly ValueCount[];
  /** The other types: the first value seen, a binary value cut to 256 characters of base64. */
  readonly example?: Json;
}

/** One type of a field: how many values have it, and what is known of them. */
export interface TypeSummary {
  readonly type: BsonType;
  readonly count: number;
  /** The distinct values counted, at most 1,000. */
  readonly distinct?: number;
  /** Whether values were seen after the thousandth distinct one, and not counted. */
  readonly more?: boolean;
  /** Numbers and dates: the smallest and the largest value, `NaN` apart. */
  readonly smallest?: Json;
  readonly largest?: Json;
  /** Numbers and dates with more than 10 distinct values: the ranges of `schema.histogram`. */
  readonly ranges?: readonly ValueRange[];
  /** The other value types: the 10 most frequent values, the most frequent first. */
  readonly values?: readonly ValueCount[];
  /** Arrays: the smallest, the largest and the average length, to one decimal. */
  readonly lengths?: { readonly smallest: number; readonly largest: number; readonly average: number };
  /** Arrays: their elements, described as one field named `[]`. */
  readonly elements?: FieldSummary;
  /** Only when asked with details. */
  readonly details?: TypeDetails;
}

/** One field of the sample, or of the object values of a field. */
export interface FieldSummary {
  readonly name: string;
  /** The path a filter uses: `items.sku`; the elements of an array have the path of the array. */
  readonly path: string;
  /** The path as shown, with `[]` after each array: `items[].sku`. */
  readonly label: string;
  /** The values present, `null` included. */
  readonly count: number;
  /** The objects that could have it: the documents, for a field of the documents. */
  readonly of: number;
  /** The most frequent first; with the same count, the first seen first. */
  readonly types: readonly TypeSummary[];
  /** The fields of its object values. */
  readonly fields?: readonly FieldSummary[];
  /** Whether its objects had more than 500 different names, the others skipped. */
  readonly moreFields?: boolean;
}

/** What `schema.analyze` gives: the number of documents analyzed and their fields. */
export interface SchemaSummary {
  readonly analyzed: number;
  readonly fields: readonly FieldSummary[];
  /** Whether the documents had more than 500 different names, the others skipped. */
  readonly moreFields?: boolean;
}

/** The fields shown under a field: those of its object values, then those of the objects in its arrays. */
export function nestedFields(field: FieldSummary): readonly FieldSummary[] {
  return [...(field.fields ?? []), ...field.types.flatMap((type) => type.elements?.fields ?? [])];
}
