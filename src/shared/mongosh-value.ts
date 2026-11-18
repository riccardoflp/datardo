/**
 * A MongoDB value, given as canonical Extended JSON, written on one line in mongosh syntax: `ObjectId("…")`,
 * `ISODate("…")`, `Long("…")`, `{ status: "new" }`. This is the short writer `runner.step-text` needs until
 * `query.format` (M9) writes values in full; both write the same text for the same value.
 */
import type { Json } from './engine-request';
import { cutUnits, groupThousands } from './text-units';

/** How long a value and a list may be before they are cut, for a text that is shown and not sent. */
export interface Shortening {
  readonly longestValue: number;
  readonly longestList: number;
}

/** No cut: the whole value. */
export const wholeValue: Shortening = {
  longestValue: Number.POSITIVE_INFINITY,
  longestList: Number.POSITIVE_INFINITY,
};

type JsonObject = { readonly [key: string]: Json };

/** The value in mongosh syntax. */
export function mongoshValue(value: Json, shortening: Shortening = wholeValue): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return stringText(value, shortening);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return arrayText(value as readonly Json[], shortening);
  }
  return typedText(value as JsonObject, shortening) ?? objectText(value as JsonObject, shortening);
}

function stringText(value: string, shortening: Shortening): string {
  const units = Array.from(value).map(escapeCharacter);
  const cut = cutUnits(units, shortening.longestValue);
  return `"${cut.text}"${cut.more}`;
}

function escapeCharacter(character: string): string {
  switch (character) {
    case '"':
      return '\\"';
    case '\\':
      return '\\\\';
    case '\n':
      return '\\n';
    case '\r':
      return '\\r';
    case '\t':
      return '\\t';
    default: {
      const code = character.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f ? `\\u${code.toString(16).padStart(4, '0')}` : character;
    }
  }
}

function arrayText(items: readonly Json[], shortening: Shortening): string {
  if (items.length === 0) {
    return '[]';
  }
  const shown = items.slice(0, shortening.longestList).map((item) => mongoshValue(item, shortening));
  const more = items.length - shown.length;
  return more > 0 ? `[${shown.join(', ')}, … and ${groupThousands(more)} more]` : `[${shown.join(', ')}]`;
}

function objectText(value: JsonObject, shortening: Shortening): string {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return '{}';
  }
  const fields = entries.map(([key, item]) => `${keyText(key)}: ${mongoshValue(item, shortening)}`);
  return `{ ${fields.join(', ')} }`;
}

function keyText(key: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(key) ? key : JSON.stringify(key);
}

/** A value of a BSON type, from its canonical Extended JSON wrapper; `undefined` for a plain document. */
function typedText(value: JsonObject, shortening: Shortening): string | undefined {
  const keys = Object.keys(value);
  const [first] = keys;
  if (keys.length !== 1 || first === undefined || !first.startsWith('$')) {
    return keys.length === 2 && '$code' in value && '$scope' in value ? codeText(value, shortening) : undefined;
  }
  const inner = value[first] ?? null;
  return scalarText(first, inner) ?? nestedText(first, inner, shortening);
}

function scalarText(key: string, inner: Json): string | undefined {
  switch (key) {
    case '$oid':
      return `ObjectId(${JSON.stringify(inner)})`;
    case '$numberInt':
    case '$numberDouble':
      return typeof inner === 'string' ? inner : undefined;
    case '$numberLong':
      return `Long(${JSON.stringify(inner)})`;
    case '$numberDecimal':
      return `Decimal128(${JSON.stringify(inner)})`;
    case '$symbol':
      return `Symbol(${JSON.stringify(inner)})`;
    case '$minKey':
      return 'MinKey()';
    case '$maxKey':
      return 'MaxKey()';
    case '$undefined':
      return 'undefined';
    default:
      return undefined;
  }
}

function nestedText(key: string, inner: Json, shortening: Shortening): string | undefined {
  if (typeof inner !== 'object' || inner === null || Array.isArray(inner)) {
    return key === '$code' && typeof inner === 'string' ? `Code(${JSON.stringify(inner)})` : undefined;
  }
  const fields = inner as JsonObject;
  switch (key) {
    case '$date':
      return dateText(fields['$numberLong']);
    case '$binary':
      return binaryText(fields['base64'], fields['subType']);
    case '$regularExpression':
      return `/${plainText(fields['pattern'])}/${plainText(fields['options'] ?? '')}`;
    case '$timestamp':
      return `Timestamp({ t: ${plainText(fields['t'])}, i: ${plainText(fields['i'])} })`;
    case '$dbPointer':
      return `DBPointer(${mongoshValue(fields['$ref'] ?? null, shortening)}, ${mongoshValue(fields['$id'] ?? null, shortening)})`;
    default:
      return undefined;
  }
}

function dateText(milliseconds: Json | undefined): string | undefined {
  const time = Number(milliseconds);
  if (typeof milliseconds !== 'string' || !Number.isFinite(time)) {
    return undefined;
  }
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? `new Date(${milliseconds})` : `ISODate(${JSON.stringify(date.toISOString())})`;
}

function binaryText(base64: Json | undefined, subType: Json | undefined): string | undefined {
  if (typeof base64 !== 'string' || typeof subType !== 'string') {
    return undefined;
  }
  if (subType === '04') {
    const hex = Array.from(atob(base64), (character) => character.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    if (hex.length === 32) {
      return `UUID("${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}")`;
    }
  }
  return `Binary.createFromBase64(${JSON.stringify(base64)}, ${String(parseInt(subType, 16))})`;
}

function codeText(value: JsonObject, shortening: Shortening): string {
  return `Code(${mongoshValue(value['$code'] ?? null, shortening)}, ${mongoshValue(value['$scope'] ?? null, shortening)})`;
}

/** A string or a number of Extended JSON as it is written; anything else as JSON. */
function plainText(value: Json | undefined): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value ?? null);
}
