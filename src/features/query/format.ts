/**
 * Feature: query.format
 *
 * Writes values back as the text the user reads and can type again, in cells, the inspector, filters, the steps of a
 * confirmation and what is copied. Every text is read back by `query.parse` as the same value of the same type: a
 * `Double` with a whole value is `Double(5)`, every `Int64` is `NumberLong(…)`.
 */
import type { Json } from '../../shared/engine-request';
import {
  bytesOfBase64,
  dateMilliseconds,
  hexOfBytes,
  isJsonObject,
  objectField,
  textOfJson,
  wrapperType,
  type JsonObject,
} from './mongosh/ejson';

/** How a value is laid out: on one line, as **Filter** writes it, within a width, or every entry on its own line. */
export type Layout = 'one-line' | 'filter' | 'pretty' | 'indented';

/** The width of the **pretty** layout unless the caller gives another. */
export const prettyWidth = 76;

/** The longest filter kept on one line. */
export const longestFilterLine = 70;

/** The largest whole number a JavaScript number holds exactly: 9,007,199,254,740,991. */
const safeLimit = 9007199254740991n;

/** A key without quotes when it is an identifier, otherwise in double quotes. */
export function keyText(key: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(key) ? key : JSON.stringify(key);
}

/** A string in double quotes with JSON's escapes. */
export function stringText(value: string): string {
  return JSON.stringify(value);
}

/** A regular expression's pattern as the body of `/…/`: its slashes escaped, its escapes kept. */
export function escapeSlashes(pattern: string): string {
  return pattern.replace(/\\[\s\S]|\//gu, (match) => (match === '/' ? '\\/' : match));
}

/** A `Double` as mongosh text: `42.5`, `Double(5)`, `NaN`, `Infinity`, `-Infinity`. */
export function doubleShellText(written: string): string {
  const value = Number(written);
  if (Number.isNaN(value)) {
    return 'NaN';
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? 'Infinity' : '-Infinity';
  }
  if (Object.is(value, -0)) {
    return 'Double(-0)';
  }
  return Number.isInteger(value) ? `Double(${String(value)})` : String(value);
}

/** An `Int64` as mongosh text: `NumberLong(1204)`, or with its digits quoted beyond ±9,007,199,254,740,991. */
export function longShellText(digits: string): string {
  const value = /^-?\d+$/u.test(digits) ? BigInt(digits) : undefined;
  if (value === undefined) {
    return `NumberLong(${JSON.stringify(digits)})`;
  }
  return value <= safeLimit && value >= -safeLimit ? `NumberLong(${value.toString()})` : `NumberLong("${digits}")`;
}

function dateShellText(value: JsonObject): string {
  const milliseconds = dateMilliseconds(value) ?? '0';
  const date = new Date(Number(milliseconds));
  return Number.isNaN(date.getTime()) || String(date.getTime()) !== milliseconds
    ? `new Date(${milliseconds})`
    : `ISODate("${date.toISOString()}")`;
}

function uuidText(hex: string): string {
  return `UUID("${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}")`;
}

function binaryShellText(value: JsonObject): string {
  const uuid = value['$uuid'];
  if (typeof uuid === 'string') {
    return uuidText(uuid.replace(/-/gu, '').toLowerCase());
  }
  const base64 = textOfJson(objectField(value['$binary'], 'base64'));
  const subType = Number.parseInt(textOfJson(objectField(value['$binary'], 'subType'), '0'), 16);
  const bytes = bytesOfBase64(base64);
  // Subtype 3 (the old UUID) stays BinData(3, …): written as UUID(…) it would be read back as subtype 4 (D32).
  if (subType === 4 && bytes?.length === 16) {
    return uuidText(hexOfBytes(bytes));
  }
  return `BinData(${String(subType)}, ${JSON.stringify(base64)})`;
}

function plainPart(value: Json | undefined): string {
  return typeof value === 'number' ? String(value) : String(Number(value));
}

/** The text of a typed value, or `undefined` for a document. */
function typedText(value: JsonObject, layout: Layout): string | undefined {
  switch (wrapperType(value)) {
    case 'objectId':
      return `ObjectId(${JSON.stringify(value['$oid'])})`;
    case 'int':
      return textOfJson(value['$numberInt']);
    case 'long':
      return longShellText(textOfJson(value['$numberLong']));
    case 'double':
      return doubleShellText(textOfJson(value['$numberDouble']));
    case 'decimal':
      return `NumberDecimal(${JSON.stringify(value['$numberDecimal'])})`;
    case 'date':
      return dateShellText(value);
    case 'binData':
      return binaryShellText(value);
    case 'array':
    case 'bool':
    case 'dbPointer':
    case 'javascript':
    case 'javascriptWithScope':
    case 'maxKey':
    case 'minKey':
    case 'null':
    case 'object':
    case 'regex':
    case 'string':
    case 'symbol':
    case 'timestamp':
    case 'undefined':
    case undefined:
      return otherTypedText(value, layout);
  }
}

function otherTypedText(value: JsonObject, layout: Layout): string | undefined {
  switch (wrapperType(value)) {
    case 'regex':
      return `/${escapeSlashes(textOfJson(objectField(value['$regularExpression'], 'pattern')))}/${textOfJson(objectField(value['$regularExpression'], 'options'))}`;
    case 'timestamp':
      return `Timestamp({ t: ${plainPart(objectField(value['$timestamp'], 't'))}, i: ${plainPart(objectField(value['$timestamp'], 'i'))} })`;
    case 'minKey':
      return 'MinKey()';
    case 'maxKey':
      return 'MaxKey()';
    case 'undefined':
      return 'undefined';
    case 'symbol':
      return `BSONSymbol(${JSON.stringify(value['$symbol'])})`;
    case 'javascript':
      return `Code(${JSON.stringify(value['$code'])})`;
    case 'javascriptWithScope':
      return `Code(${JSON.stringify(value['$code'])}, ${written(value['$scope'] ?? {}, layout === 'indented' ? 'one-line' : layout, 0)})`;
    case 'array':
    case 'binData':
    case 'bool':
    case 'date':
    case 'dbPointer':
    case 'decimal':
    case 'double':
    case 'int':
    case 'long':
    case 'null':
    case 'object':
    case 'objectId':
    case 'string':
    case undefined:
      return undefined;
  }
}

/** A value on one line. */
function oneLine(value: Json): string {
  return written(value, 'one-line', 0);
}

function plainNumberText(value: number): string {
  if (Number.isFinite(value)) {
    return String(value);
  }
  return Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity';
}

function written(value: Json, layout: Layout, level: number): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return stringText(value);
  }
  if (typeof value === 'number') {
    return plainNumberText(value);
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return entriesText(
      (value as readonly Json[]).map((item) => ['', item]),
      'array',
      { layout, level },
    );
  }
  const object = value as JsonObject;
  return typedText(object, layout) ?? entriesText(Object.entries(object), 'object', { layout, level });
}

