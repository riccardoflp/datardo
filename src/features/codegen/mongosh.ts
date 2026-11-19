/**
 * Feature: codegen.mongosh
 *
 * The query or the pipeline as a statement of mongosh: `db.getCollection("orders").find(…)`, the values in mongosh
 * syntax laid out in 80 columns; a full program says the database first with `use("shop");`.
 */
import type { Json } from '../../shared/engine-request';
import { laidOut, quoted } from './layout';
import { codeValue, type CodeQuery, type CodeTarget, type CodeValue } from './source';

const indent = '  ';

/** A key as mongosh writes it: without quotes when it is an identifier. */
export function keyText(key: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(key) ? key : quoted(key);
}

/** A number as JavaScript writes it: `NaN`, `Infinity`, `-Infinity` for the special ones. */
export function javascriptNumber(value: number): string {
  if (Number.isNaN(value)) {
    return 'NaN';
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? 'Infinity' : '-Infinity';
  }
  return String(value);
}

/** A regular expression's pattern as the body of a `/…/` literal: each `/` escaped, its escapes kept. */
export function escapedSlashes(pattern: string): string {
  return pattern.replace(/\\[\s\S]|\//gu, (match) => (match === '/' ? '\\/' : match));
}

/** A date as its text of ISO 8601 in UTC, to the millisecond. */
export function isoText(time: number): string {
  return new Date(time).toISOString();
}

function scalarText(value: Exclude<CodeValue, { kind: 'array' | 'document' }>): string {
  switch (value.kind) {
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'boolean':
      return String(value.value);
    case 'string':
    case 'symbol':
      return quoted(value.value);
    case 'number':
      return javascriptNumber(value.value);
    case 'long':
      return `NumberLong(${quoted(value.digits)})`;
    case 'decimal':
      return `NumberDecimal(${quoted(value.digits)})`;
    case 'object-id':
      return `ObjectId(${quoted(value.hex)})`;
    case 'date':
      return `ISODate(${quoted(isoText(value.time))})`;
    case 'regex':
      return `/${escapedSlashes(value.pattern)}/${value.options}`;
    case 'uuid':
      return `UUID(${quoted(value.text)})`;
    case 'binary':
      return `BinData(${String(value.subtype)}, ${quoted(value.base64)})`;
    case 'timestamp':
      return `Timestamp({ t: ${String(value.t)}, i: ${String(value.i)} })`;
    case 'min-key':
      return 'MinKey()';
    case 'max-key':
      return 'MaxKey()';
    case 'code':
      return `Code(${quoted(value.code)})`;
  }
}

/** A value in mongosh syntax, at a level of indentation. */
export function mongoshValue(json: Json, level = 0): string {
  const value = codeValue(json);
  if (value.kind === 'array') {
    return laidOut(
      value.items.map((item) => mongoshValue(item, level + 1)),
      level,
      { indent, open: '[', close: ']' },
    );
  }
  if (value.kind === 'document') {
    return laidOut(
      value.entries.map(([key, item]) => `${keyText(key)}: ${mongoshValue(item, level + 1)}`),
      level,
      { indent, open: '{', close: '}', spaced: true },
    );
  }
  return scalarText(value);
}

/** Feature: codegen.mongosh — the statement, or the whole program, for mongosh. */
export function mongoshCode(query: CodeQuery, target: CodeTarget): string {
  const collection = `db.getCollection(${quoted(target.collection)})`;
  let call: string;
  if (query.kind === 'aggregate') {
    call = `${collection}.aggregate(${mongoshValue(query.pipeline)})`;
  } else {
    const args = [mongoshValue(query.filter)];
    if (query.projection !== undefined) {
      args.push(mongoshValue(query.projection));
    }
    call = `${collection}.find(${args.join(', ')})`;
    if (query.sort !== undefined) {
      call += `.sort(${mongoshValue(query.sort)})`;
    }
  }
  return target.program ? `use(${quoted(target.database)});\n\n${call};\n` : `${call};\n`;
}
