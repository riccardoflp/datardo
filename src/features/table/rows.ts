/**
 * Feature: table.rows
 *
 * Lays the documents out as rows: one row per document, one sub-row per element when an array is expanded, the cells
 * of an expanded group across the group where the value is not what the group expects; and the colors the formatting
 * rules give the rows and the cells (`table.format-table`), each with the line its tooltip adds.
 */
import type { Json } from '../../shared/engine-request';
import { isSubdocument, type JsonObject } from '../query/mongosh/ejson';
import type { FormatRule } from '../../shared/formatting-rules';
import { leafCount } from './detect-columns';
import { colorOfCell, type DocumentFormat, type DrawnColor, type TableFormat } from './format-table';
import { formattingLine } from './parts/rule-summary';
import { mostElements, valueAt } from './parts/values';
import { text } from './text';
import { rowKeyOf, type ColumnNode, type Document, type RowKey } from './types';

export { mostElements, valueAt };

/** What a cell holds: a value, no value (a field the document does not have), the filler of a group, or the elements left out. */
export type CellContent =
  | { readonly kind: 'value'; readonly value: Json }
  | { readonly kind: 'missing' }
  | { readonly kind: 'filler' }
  | { readonly kind: 'more'; readonly count: number };

/** A cell of a row. */
export interface Cell {
  /** The key of its column: a leaf, or a group when the cell is across the whole group. */
  readonly column: string;
  /** How many drawn columns it covers. */
  readonly span: number;
  /** The first sub-row it covers, from 0, and how many. */
  readonly subRow: number;
  readonly height: number;
  readonly content: CellContent;
  /** For a cell of an element of an expanded array: the array and the element. */
  readonly element?: { readonly array: string; readonly index: number };
  /** What the tooltip says before the value, for a value that is not what its group expects. */
  readonly note?: string;
  /** The color a cell rule gives it, over its row's. */
  readonly color?: PaintedColor;
}

/** A color of a row or a cell, with the line its tooltip adds: *Formatting: { status: "failed" } (red)*. */
export interface PaintedColor {
  readonly drawn: DrawnColor;
  readonly line: string;
}

/** The formatting of the page: the colors `table.format-table` gave, and the rules that gave them, for the lines. */
export interface RowsFormatting {
  readonly format: TableFormat;
  readonly rules: readonly FormatRule[];
}

/** A document as rows. */
export interface Row {
  /** Its number from the first document of the query, in the column `#`. */
  readonly number: number;
  readonly key: RowKey;
  /** How many sub-rows it covers. */
  readonly height: number;
  readonly cells: readonly Cell[];
  /** The color a row rule gives every cell of its sub-rows but the row number. */
  readonly color?: PaintedColor;
}

function contentOf(value: Json | undefined): CellContent {
  return value === undefined ? { kind: 'missing' } : { kind: 'value', value };
}

/** How many sub-rows a document needs: one per shown element of its expanded arrays, and one for the elements left out. */
export function rowHeight(document: Document, nodes: readonly ColumnNode[]): number {
  let height = 1;
  for (const node of nodes) {
    if (node.children === undefined) {
      continue;
    }
    const value = valueAt(document, node.path);
    if (node.array && Array.isArray(value) && value.length > 0) {
      height = Math.max(height, Math.min(value.length, mostElements) + (value.length > mostElements ? 1 : 0));
    } else if (isSubdocument(value)) {
      height = Math.max(height, rowHeight(document, node.children));
    }
  }
  return height;
}

/** Where the cells of a part of a row are: the object their paths start from, and the sub-rows they cover. */
interface Where {
  readonly base: Json;
  /** The length of the path of `base` from the document: 0 for the document, that of the array for an element. */
  readonly depth: number;
  readonly subRow: number;
  readonly height: number;
  readonly element?: { readonly array: string; readonly index: number };
}

function across(node: ColumnNode, where: Where, content: CellContent, note?: string): Cell {
  return {
    column: node.key,
    span: leafCount(node),
    subRow: where.subRow,
    height: where.height,
    content,
    ...(where.element === undefined ? {} : { element: where.element }),
    ...(note === undefined || content.kind === 'missing' ? {} : { note }),
  };
}

function elementCells(node: ColumnNode, elements: readonly Json[], where: Where): Cell[] {
  const children = node.children ?? [];
  const shown = elements.slice(0, mostElements);
  const cells = shown.flatMap((element, index): Cell[] => {
    const at: Where = {
      base: element,
      depth: node.path.length,
      subRow: where.subRow + index,
      height: 1,
      element: { array: node.key, index },
    };
    return isSubdocument(element)
      ? cellsOf(children, at)
      : [across(node, at, contentOf(element), text.rows.notSubdocumentElement(node.key))];
  });
  const left = elements.length - shown.length;
  const used = shown.length + (left > 0 ? 1 : 0);
  if (left > 0) {
    cells.push(
      across(node, { ...where, subRow: where.subRow + shown.length, height: 1 }, { kind: 'more', count: left }),
    );
  }
  if (used < where.height) {
    cells.push(
      across(node, { ...where, subRow: where.subRow + used, height: where.height - used }, { kind: 'filler' }),
    );
  }
  return cells;
}

function cellsOf(nodes: readonly ColumnNode[], where: Where): Cell[] {
  return nodes.flatMap((node): Cell[] => {
    const value = valueAt(where.base, node.path.slice(where.depth));
    if (node.children === undefined) {
      return [across(node, where, contentOf(value))];
    }
    if (node.array && node.arrayDepth === undefined && where.element === undefined) {
      return Array.isArray(value) && value.length > 0
        ? elementCells(node, value as readonly Json[], where)
        : [across(node, where, contentOf(value), text.rows.notArray(node.key))];
    }
    return isSubdocument(value)
      ? cellsOf(node.children, where)
      : [across(node, where, contentOf(value), text.rows.notSubdocument(node.key))];
  });
}

function painted(drawn: DrawnColor | undefined, rules: readonly FormatRule[]): PaintedColor | undefined {
  const rule = drawn === undefined ? undefined : rules.find((each) => each.id === drawn.rule);
  return drawn === undefined || rule === undefined ? undefined : { drawn, line: formattingLine(rule, drawn) };
}

function paintedCells(cells: readonly Cell[], format: DocumentFormat, rules: readonly FormatRule[]): readonly Cell[] {
  return cells.map((cell) => {
    const color = painted(colorOfCell(format, cell), rules);
    return color === undefined ? cell : { ...cell, color };
  });
}

/**
 * Feature: table.rows
 *
 * The rows of the documents of a page under the columns to draw: each document's number from the first of the query,
 * its height in sub-rows and its cells; with the formatting of the page, the color of each row and cell.
 */
export function rowsOfDocuments(
  documents: readonly Document[],
  columns: readonly ColumnNode[],
  firstNumber: number,
  formatting?: RowsFormatting,
): readonly Row[] {
  return documents.map((document: JsonObject, index) => {
    const height = rowHeight(document, columns);
    const cells = cellsOf(columns, { base: document, depth: 0, subRow: 0, height });
    const format = formatting?.format.documents[index];
    const rules = formatting?.rules ?? [];
    const color = painted(format?.row, rules);
    return {
      number: firstNumber + index,
      key: rowKeyOf(document, index),
      height,
      cells: format === undefined ? cells : paintedCells(cells, format, rules),
      ...(color === undefined ? {} : { color }),
    };
  });
}