interface Where {
  readonly layout: Layout;
  readonly level: number;
}

function entriesText(entries: readonly (readonly [string, Json])[], shape: 'array' | 'object', where: Where): string {
  const [open, close] = shape === 'array' ? ['[', ']'] : ['{', '}'];
  if (entries.length === 0) {
    return `${open}${close}`;
  }
  const entry = ([key, item]: readonly [string, Json]): string =>
    shape === 'array'
      ? written(item, where.layout, where.level + 1)
      : `${keyText(key)}: ${written(item, where.layout, where.level + 1)}`;
  if (where.layout !== 'indented') {
    const items = entries.map(entry).join(', ');
    return shape === 'array' ? `[${items}]` : `{ ${items} }`;
  }
  const pad = '  '.repeat(where.level + 1);
  return `${open}\n${entries.map((each) => pad + entry(each)).join(',\n')}\n${'  '.repeat(where.level)}${close}`;
}

/** The **pretty** layout: a value that fits the width from where it starts stays on one line. */
function pretty(value: Json, level: number, width: number): string {
  const single = oneLine(value);
  const pad = '  '.repeat(level);
  if (pad.length + single.length <= width) {
    return single;
  }
  if (Array.isArray(value) && value.length > 0) {
    const lines = (value as readonly Json[]).map((item) => `${pad}  ${pretty(item, level + 1, width)}`);
    return `[\n${lines.join(',\n')}\n${pad}]`;
  }
  if (isJsonObject(value) && wrapperType(value) === undefined && Object.keys(value).length > 0) {
    const lines = Object.entries(value).map(
      ([key, item]) => `${pad}  ${keyText(key)}: ${pretty(item, level + 1, width)}`,
    );
    return `{\n${lines.join(',\n')}\n${pad}}`;
  }
  return single;
}

/** The **filter** layout: one line up to 70 characters, otherwise one top-level field per line. */
function filterText(value: Json): string {
  const single = oneLine(value);
  if (single.length <= longestFilterLine || !isJsonObject(value) || wrapperType(value) !== undefined) {
    return single;
  }
  const lines = Object.entries(value).map(([key, item]) => `  ${keyText(key)}: ${oneLine(item)}`);
  return `{\n${lines.join(',\n')}\n}`;
}

/**
 * Feature: query.format
 *
 * The text of a value with its BSON type, in a layout: **one line** (cells, steps, sorts, projections), **filter**,
 * **pretty** within a width (76 unless given), or **indented** (every entry on its own line).
 */
export function formattedValue(value: Json, layout: Layout = 'one-line', width: number = prettyWidth): string {
  switch (layout) {
    case 'one-line':
    case 'indented':
      return written(value, layout, 0);
    case 'filter':
      return filterText(value);
    case 'pretty':
      return pretty(value, 0, width);
  }
}
