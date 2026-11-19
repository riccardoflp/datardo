/**
 * Values that can be references, as canonical Extended JSON: which type they are looked up as, the key two values
 * share when MongoDB finds one with the other (numbers of every BSON type alike), DBRefs, and values once each.
 */
import type { Json } from '../../../shared/engine-request';
import { bsonType, isJsonObject, objectField, type JsonObject } from '../../query/mongosh/ejson';
import type { ReferenceType } from '../types';

/** A DBRef as canonical Extended JSON: `{ $ref: "users", $id: …, $db?: "crm" }`. */
export interface DbRefValue {
  readonly $ref: string;
  readonly $id: Json;
  readonly $db?: string;
}

/** Whether a value is a DBRef. */
export function isDbRef(value: Json | undefined): value is JsonObject & DbRefValue {
  return isJsonObject(value) && typeof value['$ref'] === 'string' && '$id' in value;
}

/** Whether a value is a UUID: a binary of subtype 4. */
function isUuid(value: Json): boolean {
  if (isJsonObject(value) && typeof value['$uuid'] === 'string') {
    return true;
  }
  const subType = objectField(objectField(value, '$binary'), 'subType');
  return subType === '04' || subType === '4';
}

/** The type a value is looked up as, or `undefined` when it cannot be a reference. */
export function referenceTypeOf(value: Json): ReferenceType | undefined {
  switch (bsonType(value)) {
    case 'objectId':
      return 'objectId';
    case 'string':
      return 'string';
    case 'int':
    case 'long':
    case 'double':
    case 'decimal':
      return 'number';
    case 'binData':
      return isUuid(value) ? 'uuid' : undefined;
    case 'array':
    case 'bool':
    case 'date':
    case 'dbPointer':
    case 'javascript':
    case 'javascriptWithScope':
    case 'maxKey':
    case 'minKey':
    case 'null':
    case 'object':
    case 'regex':
    case 'symbol':
    case 'timestamp':
    case 'undefined':
      return undefined;
  }
}

const numberKeys = ['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal'] as const;

function numberText(value: JsonObject): string | undefined {
  const key = numberKeys.find((each) => typeof value[each] === 'string');
  return key === undefined ? undefined : String(Number(value[key]));
}

/** The key of a value as MongoDB compares it: `NumberInt(7)` and `NumberLong(7)` have the same key. */
export function referenceKey(value: Json): string {
  if (typeof value === 'number') {
    return `number:${String(value)}`;
  }
  if (isJsonObject(value)) {
    if (typeof value['$oid'] === 'string') {
      return `objectId:${value['$oid']}`;
    }
    const number = numberText(value);
    if (number !== undefined) {
      return `number:${number}`;
    }
  }
  return `json:${JSON.stringify(value)}`;
}

/** Whether a value can be a reference: a non-empty string, a finite number of any BSON type, an ObjectId, a UUID. */
export function isReferenceValue(value: Json | undefined): value is Json {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.length > 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  const type = referenceTypeOf(value);
  if (type === 'number' && isJsonObject(value)) {
    return Number.isFinite(Number(numberText(value)));
  }
  return type !== undefined && type !== 'string';
}

/** The values once each, in their first order; two values are the same when their Extended JSON is. */
export function distinctValues(values: readonly Json[]): readonly Json[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
