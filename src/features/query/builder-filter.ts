/**
 * Feature: query.builder-filter
 *
 * Turns the rows of the query builder (a field, an operator, a value as text) into the filter written in **Filter**.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue } from './format';
import { int32, isJsonArray, isOperatorObject, numberOf, regex, wrapperType, type JsonObject } from './mongosh/ejson';
import { parsedValue } from './parse';
import { text } from './text';

/** The operators of a row of the builder, in the order of its list. */
export const builderOperators = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'nin',
  'regex',
  'exists',
  'missing',
  'type',
  'size',
] as const;

/** An operator of a row. */
export type BuilderOperator = (typeof builderOperators)[number];

/** The types the operator `type` offers. */
export const builderTypes = [
  'string',
  'number',
  'int',
  'long',
  'double',
  'decimal',
  'bool',
  'date',
  'objectId',
  'object',
  'array',
  'null',
  'regex',
  'binData',
  'timestamp',
] as const;

/** One condition of the builder: the value is mongosh text, the name of a type for `type`, unused for `exists`/`missing`. */
export interface BuilderRow {
  readonly field: string;
  readonly operator: BuilderOperator;
  readonly value: string;
}

/** How the rows combine: every condition, or any of them. */
export type Combine = 'all' | 'any';

/** The filter of the rows, and its text for **Filter**; or the error of a value that does not fit its operator. */
export type RowsFilter =
  | { readonly ok: true; readonly filter: JsonObject; readonly text: string }
  | { readonly ok: false; readonly error: string };

/** Operators that take no value. */
export function takesNoValue(operator: BuilderOperator): boolean {
  return operator === 'exists' || operator === 'missing';
}

/** Whether a row is filled in enough to be part of the filter. */
export function isComplete(row: BuilderRow): boolean {
  return row.field.trim() !== '' && (takesNoValue(row.operator) || row.value.trim() !== '');
}

const operatorKeys: Readonly<Record<Exclude<BuilderOperator, 'exists' | 'missing'>, string>> = {
  eq: '$eq',
  ne: '$ne',
  gt: '$gt',
  gte: '$gte',
  lt: '$lt',
  lte: '$lte',
  in: '$in',
  nin: '$nin',
  regex: '$regex',
  type: '$type',
  size: '$size',
};

class ValueError extends Error {}

function parsedOrUndefined(source: string, now: number): Json | undefined {
  const parsed = parsedValue(source, now, () => '000000000000000000000000');
  return parsed.ok ? parsed.value : undefined;
}

/** A value typed in a row: mongosh syntax, or else the text itself as a string. */
export function valueOfText(written: string, now = 0): Json {
  const trimmed = written.trim();
  const list = parsedOrUndefined(`[${trimmed}\n]`, now);
  return Array.isArray(list) && list.length === 1 ? (list[0] as Json) : trimmed;
}

function listOfText(written: string, now: number): Json[] {
  const trimmed = written.trim();
  const list = parsedOrUndefined(`[${trimmed}\n]`, now);
  if (isJsonArray(list)) {
    const [first] = list;
    return list.length === 1 && isJsonArray(first) && trimmed.startsWith('[') ? [...first] : [...list];
  }
  return trimmed
    .split(',')
    .map((each) => valueOfText(each, now))
    .filter((each) => each !== '');
}

function isRegex(value: Json): boolean {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && wrapperType(value as JsonObject) === 'regex'
  );
}

function operand(row: BuilderRow, now: number): Json {
  switch (row.operator) {
    case 'in':
    case 'nin':
      return listOfText(row.value, now);
    case 'regex': {
      const value = valueOfText(row.value, now);
      return isRegex(value) ? value : regex(typeof value === 'string' ? value : row.value.trim(), '');
    }
    case 'type':
      return row.value.trim();
    case 'size': {
      const size = numberOf(valueOfText(row.value, now));
      if (size === undefined || !Number.isInteger(size) || size < 0) {
        throw new ValueError(text.builder.sizeError(row.field.trim()));
      }
      return int32(size);
    }
    case 'eq':
    case 'exists':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
    case 'missing':
    case 'ne':
      return valueOfText(row.value, now);
  }
}

function asOperator(row: BuilderRow, now: number): readonly [string, Json] {
  if (row.operator === 'exists' || row.operator === 'missing') {
    return ['$exists', row.operator === 'exists'];
  }
  return [operatorKeys[row.operator], operand(row, now)];
}

function alone(row: BuilderRow, now: number): Json {
  if (row.operator === 'eq') {
    const value = operand(row, now);
    // An object whose keys start with `$` would be read as operators: it is compared as a value with `$eq`.
    return isOperatorObject(value) ? { $eq: value } : value;
  }
  if (row.operator === 'regex') {
    return operand(row, now);
  }
  const [key, value] = asOperator(row, now);
  return { [key]: value };
}

function eachAlone(rows: readonly BuilderRow[], now: number): JsonObject[] {
  return rows.map((row) => ({ [row.field]: alone(row, now) }));
}

function allOf(rows: readonly BuilderRow[], now: number): JsonObject {
  const byField = new Map<string, BuilderRow[]>();
  for (const row of rows) {
    byField.set(row.field, [...(byField.get(row.field) ?? []), row]);
  }
  const entries: [string, Json][] = [];
  for (const [field, list] of byField) {
    const [first] = list;
    if (list.length === 1 && first !== undefined) {
      entries.push([field, alone(first, now)]);
      continue;
    }
    const merged = new Map<string, Json>();
    for (const row of list) {
      const [key, value] = asOperator(row, now);
      if (merged.has(key)) {
        return { $and: eachAlone(rows, now) };
      }
      merged.set(key, value);
    }
    entries.push([field, Object.fromEntries(merged)]);
  }
  return Object.fromEntries(entries);
}

function filterOf(rows: readonly BuilderRow[], combine: Combine, now: number): JsonObject {
  const [first] = rows;
  if (first === undefined) {
    return {};
  }
  if (combine === 'any') {
    return rows.length === 1 ? { [first.field]: alone(first, now) } : { $or: eachAlone(rows, now) };
  }
  return allOf(rows, now);
}

/**
 * Feature: query.builder-filter
 *
 * The filter of the complete rows, combined with *all* or *any*, and its text in the filter layout of `query.format`
 * (empty for a filter with no condition); or the error of a value that does not fit its operator. `now` is the time
 * `ISODate()` stands for.
 */
export function filterOfRows(rows: readonly BuilderRow[], combine: Combine, now = 0): RowsFilter {
  const complete = rows.filter(isComplete).map((row) => ({ ...row, field: row.field.trim() }));
  try {
    const filter = filterOf(complete, combine, now);
    return { ok: true, filter, text: Object.keys(filter).length === 0 ? '' : formattedValue(filter, 'filter') };
  } catch (error) {
    if (error instanceof ValueError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
