/**
 * Feature: compare.field-diff
 *
 * The fields in which two documents with the same `_id` differ, each with its value on the left and on the right (as
 * canonical Extended JSON, absent where that side lacks the field), the two BSON types when they are the only
 * difference, and the summary the list shows. The order of fields is never a row of a field: two documents that differ
 * only by it give the one row `(field order)`.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue } from '../query/format';
import { bsonType, wrapperType, type JsonObject } from '../query/mongosh/ejson';
import { childPath, comparable, comparedText } from './equality';
import { mostFieldRows, type EqualityOptions } from './types';

/** The path of the row of two documents that differ only by the order of their fields. */
export const fieldOrderPath = '(field order)';

/** One differing field. */
export interface FieldRow {
  /** The path with the index of array elements: `items.1.qty`. */
  readonly path: string;
  readonly left?: Json;
  readonly right?: Json;
  /** The two BSON types, when the values are written the same in relaxed form and differ by type. */
  readonly types?: readonly [string, string];
}

/** The rows, and their summary for the list. */
export interface FieldDifference {
  readonly rows: readonly FieldRow[];
  readonly summary: string;
}

/** Where the walk is: the path shown (with indexes) and the path **Ignore** is matched with (without them). */
interface Where {
  readonly path: string;
  readonly ignorePath: string;
}

/** The names of the BSON types, as the row shows them beside the values. */
function typeName(value: Json): string {
  const type = bsonType(value);
  return type === 'bool' ? 'boolean' : type;
}

/** A value as relaxed Extended JSON writes it: numbers of every type as plain numbers. */
function relaxedText(value: Json): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${(value as readonly Json[]).map(relaxedText).join(',')}]`;
  }
  const object = value as JsonObject;
  const type = wrapperType(object);
  if (type === 'int' || type === 'long' || type === 'double') {
    return String(Number(Object.values(object)[0]));
  }
  if (type !== undefined) {
    return JSON.stringify(object);
  }
  return `{${Object.entries(object)
    .map(([name, item]) => `${JSON.stringify(name)}:${relaxedText(item)}`)
    .join(',')}}`;
}

/** A value as its row shows it when only its type differs: a number of any type as a plain number (`1`). */
export function relaxedValueText(value: Json): string {
  const type =
    typeof value === 'object' && value !== null && !Array.isArray(value) ? wrapperType(value as JsonObject) : undefined;
  return type === 'int' || type === 'long' || type === 'double'
    ? String(Number(Object.values(value as JsonObject)[0]))
    : formattedValue(value, 'one-line');
}

function isDocument(value: Json): value is JsonObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    wrapperType(value as JsonObject) === undefined
  );
}

function wholeRow(left: Json, right: Json, path: string): FieldRow {
  const sameText = relaxedText(left) === relaxedText(right);
  return { path, left, right, ...(sameText ? { types: [typeName(left), typeName(right)] as const } : {}) };
}

class Walk {
  readonly rows: FieldRow[] = [];

  constructor(private readonly options: EqualityOptions) {}

  private isSame(left: Json, right: Json, ignorePath: string): boolean {
    const unordered = { ...this.options, ignoreOrder: true };
    return comparedText(left, unordered, ignorePath) === comparedText(right, unordered, ignorePath);
  }

  values(left: Json, right: Json, where: Where): void {
    if (this.rows.length >= mostFieldRows || this.isSame(left, right, where.ignorePath)) {
      return;
    }
    if (isDocument(left) && isDocument(right)) {
      this.documents(left, right, where);
    } else if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
      const rights = right as readonly Json[];
      (left as readonly Json[]).forEach((item, index) => {
        const path = childPath(where.path, String(index));
        this.values(item, rights[index] ?? null, { path, ignorePath: where.ignorePath });
      });
    } else {
      this.rows.push(wholeRow(left, right, where.path));
    }
  }

  private documents(left: JsonObject, right: JsonObject, where: Where): void {
    const names = [...Object.keys(left), ...Object.keys(right).filter((name) => !Object.hasOwn(left, name))];
    for (const name of names) {
      const ignorePath = childPath(where.ignorePath, name);
      if (this.rows.length >= mostFieldRows || this.options.ignore.includes(ignorePath)) {
        continue;
      }
      const path = childPath(where.path, name);
      const [inLeft, inRight] = [left[name], right[name]];
      if (inRight === undefined) {
        this.rows.push({ path, left: inLeft ?? null });
      } else if (inLeft === undefined) {
        this.rows.push({ path, right: inRight });
      } else {
        this.values(inLeft, inRight, { path, ignorePath });
      }
    }
  }
}

/** The paths of the rows joined by `, `; with more than 4, the first 4 and the number of the others. */
export function fieldsSummary(rows: readonly FieldRow[]): string {
  const paths = rows.map((row) => row.path);
  return paths.length > 4 ? `${paths.slice(0, 4).join(', ')} (+${String(paths.length - 4)})` : paths.join(', ');
}

/** Feature: compare.field-diff — the differing fields of two documents with the options of the comparison. */
export function fieldDiff(left: Json, right: Json, options: EqualityOptions): FieldDifference {
  const walk = new Walk(options);
  walk.values(left, right, { path: '', ignorePath: '' });
  const rows: readonly FieldRow[] =
    walk.rows.length === 0 && comparable(left, options) !== comparable(right, options)
      ? [{ path: fieldOrderPath }]
      : walk.rows.slice(0, mostFieldRows);
  return { rows, summary: fieldsSummary(rows) };
}
