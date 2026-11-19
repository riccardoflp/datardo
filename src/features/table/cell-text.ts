/**
 * Feature: table.cell-text
 *
 * Gives the text, the tooltip and the color of a cell from the value it holds, so that the type of every value can be
 * read at a glance.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue } from '../query/format';
import { bsonType, objectField, textOfJson, type BsonType } from '../query/mongosh/ejson';

/** The longest text of a cell, in characters, before it is cut. */
export const longestCellText = 300;

/** The longest tooltip of a cell, in characters, before it is cut. */
export const longestCellTooltip = 2000;

/** What gives a cell its color: the role of that kind in an editor (`query.highlight`). */
export type CellKind =
  'string' | 'number' | 'boolean' | 'null' | 'id' | 'date' | 'regex' | 'special' | 'array' | 'subdocument' | 'missing';

/** A cell as the table draws it. */
export interface CellText {
  readonly text: string;
  readonly kind: CellKind;
  /** The value exactly as `query.format` writes it, cut at 2,000 characters; absent for a missing field. */
  readonly tooltip?: string;
  /** The name of its BSON type, under the tooltip and said by a screen reader after the value. */
  readonly type?: BsonType;
}

function kindOf(type: BsonType): CellKind {
  switch (type) {
    case 'string':
      return 'string';
    case 'int':
    case 'long':
    case 'double':
    case 'decimal':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'null':
    case 'undefined':
      return 'null';
    case 'objectId':
      return 'id';
    case 'date':
    case 'timestamp':
      return 'date';
    case 'regex':
      return 'regex';
    case 'array':
      return 'array';
    case 'object':
      return 'subdocument';
    case 'binData':
    case 'dbPointer':
    case 'javascript':
    case 'javascriptWithScope':
    case 'maxKey':
    case 'minKey':
    case 'symbol':
      return 'special';
  }
}

function cut(written: string, longest: number): string {
  return written.length > longest ? `${written.slice(0, longest)}…` : written;
}

function shortText(value: Json, type: BsonType): string {
  switch (type) {
    case 'long':
      return textOfJson(objectField(value, '$numberLong'));
    case 'double':
      return textOfJson(objectField(value, '$numberDouble'));
    case 'array':
      return `[${String((value as readonly Json[]).length)}] ${formattedValue(value)}`;
    case 'object':
      return `{${String(Object.keys(value as object).length)}} ${formattedValue(value)}`;
    case 'binData':
    case 'bool':
    case 'date':
    case 'dbPointer':
    case 'decimal':
    case 'int':
    case 'javascript':
    case 'javascriptWithScope':
    case 'maxKey':
    case 'minKey':
    case 'null':
    case 'objectId':
    case 'regex':
    case 'string':
    case 'symbol':
    case 'timestamp':
    case 'undefined':
      return formattedValue(value);
  }
}

/**
 * Feature: table.cell-text
 *
 * The text of a cell (the value in mongosh syntax on one line; an `Int64` by its digits, a whole `Double` with `.0`;
 * the count of an array or a sub-document first; cut at 300 characters), its tooltip with the typed value and the
 * name of its type, and its kind; an empty cell with no tooltip for a field the document does not have.
 */
export function cellOfValue(value: Json | undefined): CellText {
  if (value === undefined) {
    return { text: '', kind: 'missing' };
  }
  const type = bsonType(value);
  return {
    text: cut(shortText(value, type), longestCellText),
    kind: kindOf(type),
    tooltip: cut(formattedValue(value), longestCellTooltip),
    type,
  };
}
