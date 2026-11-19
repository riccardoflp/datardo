/**
 * How the Monitor page and the Index advisor read the replies of MongoDB: canonical Extended JSON from the engine
 * (`{ $numberInt: "7" }`, `{ $date: { $numberLong: "…" } }`), and relaxed Extended JSON from the lines of the server
 * log (`7`, `{ $date: "2026-11-17T13:02:11.000Z" }`). Every reader takes both, so that one rule reads a profiler
 * document and a log line alike.
 */
import type { Json } from '../../../shared/engine-request';

/** A JSON object, as a reader of replies sees it. */
export type JsonRecord = Readonly<Record<string, Json>>;

/** Whether a value is an object (not an array, not null). */
export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array);
}

/** The object a value is, or an empty one. */
export function recordOf(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

/** The list a value is, or an empty one. */
export function listOf(value: unknown): readonly Json[] {
  return Array.isArray(value) ? (value as readonly Json[]) : [];
}

/** The keys of canonical Extended JSON that wrap a value of a BSON type. */
const wrapperKeys = new Set([
  '$oid',
  '$date',
  '$numberInt',
  '$numberLong',
  '$numberDouble',
  '$numberDecimal',
  '$binary',
  '$regularExpression',
  '$timestamp',
  '$minKey',
  '$maxKey',
  '$symbol',
  '$code',
  '$dbPointer',
  '$undefined',
  '$uuid',
  '$regex',
]);

/** Whether a value is a value of a BSON type written as Extended JSON, not a document: `{ $oid: "…" }`. */
export function isTypedValue(value: unknown): value is JsonRecord {
  if (!isRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  const [first] = keys;
  if (keys.length === 2 && '$code' in value && '$scope' in value) {
    return true;
  }
  if (keys.length === 2 && '$regex' in value && '$options' in value) {
    return true;
  }
  return keys.length === 1 && first !== undefined && wrapperKeys.has(first);
}

/** Whether a value is a regular expression, in either form of Extended JSON. */
export function isRegularExpression(value: unknown): boolean {
  return isTypedValue(value) && ('$regularExpression' in value || '$regex' in value);
}

/** A number, from a plain number or a number of Extended JSON (`Int32`, `Long`, `Double`, `Decimal128`). */
export function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const written = value['$numberInt'] ?? value['$numberLong'] ?? value['$numberDouble'] ?? value['$numberDecimal'];
  if (typeof written !== 'string') {
    return undefined;
  }
  const number = Number(written);
  return Number.isFinite(number) ? number : undefined;
}

/** A text, or `undefined`. */
export function textOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** A field of an object as text, or `undefined`. */
export function textField(value: unknown, name: string): string | undefined {
  return textOf(recordOf(value)[name]);
}

/** A field of an object as a number, or `undefined`. */
export function numberField(value: unknown, name: string): number | undefined {
  return numberOf(recordOf(value)[name]);
}

/** An instant in milliseconds since 1970, from a date of Extended JSON, an ISO text or a number of milliseconds. */
export function dateOf(value: unknown): number | undefined {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  if (!isRecord(value) || !('$date' in value)) {
    return undefined;
  }
  const inner = value['$date'];
  return typeof inner === 'string' ? dateOf(inner) : numberOf(inner);
}

/** The two numbers of a timestamp of Extended JSON: `Timestamp(1763366400, 3)` is `{ t: 1763366400, i: 3 }`. */
export interface TimestampParts {
  readonly t: number;
  readonly i: number;
}

/** The seconds and the increment of a timestamp, or `undefined`. */
export function timestampOf(value: unknown): TimestampParts | undefined {
  const inner = recordOf(value)['$timestamp'];
  const t = numberField(inner, 't');
  const i = numberField(inner, 'i');
  return t === undefined || i === undefined ? undefined : { t, i };
}

/** A whole number of canonical Extended JSON: `{ $numberInt: "1" }`, or a `Long` beyond the range of an Int32. */
export function int(value: number): Json {
  const whole = Math.trunc(value);
  return Math.abs(whole) <= 2_147_483_647 ? { $numberInt: String(whole) } : { $numberLong: String(whole) };
}

/** A date of canonical Extended JSON. */
export function date(milliseconds: number): Json {
  return { $date: { $numberLong: String(Math.trunc(milliseconds)) } };
}

/** A value with the numbers of Extended JSON written as plain numbers: how index keys and sorts are compared. */
export function plainNumbers(value: Json): Json {
  const number = isTypedValue(value) ? numberOf(value) : undefined;
  if (number !== undefined) {
    return number;
  }
  if (Array.isArray(value)) {
    return (value as readonly Json[]).map(plainNumbers);
  }
  if (isRecord(value) && !isTypedValue(value)) {
    const entries = Object.entries<Json>(value);
    return Object.fromEntries(entries.map(([key, item]) => [key, plainNumbers(item)]));
  }
  return value;
}

/** Whether two values are the same JSON, field order included. */
export function sameJson(one: unknown, other: unknown): boolean {
  return JSON.stringify(one ?? null) === JSON.stringify(other ?? null);
}
