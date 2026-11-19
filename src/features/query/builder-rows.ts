/**
 * Feature: query.builder-rows
 *
 * Turns a filter written by hand, dropped or taken from a recent query into the rows of the builder, when rows can
 * say it.
 */
import type { Json } from '../../shared/engine-request';
import type { BuilderOperator, BuilderRow, Combine } from './builder-filter';
import { formattedValue } from './format';
import {
  isJsonArray,
  isJsonObject,
  isOperatorObject,
  isSubdocument,
  numberOf,
  regex,
  wrapperType,
  type JsonObject,
} from './mongosh/ejson';

/** The rows of a filter and how they combine. */
export interface FilterRows {
  readonly combine: Combine;
  readonly rows: readonly BuilderRow[];
}

const comparisons: Readonly<Record<string, BuilderOperator>> = {
  $eq: 'eq',
  $ne: 'ne',
  $gt: 'gt',
  $gte: 'gte',
  $lt: 'lt',
  $lte: 'lte',
};

function isRegex(value: Json | undefined): boolean {
  return isJsonObject(value) && wrapperType(value) === 'regex';
}

/** Whether a value is a document that mixes operators and fields, which the rows cannot say. */
function mixesOperators(value: Json): boolean {
  return (
    isSubdocument(value) &&
    !isOperatorObject(value) &&
    Object.keys(value).some((key) => key.startsWith('$')) &&
    !('$ref' in value)
  );
}

function regexRow(field: string, value: Json, operators: JsonObject): BuilderRow | undefined {
  const options = operators['$options'];
  if (options !== undefined && typeof options !== 'string') {
    return undefined;
  }
  if (typeof value === 'string') {
    return { field, operator: 'regex', value: formattedValue(regex(value, options ?? '')) };
  }
  return isRegex(value) && options === undefined
    ? { field, operator: 'regex', value: formattedValue(value) }
    : undefined;
}

function operatorRow(field: string, key: string, value: Json, operators: JsonObject): BuilderRow | undefined | 'none' {
  const comparison = comparisons[key];
  if (comparison !== undefined) {
    return { field, operator: comparison, value: formattedValue(value) };
  }
  switch (key) {
    case '$in':
    case '$nin':
      return Array.isArray(value)
        ? { field, operator: key === '$in' ? 'in' : 'nin', value: formattedValue(value) }
        : undefined;
    case '$exists': {
      const flag = typeof value === 'boolean' ? value : numberOf(value);
      return flag === undefined
        ? undefined
        : { field, operator: flag === false || flag === 0 ? 'missing' : 'exists', value: '' };
    }
    case '$regex':
      return regexRow(field, value, operators);
    case '$options':
      return '$regex' in operators ? 'none' : undefined;
    case '$type':
      return typeof value === 'string' ? { field, operator: 'type', value } : undefined;
    case '$size': {
      const size = numberOf(value);
      return size === undefined ? undefined : { field, operator: 'size', value: String(size) };
    }
    default:
      return undefined;
  }
}

/** The rows of one field's condition; `undefined` when it uses something the rows cannot say. */
function rowsOfField(field: string, value: Json): BuilderRow[] | undefined {
  if (isRegex(value)) {
    return [{ field, operator: 'regex', value: formattedValue(value) }];
  }
  if (!isOperatorObject(value)) {
    return mixesOperators(value) ? undefined : [{ field, operator: 'eq', value: formattedValue(value) }];
  }
  const rows: BuilderRow[] = [];
  for (const [key, each] of Object.entries(value)) {
    const row = operatorRow(field, key, each, value);
    if (row === undefined) {
      return undefined;
    }
    if (row !== 'none') {
      rows.push(row);
    }
  }
  return rows;
}

function rowsOfList(list: Json | undefined, combine: Combine): FilterRows | undefined {
  if (!isJsonArray(list) || list.length === 0) {
    return undefined;
  }
  const rows: BuilderRow[] = [];
  for (const item of list) {
    const fields = isSubdocument(item) ? Object.entries(item) : [];
    const [only] = fields;
    if (fields.length !== 1 || only === undefined || only[0].startsWith('$')) {
      return undefined;
    }
    const found = rowsOfField(only[0], only[1]);
    // Under $or one item is one condition: { a: { $gt: 1, $lt: 5 } } would be two together.
    if (found === undefined || (combine === 'any' && found.length !== 1)) {
      return undefined;
    }
    rows.push(...found);
  }
  return { combine, rows };
}

/**
 * Feature: query.builder-rows
 *
 * The rows of a filter already read by `query.parse`, and whether they combine with *all* or *any*; `undefined` when
 * the filter uses something rows cannot say. An empty filter gives no rows, combined with *all*.
 */
export function rowsOfFilter(filter: Json): FilterRows | undefined {
  if (!isSubdocument(filter)) {
    return undefined;
  }
  const keys = Object.keys(filter);
  const [only] = keys;
  if (keys.length === 1 && (only === '$or' || only === '$and')) {
    return rowsOfList(filter[only], only === '$or' ? 'any' : 'all');
  }
  const rows: BuilderRow[] = [];
  for (const [key, value] of Object.entries(filter)) {
    const found = key.startsWith('$') ? undefined : rowsOfField(key, value);
    if (found === undefined) {
      return undefined;
    }
    rows.push(...found);
  }
  return { combine: 'all', rows };
}
