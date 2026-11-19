/**
 * Feature: table.rows
 *
 * Lays the documents out as rows: one row per document, one sub-row per element when an array is expanded, the cells
 * of an expanded group across the group where the value is not what the group expects.
 */
import type { Json } from '../../shared/engine-request';
import { isSubdocument, type JsonObject } from '../query/mongosh/ejson';
import { leafCount } from './detect-columns';
import { text } from './text';
import { rowKeyOf, type ColumnNode, type Document, type RowKey } from './types';

/** How many elements of an array are shown as sub-rows for each document. */
export const mostElements = 20;

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
}

/** A document as rows. */
export interface Row {
  /** Its number from the first document of the query, in the column `#`. */
  readonly number: number;
  readonly key: RowKey;
  /** How many sub-rows it covers. */
  readonly height: number;
  readonly cells: readonly Cell[];
}

/** The value at a path from an object, or `undefined` when a segment is absent or a parent is not a sub-document. */
export function valueAt(object: Json, path: readonly string[]): Json | undefined {
  let current: Json = object;
  for (const segment of path) {
    if (!isSubdocument(current) || !Object.hasOwn(current, segment)) {
      return undefined;
    }
    current = current[segment] as Json;
  }
  return current;
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

/**
 * Feature: table.rows
 *
 * The rows of the documents of a page under the columns to draw: each document's number from the first of the query,
 * its height in sub-rows and its cells.
 */
export function rowsOfDocuments(
  documents: readonly Document[],
  columns: readonly ColumnNode[],
  firstNumber: number,
): readonly Row[] {
  return documents.map((document: JsonObject, index) => {
    const height = rowHeight(document, columns);
    return {
      number: firstNumber + index,
      key: rowKeyOf(document, index),
      height,
      cells: cellsOf(columns, { base: document, depth: 0, subRow: 0, height }),
    };
  });
}
