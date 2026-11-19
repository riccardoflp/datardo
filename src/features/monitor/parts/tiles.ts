/**
 * What the views of the Stats, Replication and Sharding sections return besides their tables: tiles with a label, a
 * value and a smaller line, the tone of a value, the controls that start an Operation, and how a click on a header
 * sorts a table.
 */
import type { Json } from '../../../shared/engine-request';
import type { Failure } from './failure';

/** The color a value takes: the theme's ordinary, warning or danger color. */
export type Tone = 'ordinary' | 'warning' | 'danger';

/** A tile of a section: a label, a value, a smaller line, and the points of its line when it draws one. */
export interface Tile {
  readonly label: string;
  readonly value: string;
  readonly line: string;
  readonly tone: Tone;
  /** The points of the tile's line, from 0 (smallest) to 1 (largest); absent with fewer than 2 points. */
  readonly points?: readonly number[];
}

/** A tile, with the ordinary tone unless given. */
export function tile(label: string, value: string, line: string, tone: Tone = 'ordinary'): Tile {
  return { label, value, line, tone };
}

/** A control that starts an Operation, with its identifier written whole by its caller, and why it is disabled. */
export interface SectionControl {
  readonly label: string;
  readonly element: string;
  readonly feature: string;
  readonly args: Json;
  readonly disabledBecause?: string;
}

/** How a table is sorted: a column, and whether the largest (or Z) comes first. */
export interface TableSort<Column extends string> {
  readonly column: Column;
  readonly descending: boolean;
}

/**
 * The sort after a click on a header: a new column starts with numbers the largest first and names from A; a second
 * click on the same column reverses.
 */
export function nextSort<Column extends string>(
  current: TableSort<Column> | undefined,
  column: Column,
  isName: (column: Column) => boolean,
): TableSort<Column> {
  if (current?.column === column) {
    return { column, descending: !current.descending };
  }
  return { column, descending: !isName(column) };
}

/** Two values compared for a sort: numbers as numbers, texts by their letters, a missing value last. */
export function compareValues(one: number | string | undefined, other: number | string | undefined): number {
  if (one === undefined || other === undefined) {
    return one === other ? 0 : one === undefined ? 1 : -1;
  }
  if (typeof one === 'number' && typeof other === 'number') {
    return one - other;
  }
  return String(one).localeCompare(String(other));
}

/** Rows sorted by a value of each, in the order of the sort; rows without the value stay last. */
export function sortedBy<Row>(
  rows: readonly Row[],
  valueOf: (row: Row) => number | string | undefined,
  descending: boolean,
): readonly Row[] {
  return [...rows].sort((one, other) => {
    const first = valueOf(one);
    const second = valueOf(other);
    if (first === undefined || second === undefined) {
      return compareValues(first, second);
    }
    return descending ? compareValues(second, first) : compareValues(first, second);
  });
}

/** An error line of a part of a section: the server's message. */
export function errorLine(failure: Failure | undefined): string | undefined {
  return failure?.message;
}
