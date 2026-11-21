/**
 * The index the Explain section suggests for a filter and a sort (`explain.suggest-index`, the rule of equality,
 * sort, range), with its keys as the Monitor page and the Index advisor write them, and the filter and the sort of a
 * slow operation that an index could serve (`monitor.group-slow-queries`, rule 4). Ported from Mongoster's
 * `src/shared/profile.ts › indexableQuery`.
 */
import type { Json } from '../../../shared/engine-request';
import { suggestedIndex as explainSuggestion } from '../../explain/suggest-index';
import type { QueryParts, SuggestedIndex } from '../types';
import { recordOf } from './ejson';

/** The keys of the index for a filter and a sort, or `undefined` when nothing in them can use one. */
export function suggestedIndex(filter: Json | undefined, sort: Json | undefined): SuggestedIndex | undefined {
  return explainSuggestion(filter, sort)?.map((key) => ({ field: key.field, value: key.direction }));
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
