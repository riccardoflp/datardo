/**
 * What the grid of documents is drawn from, worked out from the columns to draw (`table.layout`) and the rows
 * (`table.rows`): the header rows with their group headings, the place of each column for the keys
 * (`table.navigate`), the widths of the columns and the left of the pinned ones, and the color of each kind of value.
 */
import { cellOfValue, type CellKind } from '../../features/table/cell-text';
import { leafCount, leaves, type Leaf } from '../../features/table/detect-columns';
import { columnWidth } from '../../features/table/layout';
import type { Position } from '../../features/table/navigate';
import { valueAt } from '../../features/table/rows';
import type { ColumnLayout, ColumnNode, Document } from '../../features/table/types';

/** The height of a sub-row, in px. */
export const subRowHeight = 28;

/** A heading of the header rows: a column, or the group heading of an expanded one. */
export interface HeaderCell {
  readonly node: ColumnNode;
  /** The place of its first column for the keys: 1 for the first column after `#`. */
  readonly column: number;
  readonly colSpan: number;
  readonly rowSpan: number;
  readonly group: boolean;
}

function depthOf(nodes: readonly ColumnNode[]): number {
  return nodes.reduce((most, node) => Math.max(most, node.children === undefined ? 1 : 1 + depthOf(node.children)), 0);
}

/** The header rows: one per level of expanded groups; a column that is not in a group spans the rows below it. */
export function headerRows(columns: readonly ColumnNode[]): readonly (readonly HeaderCell[])[] {
  const depth = Math.max(1, depthOf(columns));
  const rows: HeaderCell[][] = Array.from({ length: depth }, () => []);
  let column = 1;
  const walk = (nodes: readonly ColumnNode[], level: number): void => {
    for (const node of nodes) {
      const group = node.children !== undefined;
      rows[level]?.push({ node, column, colSpan: leafCount(node), rowSpan: group ? 1 : depth - level, group });
      if (node.children === undefined) {
        column += 1;
      } else {
        walk(node.children, level + 1);
      }
    }
  };
  walk(columns, 0);
  return rows;
}

/** The place for the keys of each column and group key: the first leaf it covers, from 1. */
export function columnPlaces(drawn: readonly Leaf[]): ReadonlyMap<string, number> {
  const places = new Map<string, number>();
  drawn.forEach((leaf, index) => {
    places.set(leaf.node.key, index + 1);
    for (const group of leaf.starts) {
      places.set(group, index + 1);
    }
  });
  return places;
}

/** The path of the expanded array a column is in, `items` for `items.sku`. */
export function withinOf(node: ColumnNode): string | undefined {
  return node.arrayDepth === undefined ? undefined : node.path.slice(0, node.arrayDepth).join('.');
}

const narrowest = 64;
const widest = 360;
const characterWidth = 7.5;
const padding = 28;
/** How many documents the automatic width looks at. */
const measured = 100;

/** The automatic width of a leaf: as wide as its header and its texts in the page, within bounds. */
export function automaticWidth(node: ColumnNode, documents: readonly Document[]): number {
  const name = node.path[node.path.length - 1] ?? node.key;
  let characters = name.length + 3;
  for (const document of documents.slice(0, measured)) {
    const value = valueAt(document, node.path);
    if (value !== undefined) {
      characters = Math.max(characters, Math.min(48, cellOfValue(value).text.length));
    }
  }
  return Math.round(Math.min(widest, Math.max(narrowest, characters * characterWidth + padding)));
}

/** The widths of the drawn leaves: those set by hand, the automatic ones for the others. */
export function leafWidths(drawn: readonly Leaf[], layout: ColumnLayout, documents: readonly Document[]): number[] {
  return drawn.map((leaf) => columnWidth(layout, leaf.node.key) ?? automaticWidth(leaf.node, documents));
}

/** The width of the row number column, for the largest number of the page. */
export function numberWidth(lastNumber: number): number {
  return Math.max(48, String(lastNumber).length * 8 + 28);
}

/** The left of each pinned leaf, after the row number column; `undefined` for a leaf that scrolls. */
export function pinnedLefts(widths: readonly number[], pinned: number, first: number): readonly (number | undefined)[] {
  let left = first;
  return widths.map((width, index) => {
    if (index >= pinned) {
      return undefined;
    }
    const at = left;
    left += width;
    return at;
  });
}

/** The leaves of the columns to draw. */
export function drawnLeaves(columns: readonly ColumnNode[]): readonly Leaf[] {
  return leaves(columns);
}

/** The first sub-row of each document from the top of the rows, and the number of sub-rows of the page. */
export function rowOffsets(heights: readonly number[]): {
  readonly offsets: readonly number[];
  readonly total: number;
} {
  let total = 0;
  const offsets = heights.map((height) => {
    const at = total;
    total += height;
    return at;
  });
  return { offsets, total };
}

/** The `data-pos` of the element of a position: `h:2` for a header, `c:3:0:2` for a cell. */
export function positionKey(position: Position): string {
  return position.at === 'header'
    ? `h:${String(position.column)}`
    : `c:${String(position.row)}:${String(position.subRow)}:${String(position.column)}`;
}

/** The syntax role whose color a kind of value takes, as in an editor (`query.highlight`). */
export function syntaxOf(kind: CellKind): string | undefined {
  switch (kind) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
    case 'null':
      return 'bool';
    case 'id':
    case 'special':
      return 'oid';
    case 'date':
      return 'date';
    case 'regex':
      return 'regex';
    case 'array':
    case 'subdocument':
    case 'missing':
      return undefined;
  }
}
