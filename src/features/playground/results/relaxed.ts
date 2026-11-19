/**
 * A value of canonical Extended JSON as relaxed Extended JSON, for **Copy as JSON** (`playground.results`): numbers
 * that JSON can hold exactly as plain numbers, dates between 1970 and 9999 as ISO text, every other type as it is.
 * Follows the relaxed format of MongoDB's Extended JSON v2 specification.
 */
import type { Json } from '../../../shared/engine-request';

type JsonObject = { readonly [key: string]: Json };

function isObject(value: Json): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function relaxedNumber(digits: Json | undefined, wrapper: string): Json {
  const number = typeof digits === 'string' ? Number(digits) : Number.NaN;
  if (!Number.isFinite(number) || (wrapper === '$numberLong' && !Number.isSafeInteger(number))) {
    return { [wrapper]: digits ?? null };
  }
  return Object.is(number, -0) ? { [wrapper]: digits ?? null } : number;
}

function relaxedDate(inner: Json | undefined): Json {
  const milliseconds = isObject(inner ?? null) ? (inner as JsonObject)['$numberLong'] : undefined;
  const time = typeof milliseconds === 'string' ? Number(milliseconds) : Number.NaN;
  const lastOf9999 = 253402300799999;
  if (!Number.isFinite(time) || time < 0 || time > lastOf9999) {
    return { $date: inner ?? null };
  }
  return { $date: new Date(time).toISOString() };
}

/** The value as relaxed Extended JSON. */
export function relaxedValue(value: Json): Json {
  if (Array.isArray(value)) {
    return (value as readonly Json[]).map(relaxedValue);
  }
  if (!isObject(value)) {
    return value;
  }
  const keys = Object.keys(value);
  const [first] = keys;
  if (keys.length === 1 && first !== undefined) {
    if (first === '$numberInt' || first === '$numberDouble' || first === '$numberLong') {
      return relaxedNumber(value[first], first);
    }
    if (first === '$date') {
      return relaxedDate(value[first]);
    }
    if (first.startsWith('$')) {
      return value;
    }
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relaxedValue(item)]));
}

/** The value as relaxed Extended JSON text, indented by two spaces. */
export function relaxedText(value: Json): string {
  return JSON.stringify(relaxedValue(value), null, 2);
}
