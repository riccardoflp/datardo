/**
 * Feature: codegen.python
 *
 * The query or the pipeline as code for PyMongo: the declarations of `query`, `projection`, `sort` (a list of pairs)
 * or `pipeline`, and the cursor from a `MongoClient` named `client`; a full program imports what its values need,
 * connects, and prints each document.
 */
import type { Json } from '../../shared/engine-request';
import { laidOut, quoted } from './layout';
import { defaultUri } from './nodejs';
import { codeValue, type CodeQuery, type CodeTarget, type CodeValue } from './source';

const indent = '    ';
const dateImport = 'from datetime import datetime, timezone';
const binaryImport = 'from bson.binary import Binary';

function using(needs: Set<string>, line: string, written: string): string {
  needs.add(line);
  return written;
}

function numberText(value: number): string {
  if (Number.isNaN(value)) {
    return 'float("nan")';
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? 'float("inf")' : 'float("-inf")';
  }
  return String(value);
}

/** A date: the time only when it is not midnight UTC, the microseconds only when it has milliseconds. */
function dateText(time: number): string {
  const date = new Date(time);
  const parts = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  const milliseconds = date.getUTCMilliseconds();
  if (date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0 || date.getUTCSeconds() !== 0 || milliseconds !== 0) {
    parts.push(date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
  }
  if (milliseconds !== 0) {
    parts.push(milliseconds * 1000);
  }
  return `datetime(${parts.join(', ')}, tzinfo=timezone.utc)`;
}

function scalarText(value: Exclude<CodeValue, { kind: 'array' | 'document' }>, needs: Set<string>): string {
  switch (value.kind) {
    case 'null':
    case 'undefined':
      return 'None';
    case 'boolean':
      return value.value ? 'True' : 'False';
    case 'string':
    case 'symbol':
      return quoted(value.value);
    case 'number':
      return numberText(value.value);
    case 'long':
      return using(needs, 'from bson.int64 import Int64', `Int64(${value.digits})`);
    case 'decimal':
      return using(needs, 'from bson.decimal128 import Decimal128', `Decimal128(${quoted(value.digits)})`);
    case 'object-id':
      return using(needs, 'from bson import ObjectId', `ObjectId(${quoted(value.hex)})`);
    case 'date':
      return using(needs, dateImport, dateText(value.time));
    case 'regex':
      return using(needs, 'from bson.regex import Regex', `Regex(${quoted(value.pattern)}, ${quoted(value.options)})`);
    case 'uuid':
      needs.add('from uuid import UUID');
      return using(needs, binaryImport, `Binary.from_uuid(UUID(${quoted(value.text)}))`);
    case 'binary':
      needs.add('import base64');
      return using(needs, binaryImport, `Binary(base64.b64decode(${quoted(value.base64)}), ${String(value.subtype)})`);
    case 'timestamp':
      return using(needs, 'from bson.timestamp import Timestamp', `Timestamp(${String(value.t)}, ${String(value.i)})`);
    case 'min-key':
      return using(needs, 'from bson.min_key import MinKey', 'MinKey()');
    case 'max-key':
      return using(needs, 'from bson.max_key import MaxKey', 'MaxKey()');
    case 'code':
      return using(needs, 'from bson.code import Code', `Code(${quoted(value.code)})`);
  }
}

/** A value as Python code, at a level of indentation; the import lines it needs are added to `needs`. */
export function pythonValue(json: Json, level: number, needs: Set<string>): string {
  const value = codeValue(json);
  if (value.kind === 'array') {
    return laidOut(
      value.items.map((item) => pythonValue(item, level + 1, needs)),
      level,
      { indent, open: '[', close: ']' },
    );
  }
  if (value.kind === 'document') {
    return laidOut(
      value.entries.map(([key, item]) => `${quoted(key)}: ${pythonValue(item, level + 1, needs)}`),
      level,
      { indent, open: '{', close: '}' },
    );
  }
  return scalarText(value, needs);
}

/** A sort as PyMongo's list of pairs, in the order of its fields: `[("createdAt", -1)]`. */
function sortList(sort: Readonly<Record<string, Json>>, needs: Set<string>): string {
  const pairs = Object.entries(sort).map(([key, value]) => `(${quoted(key)}, ${pythonValue(value, 1, needs)})`);
  return laidOut(pairs, 0, { indent, open: '[', close: ']' });
}

function linesOf(query: CodeQuery, collection: string, needs: Set<string>): { declarations: string[]; call: string } {
  if (query.kind === 'aggregate') {
    return {
      declarations: [`pipeline = ${pythonValue(query.pipeline, 0, needs)}`],
      call: `${collection}.aggregate(pipeline)`,
    };
  }
  const declarations = [`query = ${pythonValue(query.filter, 0, needs)}`];
  const args = ['query'];
  if (query.projection !== undefined) {
    declarations.push(`projection = ${pythonValue(query.projection, 0, needs)}`);
    args.push('projection');
  }
  if (query.sort !== undefined) {
    declarations.push(`sort = ${sortList(query.sort, needs)}`);
    args.push('sort=sort');
  }
  return { declarations, call: `${collection}.find(${args.join(', ')})` };
}

/** Code units in order, `import` lines before `from` lines. */
function importOrder(a: string, b: string): number {
  const kind = Number(a.startsWith('from')) - Number(b.startsWith('from'));
  return kind !== 0 ? kind : a < b ? -1 : a > b ? 1 : 0;
}

const standardLibrary = /^(import base64|from (datetime|uuid) )/u;

/** Feature: codegen.python — the lines, or the whole program, for PyMongo. */
export function pythonCode(query: CodeQuery, target: CodeTarget): string {
  const needs = new Set<string>();
  const collection = target.program ? 'collection' : `client[${quoted(target.database)}][${quoted(target.collection)}]`;
  const { declarations, call } = linesOf(query, collection, needs);
  if (!target.program) {
    return `${declarations.join('\n')}\n\ncursor = ${call}\n`;
  }
  const imports = [...needs];
  const standard = imports.filter((line) => standardLibrary.test(line)).sort(importOrder);
  const driver = imports.filter((line) => !standardLibrary.test(line)).sort(importOrder);
  return [
    'import os',
    ...standard,
    '',
    'from pymongo import MongoClient',
    ...driver,
    '',
    `client = MongoClient(os.environ.get("MONGODB_URI", ${quoted(defaultUri)}))`,
    `collection = client[${quoted(target.database)}][${quoted(target.collection)}]`,
    '',
    ...declarations,
    '',
    `for doc in ${call}:`,
    '    print(doc)',
    '',
  ].join('\n');
}
