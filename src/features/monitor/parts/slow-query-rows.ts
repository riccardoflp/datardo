/**
 * The rows of the Slow queries section (`monitor.slow-queries`): one per group under **By query**, one per operation
 * under **All**, with their colors, the filter that keeps them and the sort of the groups.
 */
import type { SlowQueryGroup } from '../group-slow-queries';
import type { SlowQuery } from '../types';
import { slowText } from './slow-text';
import { nextSort, sortedBy, type TableSort, type Tone } from './tiles';
import { countText, dateTimeText, holdsWithoutCase } from './units';

/** From how many milliseconds a time takes the warning color. */
export const warningMillis = 100;
/** From how many milliseconds a time takes the danger color. */
export const dangerMillis = 1000;
/** From how many documents examined per document returned **Examined / returned** takes the warning color. */
export const warningExaminedPerReturned = 100;

/** The columns of **By query** a click sorts by. */
export type GroupColumn = 'count' | 'total' | 'average' | 'max' | 'examined' | 'last';

/** The sort the groups start with: **Total ms**, the largest first. */
export const firstGroupSort: TableSort<GroupColumn> = { column: 'total', descending: true };

/** The sort after a click on a header of **By query**: the largest first, then the smallest. */
export function nextGroupSort(
  current: TableSort<GroupColumn> | undefined,
  column: GroupColumn,
): TableSort<GroupColumn> {
  return nextSort(current, column, () => false);
}

/** A time in milliseconds, with its color. */
export interface TimeCell {
  readonly text: string;
  readonly tone: Tone;
}

/** A time in milliseconds, whole, with the warning color from 100 ms and the danger color from 1,000 ms. */
export function millisCell(millis: number): TimeCell {
  const tone: Tone = millis >= dangerMillis ? 'danger' : millis >= warningMillis ? 'warning' : 'ordinary';
  return { text: countText(Math.round(millis)), tone };
}

/** How many documents are examined per document returned, whole. */
export function examinedRatio(docsExamined: number, returned: number): number {
  return Math.round(docsExamined / Math.max(returned, 1));
}

/** A row of **By query**. */
export interface GroupRow {
  readonly key: string;
  readonly count: { readonly text: string; readonly tooltip?: string };
  readonly total: TimeCell;
  readonly average: TimeCell;
  readonly max: TimeCell;
  readonly examined: { readonly text: string; readonly tone: Tone; readonly tooltip: string };
  /** The kind, with *An index could help* as its flag when the group has a suggestion. */
  readonly op: { readonly text: string; readonly flag?: string };
  readonly namespace: string;
  readonly query: string;
  readonly plan: { readonly text: string; readonly highlighted: boolean };
  readonly last: string;
}

/** The row of a group. */
export function groupRow(group: SlowQueryGroup): GroupRow {
  const ratio = examinedRatio(group.docsExamined, group.returned);
  return {
    key: group.key,
    count: {
      text: countText(group.count),
      ...(group.getMores === 0 ? {} : { tooltip: slowText.getMores(group.getMores) }),
    },
    total: millisCell(group.totalMillis),
    average: millisCell(group.averageMillis),
    max: millisCell(group.maxMillis),
    examined: {
      text: `${countText(group.docsExamined)} / ${countText(group.returned)}`,
      tone: ratio >= warningExaminedPerReturned ? 'warning' : 'ordinary',
      tooltip: slowText.examinedPerReturned(countText(ratio)),
    },
    op: { text: group.kind, ...(group.suggestion === undefined ? {} : { flag: slowText.indexCouldHelp }) },
    namespace: group.namespace,
    query: group.shape,
    plan: { text: group.plans.join(', '), highlighted: group.collectionScan },
    last: dateTimeText(group.last),
  };
}

/** A row of **All**. */
export interface OperationRow {
  /** The place of the operation in what was read: what the selection keeps. */
  readonly index: number;
  readonly time: string;
  readonly op: string;
  readonly namespace: string;
  readonly ms: TimeCell;
  readonly docsExamined: string;
  readonly keysExamined: string;
  readonly returned: string;
  readonly plan: { readonly text: string; readonly highlighted: boolean };
  readonly command: string;
}

function optionalCount(value: number | undefined): string {
  return value === undefined ? '' : countText(value);
}

/** The row of an operation, at its place in what was read. */
export function operationRow(operation: SlowQuery, index: number): OperationRow {
  const plan = operation.plan ?? '';
  return {
    index,
    time: dateTimeText(operation.time),
    op: operation.getMore ? `${operation.kind} ${slowText.getMoreMark}` : operation.kind,
    namespace: operation.namespace,
    ms: millisCell(operation.millis),
    docsExamined: optionalCount(operation.docsExamined),
    keysExamined: optionalCount(operation.keysExamined),
    returned: optionalCount(operation.returned),
    plan: { text: plan, highlighted: plan.includes('COLLSCAN') },
    command: operation.command,
  };
}

function holdsAny(texts: readonly (string | undefined)[], filter: string): boolean {
  const needle = filter.trim();
  return needle === '' || texts.some((each) => each !== undefined && holdsWithoutCase(each, needle));
}

/** Whether a group is kept by the filter: its namespace, kind, plans or shape hold the text, whatever the case. */
export function groupMatches(group: SlowQueryGroup, filter: string): boolean {
  return holdsAny([group.namespace, group.kind, group.shape, ...group.plans], filter);
}

/** Whether an operation is kept by the filter: its namespace, kind, plan, shape or command hold the text. */
export function operationMatches(operation: SlowQuery, filter: string): boolean {
  return holdsAny([operation.namespace, operation.kind, operation.plan, operation.shape, operation.command], filter);
}

function groupValue(group: SlowQueryGroup, column: GroupColumn): number {
  switch (column) {
    case 'count':
      return group.count;
    case 'total':
      return group.totalMillis;
    case 'average':
      return group.averageMillis;
    case 'max':
      return group.maxMillis;
    case 'examined':
      return group.docsExamined / Math.max(group.returned, 1);
    case 'last':
      return group.last;
  }
}

/** The groups in the order of a sort. */
export function sortedGroups(
  groups: readonly SlowQueryGroup[],
  sort: TableSort<GroupColumn>,
): readonly SlowQueryGroup[] {
  return sortedBy(groups, (group) => groupValue(group, sort.column), sort.descending);
}
