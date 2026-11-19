/**
 * Values of canonical Extended JSON written for the copy formats (`table.copy-text`): the Extended JSON that reads back
 * with every type and stays readable, and plain JSON for tools that know nothing of BSON.
 */
import type { Json } from '../../../shared/engine-request';
import { formattedValue } from '../../query/format';
import {
  bsonType,
  dateMilliseconds,
  isSubdocument,
  objectField,
  textOfJson,
  type JsonObject,
} from '../../query/mongosh/ejson';

/** The last millisecond of the year 9999, after which a date keeps its canonical form. */
const endOf9999 = 253_402_300_799_999;

/** A date written plainly, which YAML writes as a timestamp without quotes. */
export class PlainDate {
  constructor(readonly date: string) {}
}

/** A value of plain JSON, or a date the YAML writer leaves unquoted. */
export type Plain = null | boolean | number | string | PlainDate | readonly Plain[] | { readonly [key: string]: Plain };

/** The ISO text of a date, or `undefined` for one JavaScript cannot hold. */
export function isoOfDate(value: Json): string | undefined {
  const milliseconds = dateMilliseconds(value);
  if (milliseconds === undefined) {
    return undefined;
  }
  const date = new Date(Number(milliseconds));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function mapped<T>(value: Json, each: (inner: Json) => T): T[] | Record<string, T> | undefined {
  if (Array.isArray(value)) {
    return (value as readonly Json[]).map(each);
  }
  if (isSubdocument(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, each(inner)]));
  }
  return undefined;
}

/**
 * A value as the Extended JSON a copy writes: a string, a boolean, null, an `Int32` and a `Double` with a fraction
 * plainly, a date from 1970 to 9999 as `{ "$date": "<ISO>" }`, every other value in its canonical form.
 */
export function copiedExtendedJson(value: Json): Json {
  const inner = mapped(value, copiedExtendedJson);
  if (inner !== undefined) {
    return inner;
  }
  const type = bsonType(value);
  if (type === 'int' && typeof value !== 'number') {
    return Number(objectField(value, '$numberInt'));
  }
  if (type === 'double' && typeof value !== 'number') {
    const number = Number(objectField(value, '$numberDouble'));
    return Number.isFinite(number) && !Number.isInteger(number) ? number : value;
  }
  if (type === 'date') {
    const milliseconds = Number(dateMilliseconds(value));
    const iso = isoOfDate(value);
    return iso !== undefined && milliseconds >= 0 && milliseconds <= endOf9999 ? { $date: iso } : value;
  }
  return value;
}

function numberOrText(written: string): number | string {
  const number = Number(written);
  return Number.isFinite(number) && String(number) === written ? number : written;
}

function binaryPlain(value: JsonObject): string {
  // UUID("…") gives the UUID, BinData(0, "…") the base64.
  return formattedValue(value)
    .replace(/^UUID\("(.*)"\)$/, '$1')
    .replace(/^BinData\(\d+, "(.*)"\)$/, '$1');
}

function wrapperPlain(value: JsonObject, keepDates: boolean): Plain {
  switch (bsonType(value)) {
    case 'objectId':
      return textOfJson(value['$oid']);
    case 'int':
    case 'long':
    case 'decimal':
      return numberOrText(textOfJson(Object.values(value)[0]));
    case 'double': {
      const number = Number(value['$numberDouble']);
      return Number.isFinite(number) ? number : textOfJson(value['$numberDouble']);
    }
    case 'date': {
      const iso = isoOfDate(value) ?? String(dateMilliseconds(value));
      return keepDates ? new PlainDate(iso) : iso;
    }
    case 'binData':
      return binaryPlain(value);
    case 'regex':
      return formattedValue(value);
    case 'timestamp': {
      const inner = value['$timestamp'];
      return { t: Number(objectField(inner, 't')), i: Number(objectField(inner, 'i')) };
    }
    case 'minKey':
      return 'MinKey';
    case 'maxKey':
      return 'MaxKey';
    case 'undefined':
      return null;
    case 'symbol':
      return textOfJson(value['$symbol']);
    case 'javascript':
    case 'javascriptWithScope':
      return textOfJson(value['$code']);
    case 'array':
    case 'bool':
    case 'dbPointer':
    case 'null':
    case 'object':
    case 'string':
      return formattedValue(value);
  }
}

/**
 * A value as plain JSON: ids, UUIDs and dates as their text (dates as markers for YAML with `keepDates`), an `Int64`
 * or a `Decimal128` as a number when one holds it exactly as written, a `Binary` as its base64, a regular expression
 * as `"/^a/i"`, `MinKey` and `MaxKey` as their names, undefined as null.
 */
export function plainValue(value: Json, keepDates = false): Plain {
  const inner = mapped(value, (each) => plainValue(each, keepDates));
  if (inner !== undefined) {
    return inner;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return wrapperPlain(value as JsonObject, keepDates);
}
