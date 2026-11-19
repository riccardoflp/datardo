/**
 * Feature: monitor.group-slow-queries
 *
 * Slow operations grouped by namespace, kind and query shape, with their totals, their slowest run and whether an
 * index could help: the rows of **By query** in the Slow queries section, and what the Index advisor starts from.
 * Ported from Mongoster's `src/shared/profile.ts › groupOps`.
 */
import { indexableQuery, suggestedIndex } from './parts/suggested-index';
import type { SlowQuery, SuggestedIndex } from './types';

/** How many documents examined per document returned make a group ask for an index (rule 4). */
export const examinedPerReturned = 10;

/** The slow operations of one namespace, kind and query shape (glossary, "query shape"). */
export interface SlowQueryGroup {
  /** What tells the groups apart: the namespace, the kind and the shape. */
  readonly key: string;
  readonly namespace: string;
  readonly kind: string;
  readonly shape: string;
  /** The runs, `getMore` batches included. */
  readonly count: number;
  readonly getMores: number;
  readonly totalMillis: number;
  readonly maxMillis: number;
  readonly averageMillis: number;
  readonly docsExamined: number;
  readonly keysExamined: number;
  readonly returned: number;
  /** The distinct plans and applications, in order of appearance. */
  readonly plans: readonly string[];
  readonly applications: readonly string[];
  readonly collectionScan: boolean;
  readonly inMemorySort: boolean;
  /** The time of the last run, in milliseconds since 1970. */
  readonly last: number;
  /** The slowest run that is not a `getMore`; a `getMore` only when the group has nothing else. */
  readonly example: SlowQuery;
  /** The operations of the group, in the order they were given. */
  readonly operations: readonly SlowQuery[];
  /** The index that could serve it, when it asks for one and its query gives a field. */
  readonly suggestion?: SuggestedIndex;
}

/** Whether a run is a better example than the one kept: not a `getMore` first, then the slowest. */
function isBetterExample(candidate: SlowQuery, kept: SlowQuery): boolean {
  if (candidate.getMore !== kept.getMore) {
    return !candidate.getMore;
  }
  return candidate.millis > kept.millis;
}

function distinct(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))];
}

/** Whether a group asks for an index: a collection scan, a sort in memory, or many documents examined (rule 4). */
export function asksForIndex(group: {
  readonly collectionScan: boolean;
  readonly inMemorySort: boolean;
  readonly docsExamined: number;
  readonly returned: number;
}): boolean {
  const perReturned = group.docsExamined / Math.max(group.returned, 1);
  return group.collectionScan || group.inMemorySort || perReturned >= examinedPerReturned;
}

function sum(operations: readonly SlowQuery[], read: (operation: SlowQuery) => number | undefined): number {
  return operations.reduce((total, operation) => total + (read(operation) ?? 0), 0);
}

/** The group of operations of one key, given in order. */
function groupOf(key: string, operations: readonly SlowQuery[]): SlowQueryGroup {
  const [first] = operations;
  if (first === undefined) {
    throw new Error('A group has at least one operation.');
  }
  const example = operations.reduce((kept, operation) => (isBetterExample(operation, kept) ? operation : kept), first);
  const totalMillis = sum(operations, (operation) => operation.millis);
  const plans = distinct(operations.map((operation) => operation.plan));
  const totals = {
    collectionScan: plans.some((plan) => plan.includes('COLLSCAN')),
    inMemorySort: operations.some((operation) => operation.inMemorySort),
    docsExamined: sum(operations, (operation) => operation.docsExamined),
    returned: sum(operations, (operation) => operation.returned),
  };
  const query = indexableQuery(example.kind, example.query);
  const suggestion = asksForIndex(totals) ? suggestedIndex(query.filter, query.sort) : undefined;
  return {
    key,
    namespace: first.namespace,
    kind: first.kind,
    shape: first.shape,
    count: operations.length,
    getMores: operations.filter((operation) => operation.getMore).length,
    totalMillis,
    maxMillis: Math.max(...operations.map((operation) => operation.millis)),
    averageMillis: totalMillis / operations.length,
    ...totals,
    keysExamined: sum(operations, (operation) => operation.keysExamined),
    plans,
    applications: distinct(operations.map((operation) => operation.application)),
    last: Math.max(...operations.map((operation) => operation.time)),
    example,
    operations,
    ...(suggestion === undefined ? {} : { suggestion }),
  };
}

/** The key of the group of an operation: its namespace, its kind and its shape. */
export function groupKey(operation: SlowQuery): string {
  return JSON.stringify([operation.namespace, operation.kind, operation.shape]);
}

/** Feature: monitor.group-slow-queries — the groups, the largest total time first, then the one with more runs. */
export function slowQueryGroups(operations: readonly SlowQuery[]): readonly SlowQueryGroup[] {
  const byKey = new Map<string, SlowQuery[]>();
  for (const operation of operations) {
    const key = groupKey(operation);
    const list = byKey.get(key) ?? [];
    list.push(operation);
    byKey.set(key, list);
  }
  return [...byKey.entries()]
    .map(([key, list]) => groupOf(key, list))
    .sort((one, other) => other.totalMillis - one.totalMillis || other.count - one.count);
}
