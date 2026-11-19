/**
 * Feature: transfer.csv-write
 *
 * How documents become the rows and cells of a CSV export, the same way the table shows them: one column per leaf of
 * the table's columns, one row per document, and one row per element of an expanded array, the document's other
 * values repeated on each of those rows.
 */
import { isPlainObject, isSubdocument, isWrapper } from './types';

/** A column of the table (`table.columns`): its path, its dotted key, and its columns when it is expanded. */
export interface CsvColumn {
  readonly path: readonly string[];
  readonly key: string;
  /** Some document has an array of sub-documents here: expanded, it gives one row per element. */
  readonly array: boolean;
  readonly children?: readonly CsvColumn[];
}

const missing = Symbol('missing');

/** The value at `path`, or `missing` when a step is absent or its parent is not a sub-document. */
function valueAt(source: unknown, path: readonly string[]): unknown {
  let current = source;
  for (const step of path) {
    if (!isSubdocument(current) || !(step in current)) {
      return missing;
    }
    current = current[step];
  }
  return current;
}

/** The leaf columns, in order: a column that is not expanded is one leaf. */
export function leafColumns(columns: readonly CsvColumn[]): readonly CsvColumn[] {
  return columns.flatMap((column) => (column.children === undefined ? [column] : leafColumns(column.children)));
}

/** The columns of documents with nothing expanded: the top-level fields as they come, `_id` first. */
export function plainColumns(documents: readonly Readonly<Record<string, unknown>>[]): readonly CsvColumn[] {
  const keys = [...new Set(documents.flatMap((document) => Object.keys(document)))];
  const ordered = keys.includes('_id') ? ['_id', ...keys.filter((key) => key !== '_id')] : keys;
  return ordered.map((key) => ({ path: [key], key, array: false }));
}

interface Placed {
  /** The row of an array's element, or `null` for a value of the document, repeated on every row. */
  readonly at: number | null;
  readonly column: number;
  readonly value: unknown;
}

/** Where each column's first leaf is. */
function firstLeaves(columns: readonly CsvColumn[]): Map<CsvColumn, number> {
  const first = new Map<CsvColumn, number>();
  let count = 0;
  const index = (nodes: readonly CsvColumn[]): void => {
    for (const node of nodes) {
      first.set(node, count);
      if (node.children === undefined) {
        count += 1;
      } else {
        index(node.children);
      }
    }
  };
  index(columns);
  return first;
}

/** The values of a document, each at its column and at its row when it belongs to an element of an expanded array. */
function placedValues(document: unknown, columns: readonly CsvColumn[], first: Map<CsvColumn, number>): Placed[] {
  const placed: Placed[] = [];
  const walk = (nodes: readonly CsvColumn[], source: unknown, base: number, at: number | null): void => {
    for (const node of nodes) {
      const value = valueAt(source, node.path.slice(base));
      const children = node.children;
      if (children !== undefined && isSubdocument(value)) {
        walk(children, source, base, at);
      } else if (children !== undefined && node.array && at === null && Array.isArray(value) && value.length > 0) {
        value.forEach((element: unknown, index) => {
          if (isSubdocument(element)) {
            walk(children, element, node.path.length, index);
          } else {
            placed.push({ at: index, column: first.get(node) ?? 0, value: element });
          }
        });
        placed.push({ at: value.length - 1, column: -1, value: missing });
      } else if (!(children !== undefined && node.array && Array.isArray(value) && value.length === 0)) {
        placed.push({ at, column: first.get(node) ?? 0, value });
      }
    }
  };
  walk(columns, document, 0, null);
  return placed;
}

/** The header, then the rows of each document: one, or one per element of its expanded arrays. */
export function csvTable(
  documents: readonly Readonly<Record<string, unknown>>[],
  columns: readonly CsvColumn[],
): string[][] {
  const leaves = leafColumns(columns);
  const first = firstLeaves(columns);
  const table: string[][] = [leaves.map((leaf) => leaf.key)];
  for (const document of documents) {
    const placed = placedValues(document, columns, first);
    const count = placed.reduce((most, each) => Math.max(most, (each.at ?? 0) + 1), 1);
    const rows = Array.from({ length: count }, () => leaves.map(() => ''));
    for (const { at, column, value } of placed.filter((each) => each.column >= 0)) {
      const cell = csvValue(value);
      for (const target of at === null ? rows : rows.slice(at, at + 1)) {
        target[column] = cell;
      }
    }
    table.push(...rows);
  }
  return table;
}

const innerText = new Set(['$oid', '$numberDecimal', '$numberLong', '$numberInt', '$numberDouble']);

/** A date of Extended JSON as ISO text: given as text, or as `$numberLong` milliseconds. */
function dateText(inner: unknown, whole: unknown): string {
  if (typeof inner === 'string') {
    return inner;
  }
  const milliseconds = Number(isPlainObject(inner) ? inner['$numberLong'] : Number.NaN);
  return Number.isFinite(milliseconds) && Math.abs(milliseconds) <= 8.64e15
    ? new Date(milliseconds).toISOString()
    : JSON.stringify(whole);
}

/** The text of a cell for a value of relaxed Extended JSON, as a spreadsheet reads it. */
export function csvValue(value: unknown): string {
  if (value === missing || value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (isWrapper(value)) {
    const [key, inner] = Object.entries(value)[0] ?? ['', undefined];
    if (innerText.has(key)) {
      return String(inner);
    }
    if (key === '$date') {
      return dateText(inner, value);
    }
  }
  return JSON.stringify(value);
}

/** One cell as CSV: quoted when it holds `"`, `,`, CR or LF, or starts or ends with white space. */
function csvCell(cell: string): string {
  return /[",\r\n]|^\s|\s$/u.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

/** The text of a table: cells joined by `,`, every row ending with CRLF. */
export function toCsv(table: readonly (readonly string[])[]): string {
  return table.map((row) => `${row.map(csvCell).join(',')}\r\n`).join('');
}
