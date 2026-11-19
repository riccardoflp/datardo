/**
 * The schema analysis that generated documents imitate, as `schema.analyze` gives it (with details or without): values
 * in it (top values, minimum, maximum, bins) are relaxed Extended JSON, as in Mongoster's `src/shared/schema.ts`. Until
 * that card is in the code these types are its contract here, and must stay the same as its output.
 */
import type { Json } from '../../../shared/engine-request';
import { doubleText, isoMilliseconds } from '../values/canonical';
import { isPlainObject } from '../types';

/** The BSON types of `schema.analyze`. */
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

/** A value seen, with how many times. */
export interface ValueCount {
  readonly value: unknown;
  readonly count: number;
}

/** A bin of a histogram of numbers or dates. */
export interface Bin {
  readonly from: unknown;
  readonly to: unknown;
  readonly count: number;
}

/** What the details of an analysis add to a type. */
export interface TypeDetails {
  /** Every value seen, when they are few. */
  readonly values?: readonly ValueCount[];
  readonly chars?: { readonly min: number; readonly max: number; readonly avg: number };
  /** The most decimals of the numbers seen. */
  readonly decimals?: number;
  /** Every date seen was at UTC midnight. */
  readonly dateOnly?: boolean;
  /** The lengths of the arrays seen, with how many times. */
  readonly lengths?: readonly ValueCount[];
  readonly example?: unknown;
}

/** One type of a field. */
export interface TypeSchema {
  readonly type: BsonType;
  readonly count: number;
  readonly top?: readonly ValueCount[];
  readonly distinct?: number;
  readonly distinctCapped?: boolean;
  readonly min?: unknown;
  readonly max?: unknown;
  readonly bins?: readonly Bin[];
  readonly lengths?: { readonly min: number; readonly max: number; readonly avg: number };
  readonly elements?: FieldSchema;
  readonly details?: TypeDetails;
}

/** A field: in how many of how many documents it is, its types, its fields. */
export interface FieldSchema {
  readonly name: string;
  readonly path?: string;
  readonly label?: string;
  readonly count: number;
  readonly of: number;
  readonly types: readonly TypeSchema[];
  readonly fields?: readonly FieldSchema[];
}

/** An analysis: how many documents, and their fields. */
export interface SchemaSummary {
  readonly sampled: number;
  readonly fields: readonly FieldSchema[];
}

/** The most decimals of a `Double` that are kept as seen (Mongoster's `MAX_DECIMALS`). */
export const mostDecimals = 15;

/** Every value of the type, with its count: from the details, or the top values when they are all of them. */
export function poolOf(type: TypeSchema): readonly ValueCount[] | undefined {
  if (type.details?.values !== undefined) {
    return type.details.values;
  }
  const top = type.top;
  return top !== undefined && type.distinctCapped !== true && type.distinct === top.length ? top : undefined;
}

/** A number or a date (in milliseconds) of the analysis, as a number. */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  const date = value['$date'];
  if (date !== undefined) {
    if (isPlainObject(date)) {
      return Number(date['$numberLong']);
    }
    return typeof date === 'string' ? isoMilliseconds(date) : Number(date);
  }
  const number = Number(Object.values(value)[0]);
  return Number.isNaN(number) ? undefined : number;
}

/** A value of the analysis (relaxed Extended JSON) as canonical Extended JSON of its BSON type. */
export function canonicalOf(value: unknown, type: BsonType): Json {
  if (isPlainObject(value)) {
    const date = value['$date'];
    if (type === 'date' && typeof date === 'string') {
      return { $date: { $numberLong: String(isoMilliseconds(date) ?? 0) } };
    }
    return value as Json;
  }
  if (typeof value !== 'number') {
    return value as Json;
  }
  const wrapped: Partial<Record<BsonType, Json>> = {
    int: { $numberInt: String(value) },
    long: { $numberLong: String(value) },
    decimal: { $numberDecimal: String(value) },
    double: { $numberDouble: doubleText(value) },
  };
  return wrapped[type] ?? value;
}

/** Whether a value is an analysis: `sampled` and `fields`. */
export function isSchemaSummary(value: unknown): value is SchemaSummary {
  return isPlainObject(value) && typeof value['sampled'] === 'number' && Array.isArray(value['fields']);
}
