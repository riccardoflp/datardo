/**
 * Relaxed Extended JSON made canonical, as `EJSON.deserialize` then `EJSON.serialize` in canonical mode would: a plain
 * whole number is an `Int32` (an `Int64` beyond 32 bits), another plain number a `Double`, a date written as ISO text
 * is a `$date` of `$numberLong` milliseconds, a `$uuid` is a binary of subtype 4. Every wrapper already canonical
 * stays as it is, so that canonical and relaxed Extended JSON keep their types.
 */
import type { Json } from '../../../shared/engine-request';
import { importText } from '../text';
import { isPlainObject, isWrapper } from '../types';

/** How deep a document may nest: MongoDB's own limit, 100 levels (R14.4). */
export const mostNesting = 100;

const smallestInt64 = -(2n ** 63n);
const largestInt64 = 2n ** 63n - 1n;

/** The text of a `Double` in canonical Extended JSON: `42.0`, `1.5`, `-0.0`, `NaN`, `Infinity`. */
export function doubleText(value: number): string {
  if (Object.is(value, -0)) {
    return '-0.0';
  }
  return Number.isInteger(value) && Math.abs(value) < 1e21 ? value.toFixed(1) : String(value);
}

/** A plain number as canonical Extended JSON. */
export function numberValue(value: number): Json {
  if (!Number.isInteger(value)) {
    return { $numberDouble: doubleText(value) };
  }
  if (value >= -(2 ** 31) && value < 2 ** 31) {
    return { $numberInt: String(value) };
  }
  const whole = BigInt(value);
  return whole >= smallestInt64 && whole <= largestInt64
    ? { $numberLong: whole.toString() }
    : { $numberDouble: doubleText(value) };
}

/** ISO text as milliseconds, read in UTC when it has no zone, as mongosh reads it; `undefined` when it is not a date. */
export function isoMilliseconds(text: string): number | undefined {
  const zoned = /T[\d:.]+$/u.test(text) ? `${text}Z` : text;
  const milliseconds = Date.parse(zoned);
  return Number.isNaN(milliseconds) ? undefined : milliseconds;
}

function base64OfHex(hex: string): string {
  const pairs = hex.match(/[0-9a-fA-F]{2}/gu) ?? [];
  return btoa(pairs.map((pair) => String.fromCharCode(parseInt(pair, 16))).join(''));
}

/** A type wrapper made canonical. */
function canonicalWrapper(wrapper: Readonly<Record<string, unknown>>): Json {
  const [key, inner] = Object.entries(wrapper)[0] ?? ['', null];
  if (key === '$date') {
    const milliseconds =
      typeof inner === 'string' ? isoMilliseconds(inner) : typeof inner === 'number' ? inner : undefined;
    if (milliseconds === undefined) {
      if (typeof inner === 'string') {
        throw new Error(`Invalid date ${inner}`);
      }
      return wrapper as Json;
    }
    return { $date: { $numberLong: String(Math.trunc(milliseconds)) } };
  }
  if (key === '$uuid' && typeof inner === 'string') {
    return { $binary: { base64: base64OfHex(inner.replaceAll('-', '')), subType: '04' } };
  }
  return wrapper as Json;
}

/** A value of relaxed Extended JSON as canonical Extended JSON; nested deeper than {@link mostNesting} fails. */
export function canonical(value: unknown, depth = 0): Json {
  if (depth > mostNesting) {
    throw new Error(importText.tooDeep(mostNesting));
  }
  if (typeof value === 'number') {
    return numberValue(value);
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => canonical(item, depth + 1));
  }
  if (isWrapper(value)) {
    return canonicalWrapper(value);
  }
  if (isPlainObject(value)) {
    const document: Record<string, Json> = {};
    for (const [key, item] of Object.entries(value)) {
      Object.defineProperty(document, key, { value: canonical(item, depth + 1), enumerable: true, writable: true });
    }
    return document;
  }
  return typeof value === 'string' || typeof value === 'boolean' || value === null ? value : null;
}
