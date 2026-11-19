/**
 * The text a value of a document is matched on, by its BSON type (`search.match`, "How each type of value is
 * searched"): a string as it is, a number as its text, a date as its ISO text in UTC, an ObjectId as its 24
 * hexadecimal digits, a UUID as `8-4-4-4-12` digits; nothing for the values a search never matches.
 */
import type { Json } from '../../../shared/engine-request';
import {
  bytesOfBase64,
  dateMilliseconds,
  hexOfBytes,
  isJsonObject,
  objectField,
  wrapperType,
  type JsonObject,
} from '../../query/mongosh/ejson';
import type { MatchKind } from '../types';

/** The characters a text needs to match part of an ObjectId or a UUID in **Contains** mode (rule 4). */
export const shortestIdPart = 6;

/** What a value is matched on. */
export interface Leaf {
  readonly kind: Exclude<MatchKind, 'field-name'>;
  readonly text: string;
  /** In **Contains** mode, compared with the whole text as a value: numbers and booleans. */
  readonly whole: boolean;
  /** Matched without regard to case, whatever **Match case** says: ObjectIds, UUIDs, dates. */
  readonly anyCase: boolean;
  /** Whether a whole text shorter than 6 characters may not match part of it: ObjectIds and UUIDs. */
  readonly idLike: boolean;
}

function leaf(kind: Leaf['kind'], text: string, how: Partial<Omit<Leaf, 'kind' | 'text'>> = {}): Leaf {
  return { kind, text, whole: how.whole ?? false, anyCase: how.anyCase ?? false, idLike: how.idLike ?? false };
}

/** A `Double`'s text as a number: `1.5`, `42` for `42.0`, `NaN`, `Infinity`. */
function doubleText(written: string): string {
  return String(Number(written));
}

function dateLeaf(value: JsonObject): Leaf | undefined {
  const milliseconds = dateMilliseconds(value);
  const time = Number(milliseconds);
  if (milliseconds === undefined || !Number.isFinite(time)) {
    return undefined;
  }
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? undefined : leaf('date', date.toISOString(), { anyCase: true });
}

/** The hexadecimal digits of a UUID with its dashes, lower case: `3f2b8c1e-5d4a-4e7b-9c6f-1a2b3c4d5e6f`. */
function uuidText(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function binaryLeaf(value: JsonObject): Leaf | undefined {
  const uuid = value['$uuid'];
  if (typeof uuid === 'string') {
    return leaf('uuid', uuidText(uuid.replace(/-/gu, '').toLowerCase()), { anyCase: true, idLike: true });
  }
  const binary = value['$binary'];
  const subType = objectField(binary, 'subType');
  const base64 = objectField(binary, 'base64');
  const bytes = typeof base64 === 'string' ? bytesOfBase64(base64) : undefined;
  if (typeof subType !== 'string' || Number.parseInt(subType, 16) !== 4 || bytes?.length !== 16) {
    return undefined;
  }
  return leaf('uuid', uuidText(hexOfBytes(bytes)), { anyCase: true, idLike: true });
}

function numberLeaf(text: string): Leaf {
  return leaf('number', text, { whole: true });
}

function textOf(value: Json | undefined): string {
  return typeof value === 'string' ? value : '';
}

function typedLeaf(value: JsonObject): Leaf | undefined {
  switch (wrapperType(value)) {
    case 'objectId':
      return leaf('objectId', textOf(value['$oid']).toLowerCase(), { anyCase: true, idLike: true });
    case 'int':
      return numberLeaf(textOf(value['$numberInt']));
    case 'long':
      return numberLeaf(textOf(value['$numberLong']));
    case 'double':
      return numberLeaf(doubleText(textOf(value['$numberDouble'])));
    case 'decimal':
      return numberLeaf(textOf(value['$numberDecimal']));
    case 'date':
      return dateLeaf(value);
    case 'binData':
      return binaryLeaf(value);
    case 'regex':
      return leaf('regex', textOf(objectField(value['$regularExpression'], 'pattern')));
    case 'javascript':
    case 'javascriptWithScope':
      return leaf('code', textOf(value['$code']));
    case 'symbol':
      return leaf('string', textOf(value['$symbol']));
    case 'array':
    case 'bool':
    case 'dbPointer':
    case 'maxKey':
    case 'minKey':
    case 'null':
    case 'object':
    case 'string':
    case 'timestamp':
    case 'undefined':
    case undefined:
      // Null, MinKey, MaxKey, a timestamp and the like never match; a document is visited, not matched.
      return undefined;
  }
}

/** The text a value is matched on; `undefined` for a sub-document, an array, or a value never matched. */
export function leafOf(value: Json): Leaf | undefined {
  if (typeof value === 'string') {
    return leaf('string', value);
  }
  if (typeof value === 'boolean') {
    return leaf('boolean', String(value), { whole: true });
  }
  if (typeof value === 'number') {
    return numberLeaf(String(value));
  }
  return isJsonObject(value) ? typedLeaf(value) : undefined;
}
