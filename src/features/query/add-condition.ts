/**
 * Feature: query.add-condition
 *
 * Merges one more condition on a field into the filter already in the bar, instead of replacing it.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue } from './format';
import { isOperatorObject, isSubdocument, type JsonObject } from './mongosh/ejson';
import { objectOfText, withEntry, type Changed } from './mongosh/object-text';

/** Where a condition goes, and the time `ISODate()` in the text stands for. */
export interface ConditionOptions {
  /** The path of an expanded array whose elements hold the field: the condition goes in its `$elemMatch`. */
  readonly within?: string;
  readonly now?: number;
}

function joined(object: JsonObject, key: string, condition: Json): JsonObject {
  const existing = object[key];
  const value =
    isOperatorObject(condition) && isOperatorObject(existing) ? withEntries(existing, condition) : condition;
  return withEntry(object, key, value);
}

function withEntries(object: JsonObject, added: JsonObject): JsonObject {
  return Object.entries(added).reduce((each, [key, value]) => withEntry(each, key, value), object);
}

/**
 * Feature: query.add-condition
 *
 * The text of **Filter** with the condition on the field joined in, in the filter layout of `query.format`: two objects
 * of operators are joined, the new operator replacing the same one; anything else replaces the field's condition. With
 * `within`, the condition goes in the `$elemMatch` of that array. An error when the text is not an object.
 */
export function filterWithCondition(
  written: string,
  field: string,
  condition: Json,
  options: ConditionOptions = {},
): Changed {
  const read = objectOfText(written, options.now ?? 0);
  if (!read.ok) {
    return read;
  }
  const { within } = options;
  let filter: JsonObject;
  if (within !== undefined && field.startsWith(`${within}.`)) {
    const existing = read.value[within];
    const target = isOperatorObject(existing) ? existing : {};
    const match = target['$elemMatch'];
    const inside = joined(isSubdocument(match) ? match : {}, field.slice(within.length + 1), condition);
    filter = withEntry(read.value, within, withEntry(target, '$elemMatch', inside));
  } else {
    filter = joined(read.value, field, condition);
  }
  return { ok: true, text: formattedValue(filter, 'filter') };
}
