/**
 * Writes a value, given as canonical Extended JSON, as mongosh syntax that `query.parse` reads back with the
 * same type: `5` an `Int32`, `Double(5)` a `Double`, `NumberLong(5)` an `Int64`, `NumberDecimal("5")` a `Decimal128`.
 *
 * This is the stand-in for `query.format` (M9) that the pipeline editor needs, with the card's function
 * `formattedValue(value, layout)` and its layouts **one line**, **filter** and **pretty**, until the two are merged. The pretty
 * layout is Mongoster's `prettyShell`: a value stays on one line when it fits the width from the indentation of its
 * line, which is what the texts of the aggregate cards show.
 */
import type { Json } from '../../../shared/engine-request';

/** How a value is laid out: on one line, or pretty within a width from an indentation of `level` × 2 spaces. */
export type Layout =
  | { readonly kind: 'one-line' }
  | { readonly kind: 'filter' }
  | { readonly kind: 'pretty'; readonly width: number; readonly level?: number };

/** The longest filter that stays on one line in the **filter** layout. */
export const filterWidth = 70;

type JsonObject = { readonly [key: string]: Json };

/** The width of the pretty layout unless the caller gives another (`query.format`). */
export const prettyWidth = 76;

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A key without quotes when it is an identifier, otherwise in double quotes. */
export function keyText(key: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(key) ? key : JSON.stringify(key);
}

function hexOfBase64(base64: string): string {
  return Array.from(atob(base64), (character) => character.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

function doubleValueText(digits: string): string {
  const number = Number(digits);
  if (Number.isNaN(number) || !Number.isFinite(number)) {
    return String(number);
  }
  if (Object.is(number, -0)) {
    return 'Double(-0)';
  }
  return Number.isInteger(number) ? `Double(${String(number)})` : String(number);
}

function longText(digits: string): string {
  return Number.isSafeInteger(Number(digits)) ? `NumberLong(${digits})` : `NumberLong(${JSON.stringify(digits)})`;
}

function dateText(inner: Json): string | undefined {
  const milliseconds = isObject(inner) ? inner['$numberLong'] : undefined;
  if (typeof milliseconds !== 'string') {
    return undefined;
  }
  const date = new Date(Number(milliseconds));
  return Number.isNaN(date.getTime()) ? `new Date(${milliseconds})` : `ISODate(${JSON.stringify(date.toISOString())})`;
}

function binaryText(inner: Json): string | undefined {
  if (!isObject(inner) || typeof inner['base64'] !== 'string' || typeof inner['subType'] !== 'string') {
    return undefined;
  }
  const subType = parseInt(inner['subType'], 16);
  const hex = subType === 3 || subType === 4 ? hexOfBase64(inner['base64']) : '';
  if (hex.length === 32) {
    const parts = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)];
    return `UUID("${parts.join('-')}")`;
  }
  return `BinData(${String(subType)}, ${JSON.stringify(inner['base64'])})`;
}

function regexText(inner: Json): string | undefined {
  if (!isObject(inner) || typeof inner['pattern'] !== 'string') {
    return undefined;
  }
  const pattern = inner['pattern'].replace(/\\[\s\S]|\//gu, (part) => (part === '/' ? '\\/' : part));
  return `/${pattern}/${typeof inner['options'] === 'string' ? inner['options'] : ''}`;
}

function timestampText(inner: Json): string | undefined {
  return isObject(inner)
    ? `Timestamp({ t: ${JSON.stringify(inner['t'])}, i: ${JSON.stringify(inner['i'])} })`
    : undefined;
}

/** A value of a BSON type from its wrapper, `{ $oid: "…" }`; `undefined` for a document. */
function typedText(value: JsonObject): string | undefined {
  const keys = Object.keys(value);
  if (keys.length === 2 && typeof value['$code'] === 'string' && '$scope' in value) {
    return `Code(${JSON.stringify(value['$code'])}, ${oneLine(value['$scope'] ?? null)})`;
  }
  const [key] = keys;
  const inner = key === undefined ? undefined : value[key];
  if (keys.length !== 1 || key === undefined || inner === undefined) {
    return undefined;
  }
  const string = typeof inner === 'string' ? inner : undefined;
  const texts: Readonly<Record<string, () => string | undefined>> = {
    $oid: () => (string === undefined ? undefined : `ObjectId(${JSON.stringify(string)})`),
    $numberInt: () => string,
    $numberDouble: () => (string === undefined ? undefined : doubleValueText(string)),
    $numberLong: () => (string === undefined ? undefined : longText(string)),
    $numberDecimal: () => (string === undefined ? undefined : `NumberDecimal(${JSON.stringify(string)})`),
    $date: () => dateText(inner),
    $binary: () => binaryText(inner),
    $regularExpression: () => regexText(inner),
    $timestamp: () => timestampText(inner),
    $minKey: () => 'MinKey()',
    $maxKey: () => 'MaxKey()',
    $undefined: () => 'undefined',
    $symbol: () => (string === undefined ? undefined : `BSONSymbol(${JSON.stringify(string)})`),
    $code: () => (string === undefined ? undefined : `Code(${JSON.stringify(string)})`),
  };
  return texts[key]?.();
}

/** Whether a value is of a BSON type written by a helper (`ObjectId("…")`, `5`), not a document or a list. */
export function isTypedValue(value: Json): boolean {
  return isObject(value) && typedText(value) !== undefined;
}

/** Whether a value is a document or a list that the pretty layout may open on several lines. */
function isContainer(value: Json): value is JsonObject | readonly Json[] {
  return Array.isArray(value)
    ? value.length > 0
    : isObject(value) && Object.keys(value).length > 0 && !typedText(value);
}

/** The value on one line: `{ a: 1, b: [1, 2] }`, a space inside the braces and none inside the brackets. */
function oneLine(value: Json): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${(value as readonly Json[]).map(oneLine).join(', ')}]`;
  }
  const object = value as JsonObject;
  const typed = typedText(object);
  if (typed !== undefined) {
    return typed;
  }
  const entries = Object.entries(object);
  return entries.length === 0
    ? '{}'
    : `{ ${entries.map(([key, item]) => `${keyText(key)}: ${oneLine(item)}`).join(', ')} }`;
}

function pretty(value: Json, level: number, width: number): string {
  const single = oneLine(value);
  const pad = '  '.repeat(level);
  if (pad.length + single.length <= width || !isContainer(value)) {
    return single;
  }
  const lines = Array.isArray(value)
    ? (value as readonly Json[]).map((item) => `${pad}  ${pretty(item, level + 1, width)}`)
    : Object.entries(value).map(([key, item]) => `${pad}  ${keyText(key)}: ${pretty(item, level + 1, width)}`);
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return `${open}\n${lines.join(',\n')}\n${pad}${close}`;
}

/** A filter on one line when it fits 70 characters, otherwise one top-level field per line, each on one line. */
function filter(value: Json): string {
  const single = oneLine(value);
  if (single.length <= filterWidth || !isObject(value) || !isContainer(value)) {
    return single;
  }
  const lines = Object.entries(value).map(([key, item]) => `  ${keyText(key)}: ${oneLine(item)}`);
  return `{\n${lines.join(',\n')}\n}`;
}

/** The value as mongosh syntax in a layout: the card's `formattedValue` of `query.format`. */
export function formattedValue(value: Json, layout: Layout): string {
  switch (layout.kind) {
    case 'one-line':
      return oneLine(value);
    case 'filter':
      return filter(value);
    case 'pretty':
      return pretty(value, layout.level ?? 0, layout.width);
  }
}
