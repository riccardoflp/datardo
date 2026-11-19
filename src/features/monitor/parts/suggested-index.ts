/**
 * The index the Explain section suggests for a filter and a sort, by the rule of equality, sort, range
 * (`explain.suggest-index`, its rules 1 to 6), and the filter and the sort of a slow operation that an index could
 * serve (`monitor.group-slow-queries`, rule 4). The Explain section is built in M23: this is the same rule, written
 * here so that the Monitor page and the Index advisor can be built before it, and to be replaced by
 * `src/features/explain/suggest-index.ts › suggestedIndex` once it exists. Ported from Mongoster's
 * `src/shared/explain.ts › suggestIndex` and `src/shared/profile.ts › indexableQuery`.
 */
import type { Json } from '../../../shared/engine-request';
import type { QueryParts, SuggestedIndex } from '../types';
import { isRecord, isRegularExpression, isTypedValue, numberOf, recordOf } from './ejson';

const rangeOperators = new Set(['$gt', '$gte', '$lt', '$lte', '$ne', '$nin', '$regex', '$exists', '$not']);

type Condition = 'equality' | 'range' | 'none';

/** Whether a condition is an object of operators: `{ $gt: 5 }`. */
function isOperators(value: Json): value is Readonly<Record<string, Json>> {
  if (!isRecord(value) || isTypedValue(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => key.startsWith('$'));
}

function conditionOf(value: Json): Condition {
  if (isRegularExpression(value)) {
    return 'range';
  }
  if (!isOperators(value)) {
    return 'equality';
  }
  const operators = Object.keys(value);
  const hasRange = operators.some((operator) => rangeOperators.has(operator));
  if (operators.includes('$eq') || operators.includes('$in')) {
    return 'equality';
  }
  if (hasRange) {
    return 'range';
  }
  return operators.includes('$elemMatch') ? 'equality' : 'none';
}

/** The keys of the index for a filter and a sort, or `undefined` when nothing in them can use one. */
export function suggestedIndex(filter: Json | undefined, sort: Json | undefined): SuggestedIndex | undefined {
  const equality: string[] = [];
  const range: string[] = [];
  for (const [field, value] of Object.entries(isRecord(filter) ? filter : {})) {
    if (field.startsWith('$')) {
      continue;
    }
    const condition = conditionOf(value);
    if (condition === 'equality') {
      equality.push(field);
    } else if (condition === 'range') {
      range.push(field);
    }
  }
  const keys: { field: string; value: 1 | -1 }[] = equality.map((field) => ({ field, value: 1 }));
  const has = (field: string): boolean => keys.some((each) => each.field === field);
  for (const [field, direction] of Object.entries(isRecord(sort) ? sort : {})) {
    if (!has(field)) {
      keys.push({ field, value: numberOf(direction) === -1 ? -1 : 1 });
    }
  }
  for (const field of range.filter((each) => !has(each))) {
    keys.push({ field, value: 1 });
  }
  return keys.length === 0 ? undefined : keys;
}

/**
 * The filter and the sort of a query that an index could serve: for an `aggregate`, a leading `$match` and a `$sort`
 * right after it, or a leading `$sort` alone; any other pipeline has none.
 */
export function indexableQuery(kind: string, query: QueryParts): { readonly filter?: Json; readonly sort?: Json } {
  if (kind !== 'aggregate') {
    return { ...(query.filter === undefined ? {} : { filter: query.filter }), ...sortPart(query.sort) };
  }
  const [first, second] = query.pipeline ?? [];
  const firstStage = recordOf(first);
  if ('$match' in firstStage) {
    const next = recordOf(second);
    return { filter: firstStage['$match'] ?? null, ...sortPart('$sort' in next ? next['$sort'] : undefined) };
  }
  return '$sort' in firstStage ? sortPart(firstStage['$sort']) : {};
}

function sortPart(sort: Json | undefined): { readonly sort?: Json } {
  return sort === undefined ? {} : { sort };
}
