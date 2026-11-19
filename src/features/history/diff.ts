/**
 * Feature: history.diff
 *
 * Says, field by field, what changed from one version to the next, with the mark of an unknown value where one is not
 * known. Sub-documents are compared field by field and arrays of the same length element by element; the order of the
 * fields does not count, every BSON type does: `Int32(1)` and `Double(1)` differ, and since they look the same the row
 * carries their type names. This is the comparison of `compare.equality` with the order of fields ignored, written
 * here until that card is built.
 */
import type { Json } from '../../shared/engine-request';
import { idKey } from './document-writes';
import {
  isRecord,
  isSubDocument,
  isTypedObject,
  isUnknown,
  joinedPath,
  type DiffRow,
  type DiffSide,
  type JsonObject,
  type KnownDocument,
} from './types';

/** The most rows a comparison gives. */
export const mostRows = 200;

const typeNames: Readonly<Record<string, string>> = {
  $numberInt: 'int',
  $numberLong: 'long',
  $numberDouble: 'double',
  $numberDecimal: 'decimal',
  $date: 'date',
  $timestamp: 'timestamp',
  $oid: 'objectId',
  $binary: 'binData',
  $regularExpression: 'regex',
  $symbol: 'symbol',
};

/** The name of the BSON type of a value: `int`, `double`, `string`, `object`. */
export function typeName(value: Json): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (isRecord(value)) {
    const [key] = Object.keys(value);
    return isTypedObject(value) && key !== undefined ? (typeNames[key] ?? 'object') : 'object';
  }
  return typeof value;
}

/** The value with the fields of its sub-documents in order of name, so that their order does not count. */
function sorted(value: Json): Json {
  if (Array.isArray(value)) {
    return (value as readonly Json[]).map(sorted);
  }
  if (!isRecord(value) || isTypedObject(value)) {
    return value;
  }
  const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(keys.map((key) => [key, sorted(value[key] ?? null)]));
}

function isSame(a: Json, b: Json): boolean {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

function hasUnknown(value: Json): boolean {
  if (isUnknown(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return (value as readonly Json[]).some(hasUnknown);
  }
  return isSubDocument(value) && Object.values(value).some(hasUnknown);
}

function side(value: Json | undefined): DiffSide | undefined {
  if (value === undefined) {
    return undefined;
  }
  return isUnknown(value) ? { kind: 'unknown' } : { kind: 'value', value };
}

function row(path: string, before: Json | undefined, after: Json | undefined): DiffRow {
  const left = side(before);
  const right = side(after);
  return {
    path: path === '' ? '(document)' : path,
    ...(left === undefined ? {} : { before: left }),
    ...(right === undefined ? {} : { after: right }),
  };
}

/** The keys of two documents: those of the first, then those only the second has. */
function keysOf(a: JsonObject, b: JsonObject): readonly string[] {
  return [...Object.keys(a), ...Object.keys(b).filter((key) => !(key in a))];
}

/** One field of two sub-documents without unknown values: missing on one side, or compared. */
function compareFields(a: JsonObject, b: JsonObject, key: string, at: { path: string; rows: DiffRow[] }): void {
  const before = a[key];
  const after = b[key];
  if (at.rows.length >= mostRows) {
    return;
  }
  if (before === undefined || after === undefined) {
    at.rows.push(row(at.path, before, after));
    return;
  }
  compareKnown(before, after, at.path, at.rows);
}

/** Two values without unknown values inside, compared as a whole. */
function compareKnown(a: Json, b: Json, path: string, rows: DiffRow[]): void {
  if (rows.length >= mostRows || isSame(a, b)) {
    return;
  }
  if (isSubDocument(a) && isSubDocument(b)) {
    for (const key of keysOf(a, b)) {
      compareFields(a, b, key, { path: joinedPath(path, key), rows });
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    (a as readonly Json[]).forEach((item, index) => {
      compareKnown(item, (b as readonly Json[])[index] ?? null, joinedPath(path, index), rows);
    });
    return;
  }
  const looksSame = idKey(a) === idKey(b);
  rows.push({ ...row(path, a, b), ...(looksSame ? { types: [typeName(a), typeName(b)] as const } : {}) });
}

/** Two values (`undefined` when missing), field by field; unknown values are compared with nothing. */
function compareValues(a: Json | undefined, b: Json | undefined, path: string, rows: DiffRow[]): void {
  if (rows.length >= mostRows || (a === undefined && b === undefined)) {
    return;
  }
  if (a === undefined || b === undefined || isUnknown(a) || isUnknown(b)) {
    if (!(isUnknown(a ?? null) && isUnknown(b ?? null))) {
      rows.push(row(path, a, b));
    }
    return;
  }
  if (!hasUnknown(a) && !hasUnknown(b)) {
    compareKnown(a, b, path, rows);
    return;
  }
  if (isSubDocument(a) && isSubDocument(b)) {
    for (const key of keysOf(a, b)) {
      compareValues(a[key], b[key], joinedPath(path, key), rows);
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    (a as readonly Json[]).forEach((item, index) => {
      compareValues(item, (b as readonly Json[])[index], joinedPath(path, index), rows);
    });
    return;
  }
  rows.push(row(path, a, b));
}

/** Feature: history.diff — the rows of what changed from the version `before` to the version `after`. */
export function versionDiff(before: KnownDocument, after: KnownDocument): readonly DiffRow[] {
  if (after.kind === 'unknown') {
    return [];
  }
  const next: JsonObject = after.kind === 'document' ? after.document : {};
  if (before.kind === 'unknown') {
    return Object.entries(next)
      .filter(([, value]) => !isUnknown(value))
      .slice(0, mostRows)
      .map(([key, value]) => ({ path: key, before: { kind: 'unknown' }, after: { kind: 'value', value } }));
  }
  const rows: DiffRow[] = [];
  compareValues(before.kind === 'document' ? before.document : {}, next, '', rows);
  return rows;
}
