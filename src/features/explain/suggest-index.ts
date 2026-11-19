/**
 * Feature: explain.suggest-index
 *
 * The keys of an index that would serve a filter and a sort, by the rule of equality, sort, range (ESR): the equality
 * fields of the filter, then the fields of the sort, then the range fields. Creating the index is `index.create`.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue, isTypedValue } from '../aggregate/mongosh/format';
import { isJsonDocument, type IndexKey, type JsonDocument } from './types';

/** The operators that make a field a range field when it has neither `$eq` nor `$in` (rule 3). */
export const rangeOperators: ReadonlySet<string> = new Set([
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$ne',
  '$nin',
  '$regex',
  '$exists',
  '$not',
]);

/** A document of operators only, `{ $gte: 1 }`: not a value of a BSON type such as `{ $oid: "…" }`. */
function isOperators(value: Json): value is JsonDocument {
  if (!isJsonDocument(value) || isTypedValue(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => key.startsWith('$'));
}

function isRegularExpression(value: Json): boolean {
  return isJsonDocument(value) && '$regularExpression' in value;
}

/** What a condition makes of its field: an equality field, a range field, or neither (rules 2 to 4). */
function conditionKind(condition: Json): 'equality' | 'range' | 'none' {
  if (isRegularExpression(condition)) {
    return 'range';
  }
  if (!isOperators(condition)) {
    return 'equality';
  }
  const operators = Object.keys(condition);
  if (operators.includes('$eq') || operators.includes('$in')) {
    return 'equality';
  }
  if (operators.some((operator) => rangeOperators.has(operator))) {
    return 'range';
  }
  return operators.includes('$elemMatch') ? 'equality' : 'none';
}

/** The direction of a field of the sort: `-1` for minus one of any number type, ascending otherwise. */
function direction(value: Json | undefined): 1 | -1 {
  if (value === -1) {
    return -1;
  }
  if (!isJsonDocument(value)) {
    return 1;
  }
  const inner = value['$numberInt'] ?? value['$numberLong'] ?? value['$numberDouble'] ?? value['$numberDecimal'];
  return typeof inner === 'string' && Number(inner) === -1 ? -1 : 1;
}

/**
 * Feature: explain.suggest-index — the keys, in order, for a parsed filter and sort (canonical Extended JSON); `undefined`
 * when there is none. A filter that is not an object gives the keys of the sort alone.
 */
export function suggestedIndex(filter: Json | undefined, sort: Json | undefined): readonly IndexKey[] | undefined {
  const equality: string[] = [];
  const range: string[] = [];
  const fields = isJsonDocument(filter) ? Object.entries(filter) : [];
  for (const [field, condition] of fields) {
    if (field.startsWith('$')) {
      continue;
    }
    const kind = conditionKind(condition);
    if (kind === 'equality') {
      equality.push(field);
    } else if (kind === 'range') {
      range.push(field);
    }
  }
  const keys: IndexKey[] = equality.map((field) => ({ field, direction: 1 }));
  const has = (field: string): boolean => keys.some((key) => key.field === field);
  const sorted = isJsonDocument(sort) ? Object.entries(sort) : [];
  for (const [field, value] of sorted) {
    if (!has(field)) {
      keys.push({ field, direction: direction(value) });
    }
  }
  for (const field of range) {
    if (!has(field)) {
      keys.push({ field, direction: 1 });
    }
  }
  return keys.length === 0 ? undefined : keys;
}

/** The keys as the index dialog takes them: a document of canonical Extended JSON, `{ status: 1, createdAt: -1 }`. */
export function indexKeysDocument(keys: readonly IndexKey[]): Json {
  return Object.fromEntries(keys.map((key) => [key.field, { $numberInt: String(key.direction) }]));
}

/** The keys in mongosh syntax, as the Explain section shows them: `{ status: 1, createdAt: -1, total: 1 }`. */
export function indexKeysText(keys: readonly IndexKey[]): string {
  return formattedValue(indexKeysDocument(keys), { kind: 'one-line' });
}
