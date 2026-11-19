/**
 * Feature: transfer.csv-read
 *
 * How CSV text is read (RFC 4180) and turned into documents for an import: the first row is the header, a header with
 * dots builds sub-documents, empty cells are left out, and each cell's value is what it looks like.
 */
import { csvText } from './text';
import { isSubdocument, type RelaxedValue } from './types';

/** The parsing of one character outside a quoted field: what it ends, if anything. */
type Ending = 'field' | 'row' | undefined;

function endingOf(text: string, index: number): { readonly ending: Ending; readonly skip: number } {
  const character = text[index];
  if (character === ',') {
    return { ending: 'field', skip: 0 };
  }
  if (character === '\n' || character === '\r') {
    return { ending: 'row', skip: character === '\r' && text[index + 1] === '\n' ? 1 : 0 };
  }
  return { ending: undefined, skip: 0 };
}

/**
 * The rows of CSV text: a leading byte order mark skipped; a field starting with `"` quoted until the next lone `"`,
 * `""` inside it being one `"`; rows ending at LF, CR or CRLF; blank lines dropped, a row of empty fields kept.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = text.charCodeAt(0) === 0xfeff ? 1 : 0; index < text.length; index += 1) {
    const character = text[index] ?? '';
    if (quoted) {
      const doubled = character === '"' && text[index + 1] === '"';
      quoted = character !== '"' || doubled;
      field += character === '"' ? (doubled ? '"' : '') : character;
      index += doubled ? 1 : 0;
      continue;
    }
    if (character === '"' && field === '') {
      quoted = true;
      continue;
    }
    const { ending, skip } = endingOf(text, index);
    if (ending === undefined) {
      field += character;
      continue;
    }
    row.push(field);
    field = '';
    index += skip;
    if (ending === 'row') {
      rows.push(row);
      row = [];
    }
  }
  if (quoted) {
    throw new Error(csvText.unterminated);
  }
  if (field !== '' || row.length > 0) {
    rows.push([...row, field]);
  }
  return rows.filter((each) => each.length > 1 || each[0] !== '');
}

const integer = /^-?(0|[1-9]\d*)$/u;
const decimal = /^-?(0|[1-9]\d*)?\.\d+([eE][-+]?\d+)?$|^-?(0|[1-9]\d*)[eE][-+]?\d+$/u;
const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/u;
const objectIdText = /^[0-9a-f]{24}$/iu;

/** The value of a cell, as relaxed Extended JSON: the first of the card's rules that fits. */
export function cellValue(raw: string, key: string): RelaxedValue {
  if (integer.test(raw)) {
    const number = Number(raw);
    return Number.isSafeInteger(number) ? number : { $numberLong: raw };
  }
  if (decimal.test(raw)) {
    return Number(raw);
  }
  if (raw === 'true' || raw === 'false') {
    return raw === 'true';
  }
  if (raw === 'null') {
    return null;
  }
  if (isoDate.test(raw)) {
    return { $date: raw };
  }
  if (key === '_id' && objectIdText.test(raw)) {
    return { $oid: raw };
  }
  return raw.startsWith('[') || raw.startsWith('{') ? jsonOr(raw) : raw;
}

function jsonOr(raw: string): RelaxedValue {
  try {
    return JSON.parse(raw) as RelaxedValue;
  } catch {
    return raw;
  }
}

function setPath(document: Record<string, unknown>, path: readonly string[], value: RelaxedValue): void {
  let current = document;
  for (const step of path.slice(0, -1)) {
    const next = current[step];
    const sub: Record<string, unknown> = isSubdocument(next) ? next : {};
    current[step] = sub;
    current = sub;
  }
  current[path[path.length - 1] ?? ''] = value;
}

/**
 * The documents of CSV rows, header first, as relaxed Extended JSON. A row with more fields than the header fails:
 * *Row \<n\> has \<k\> fields, the header has \<h\>*, the header counted as row 1.
 */
export function csvToDocuments(rows: readonly (readonly string[])[]): Record<string, unknown>[] {
  const [header, ...data] = rows;
  if (header === undefined || header.length === 0) {
    return [];
  }
  const paths = header.map((name) => name.trim().split('.'));
  return data.map((row, index) => {
    if (row.length > header.length) {
      throw new Error(csvText.rowFields(index + 2, row.length, header.length));
    }
    const document: Record<string, unknown> = {};
    row.forEach((raw, column) => {
      const path = paths[column] ?? [];
      if (raw !== '') {
        setPath(document, path, cellValue(raw, path.join('.')));
      }
    });
    return document;
  });
}
