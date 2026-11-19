/**
 * Documents as CSV with the columns drawn (`table.copy-text`), ported from Mongoster's `csvTable`, `csvValue` and
 * `toCsv`: one line per document, or one per element of its expanded arrays.
 */
import type { Json } from '../../../shared/engine-request';
import { bsonType, isSubdocument, objectField, textOfJson } from '../../query/mongosh/ejson';
import { leaves } from '../detect-columns';
import { valueAt } from '../rows';
import type { ColumnNode, Document } from '../types';
import { isoOfDate, plainValue } from './plain';

/** The text of a value in a field of CSV. */
export function csvValue(value: Json | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  switch (bsonType(value)) {
    case 'objectId':
      return textOfJson(objectField(value, '$oid'));
    case 'int':
    case 'long':
    case 'double':
    case 'decimal':
      return String(Object.values(value as object)[0]);
    case 'date':
      return isoOfDate(value) ?? JSON.stringify(plainValue(value));
    case 'undefined':
      return '';
    case 'array':
    case 'binData':
    case 'bool':
    case 'dbPointer':
    case 'javascript':
    case 'javascriptWithScope':
    case 'maxKey':
    case 'minKey':
    case 'null':
    case 'object':
    case 'regex':
    case 'string':
    case 'symbol':
    case 'timestamp':
      return JSON.stringify(plainValue(value));
  }
}

interface Placed {
  /** The element of an expanded array, or `null` for a value of the document, repeated on each of its lines. */
  readonly at: number | null;
  readonly column: number;
  readonly value: Json | undefined;
}

function firstLeaves(columns: readonly ColumnNode[]): Map<ColumnNode, number> {
  const first = new Map<ColumnNode, number>();
  let next = 0;
  const visit = (nodes: readonly ColumnNode[]): void => {
    for (const node of nodes) {
      first.set(node, next);
      if (node.children === undefined) {
        next += 1;
      } else {
        visit(node.children);
      }
    }
  };
  visit(columns);
  return first;
}

function placedValues(
  document: Document,
  columns: readonly ColumnNode[],
  first: ReadonlyMap<ColumnNode, number>,
): { readonly values: Placed[]; readonly lines: number } {
  const values: Placed[] = [];
  let lines = 1;
  const walk = (nodes: readonly ColumnNode[], source: Json, depth: number, at: number | null): void => {
    for (const node of nodes) {
      const value = valueAt(source, node.path.slice(depth));
      const column = first.get(node) ?? 0;
      if (node.children !== undefined && isSubdocument(value)) {
        walk(node.children, source, depth, at);
      } else if (node.children !== undefined && node.array && at === null && Array.isArray(value) && value.length > 0) {
        const children = node.children;
        (value as readonly Json[]).forEach((element, index) => {
          lines = Math.max(lines, index + 1);
          if (isSubdocument(element)) {
            walk(children, element, node.path.length, index);
          } else {
            values.push({ at: index, column, value: element });
          }
        });
      } else {
        values.push({ at, column, value });
      }
    }
  };
  walk(columns, document, 0, null);
  return { values, lines };
}

/** The header and the lines of documents under the columns drawn: every element of an expanded array, past the twentieth too. */
export function csvTable(documents: readonly Document[], columns: readonly ColumnNode[]): string[][] {
  const drawn = leaves(columns);
  const first = firstLeaves(columns);
  const table: string[][] = [drawn.map((leaf) => leaf.node.key)];
  for (const document of documents) {
    const { values, lines } = placedValues(document, columns, first);
    const rows = Array.from({ length: lines }, () => drawn.map(() => ''));
    for (const { at, column, value } of values) {
      const written = csvValue(value);
      rows.forEach((row, index) => {
        if (at === null || at === index) {
          row[column] = written;
        }
      });
    }
    table.push(...rows);
  }
  return table;
}

/** The text of a table as CSV: a field with a comma, a quote, a line break or a space at an end in quotes; CR LF after every line. */
export function csvText(table: readonly (readonly string[])[]): string {
  const field = (written: string): string =>
    /[",\r\n]|^\s|\s$/.test(written) ? `"${written.replace(/"/g, '""')}"` : written;
  return table.map((row) => row.map(field).join(',')).join('\r\n') + '\r\n';
}
