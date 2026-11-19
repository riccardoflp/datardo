/**
 * How the structure area compares values of Extended JSON: numbers by value whatever their BSON type (an index key
 * `1` is the same as `1.0`, an `expireAfterSeconds` of `NumberLong(60)` the same as `60`), and the options of an
 * object without regard to their order, except where the order is part of what is compared (the keys of an index).
 */
import type { Json } from '../../../shared/engine-request';
import { groupThousands } from '../../../shared/text-units';
import { isJsonObject, numberOf, wrapperType } from '../../query/mongosh/ejson';
import type { JsonObject } from '../types';

/** Whether a value is a JSON object that is a document or a definition, not a typed value. */
export function isDocument(value: Json | undefined): value is JsonObject {
  return isJsonObject(value) && wrapperType(value) === undefined;
}

/** The number a value holds when it is a number of any BSON type. */
export function numberValue(value: Json | undefined): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (isJsonObject(value) && '$numberDecimal' in value) {
    return undefined;
  }
  return numberOf(value);
}

/** The text of a value with numbers written by value and, with `sorted`, the fields of objects sorted by name. */
function valueText(value: Json | undefined, sorted: boolean): string {
  if (value === undefined || value === null) {
    return 'null';
  }
  const number = numberValue(value);
  if (number !== undefined) {
    return `#${String(number)}`;
  }
  if (Array.isArray(value)) {
    return `[${(value as readonly Json[]).map((item) => valueText(item, sorted)).join(',')}]`;
  }
  if (isJsonObject(value)) {
    const keys = sorted ? Object.keys(value).sort() : Object.keys(value);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${valueText(value[key], sorted)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The text that is the same for two values that compare equal, the order of fields left aside. */
export function stableText(value: Json | undefined): string {
  return valueText(value, true);
}

/** The text that is the same for two values that compare equal, the order of fields counting. */
export function orderedText(value: Json | undefined): string {
  return valueText(value, false);
}

/** Whether two values compare equal, the order of fields left aside; a missing value is `null`. */
export function isSame(left: Json | undefined, right: Json | undefined): boolean {
  return stableText(left) === stableText(right);
}

/** An object without some of its fields. */
export function without(object: JsonObject, names: readonly string[]): JsonObject {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !names.includes(key)));
}

/** `Int32` as canonical Extended JSON. */
export function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** `1 search index`, `2 search indexes`, `3 indexes`, `1,204 documents`. */
export function plural(count: number, word: string): string {
  const ending = word.endsWith('x') ? 'es' : 's';
  return `${groupThousands(count)} ${word}${count === 1 ? '' : ending}`;
}
