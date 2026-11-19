/**
 * Feature: key.sort
 *
 * Orders the rows of the keys tab by a column. Keys arrive in scan order, so a sort is always among the keys loaded
 * so far: nothing but the loaded rows is ever sorted.
 */
import type { KeyName, KeyType } from './types';
import { text } from './text';

/** A column of the keys tab a sort can use. */
export type SortColumn = 'key' | 'type' | 'expiry' | 'size';

/** The direction of a sort. */
export type SortDirection = 'ascending' | 'descending';

/** How the rows are sorted: by a column and a direction, or in scan order. */
export type KeySort = { readonly column: SortColumn; readonly direction: SortDirection } | undefined;

/** A row loaded, with what `key.details` read of it. */
export interface SortableRow {
  readonly name: KeyName;
  readonly type?: KeyType;
  /** The date of expiry in milliseconds; `null` for a persistent key; absent while not read. */
  readonly expiresAt?: number | null;
  /** The bytes `MEMORY USAGE` answered; absent while not read or when the server does not say. */
  readonly size?: number;
  readonly gone?: boolean;
}

/** Sorting by **Expiry** or **Size** is offered up to this many loaded keys (Datardo's choice). */
export const mostSortedByDetails = 10_000;

/** The commands of a pipeline that reads the details of every loaded key for a sort (Datardo's choice). */
export const sortPipeline = 500;

/** Bytes compared one by one, so that `Z` (5a) comes before `a` (61). */
export function compareBytes(one: KeyName, other: KeyName): number {
  const length = Math.min(one.length, other.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (one[index] ?? 0) - (other[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return one.length - other.length;
}

function compareTypes(one: SortableRow, other: SortableRow): number {
  const a = one.type ?? '';
  const b = other.type ?? '';
  return a < b ? -1 : a > b ? 1 : compareBytes(one.name, other.name);
}

/** Expiry: persistent keys after every date when ascending, before every date when descending. */
function expiryRank(row: SortableRow): number {
  return row.expiresAt === null || row.expiresAt === undefined ? Number.MAX_VALUE : row.expiresAt;
}

function compareBy(column: SortColumn, one: SortableRow, other: SortableRow): number {
  switch (column) {
    case 'key':
      return compareBytes(one.name, other.name);
    case 'type':
      return compareTypes(one, other);
    case 'expiry':
      return expiryRank(one) - expiryRank(other);
    case 'size':
      return (one.size ?? 0) - (other.size ?? 0);
  }
}

/** Rows that sort after the others in either direction: gone, and those whose detail was not read or not given. */
function isLast(row: SortableRow, column: SortColumn): boolean {
  return (
    row.gone === true ||
    (column === 'size' && row.size === undefined) ||
    (column === 'expiry' && row.expiresAt === undefined)
  );
}

/**
 * Feature: key.sort — the rows in order: in the order they arrived with no column; otherwise by the column, rows
 * marked **gone** last in either direction, equal rows in their order of arrival.
 */
export function sortedKeys<Row extends SortableRow>(
  rows: readonly Row[],
  column: SortColumn | undefined,
  direction: SortDirection,
): readonly Row[] {
  if (column === undefined) {
    return rows;
  }
  const sign = direction === 'ascending' ? 1 : -1;
  return rows
    .map((row, arrival) => ({ row, arrival }))
    .sort((one, other) => {
      const last = Number(isLast(one.row, column)) - Number(isLast(other.row, column));
      if (last !== 0) {
        return last;
      }
      return sign * compareBy(column, one.row, other.row) || one.arrival - other.arrival;
    })
    .map(({ row }) => row);
}

/** A click on a header: ascending, descending, then scan order again. */
export function sortAfterClick(sort: KeySort, column: SortColumn): KeySort {
  if (sort?.column !== column) {
    return { column, direction: 'ascending' };
  }
  return sort.direction === 'ascending' ? { column, direction: 'descending' } : undefined;
}

/** Whether a column sorts with this many keys loaded; when it does not, its header's tooltip says why. */
export function headerSorts(
  column: SortColumn,
  loaded: number,
): { readonly sorts: boolean; readonly tooltip?: string } {
  return (column === 'expiry' || column === 'size') && loaded > mostSortedByDetails
    ? { sorts: false, tooltip: text.sort.tooMany }
    : { sorts: true };
}

/** What the toolbar says while a sort is among the keys of a scan not complete; nothing otherwise. */
export function sortNotice(sort: KeySort, loaded: number, complete: boolean): string | undefined {
  return sort === undefined || complete ? undefined : text.sort.amongLoaded(loaded);
}

/** The loaded keys whose details a sort by **Expiry** or **Size** still needs, in pipelines of 500 commands. */
export function detailsToRead<Row extends SortableRow>(
  rows: readonly Row[],
  column: SortColumn,
): readonly (readonly Row[])[] {
  if (column !== 'expiry' && column !== 'size') {
    return [];
  }
  const unread = rows.filter((row) => row.gone !== true && (row.expiresAt === undefined || row.size === undefined));
  const perPipeline = sortPipeline / 2;
  const batches: Row[][] = [];
  for (let start = 0; start < unread.length; start += perPipeline) {
    batches.push(unread.slice(start, start + perPipeline));
  }
  return batches;
}
