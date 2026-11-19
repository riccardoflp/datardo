/**
 * Feature: codegen.source
 *
 * What the code is made from: the values of the query bar, of the pipeline or of a chart, with their types, and the
 * words of the title. Nothing of the connection is part of it.
 */
import type { Json } from '../../shared/engine-request';
import { typedKey } from '../chart/data';
import { builtStages } from '../chart/draw';
import { chartStages } from '../chart/pipeline';
import { text as chartText } from '../chart/text';
import {
  isJsonDocument,
  type ChartOptions,
  type ChartSource,
  type EditorStage,
  type JsonDocument,
  type ParsedText,
} from '../chart/types';
import { text } from './text';

/** A find, with its filter and the projection and sort there are; or an aggregate with its stages. */
export type CodeQuery =
  | {
      readonly kind: 'find';
      readonly filter: JsonDocument;
      readonly projection?: JsonDocument;
      readonly sort?: JsonDocument;
    }
  | { readonly kind: 'aggregate'; readonly pipeline: readonly Json[] };

/** Where the code reads, and whether it is a whole program. */
export interface CodeTarget {
  readonly database: string;
  /** The collection, or the view, of the tab. */
  readonly collection: string;
  /** Imports, connection (`MONGODB_URI`) and printing the results; the lines of the query alone otherwise. */
  readonly program: boolean;
}

/** What the Code section was shown on: the query bar, the pipeline, or a chart. */
export type CodeSource = { readonly database: string; readonly collection: string } & (
  | { readonly kind: 'find'; readonly filter: ParsedText; readonly projection: ParsedText; readonly sort: ParsedText }
  | { readonly kind: 'aggregate'; readonly stages: readonly EditorStage[] }
  | { readonly kind: 'chart'; readonly chart: ChartOptions; readonly source: ChartSource }
);

/** The query to write as code, with the words of the title; or the message said in place of the code. */
export type CodeResult =
  | {
      readonly kind: 'code';
      readonly query: CodeQuery;
      readonly database: string;
      readonly collection: string;
      readonly title: string;
    }
  | { readonly kind: 'invalid'; readonly message: string };

/** Whether a value is a document, not a value of a BSON type such as `ObjectId("…")`. */
function isPlainDocument(value: Json): value is JsonDocument {
  return isJsonDocument(value) && typedKey(value) === undefined;
}

type Part =
  { readonly kind: 'document'; readonly value?: JsonDocument } | { readonly kind: 'invalid'; readonly message: string };

/** A text of the query bar as a document: absent when empty or `{}`, unless `keepEmpty`. */
function partOf(parsed: ParsedText, notObject: string, keepEmpty = false): Part {
  switch (parsed.kind) {
    case 'empty':
      return { kind: 'document', ...(keepEmpty ? { value: {} } : {}) };
    case 'invalid':
      return { kind: 'invalid', message: text.invalid(parsed.message) };
    case 'value': {
      if (!isPlainDocument(parsed.value)) {
        return { kind: 'invalid', message: text.invalid(notObject) };
      }
      const empty = Object.keys(parsed.value).length === 0;
      return { kind: 'document', ...(empty && !keepEmpty ? {} : { value: parsed.value }) };
    }
  }
}

function findResult(source: Extract<CodeSource, { kind: 'find' }>): CodeResult {
  const filter = partOf(source.filter, text.filterNotObject, true);
  const projection = partOf(source.projection, text.projectNotObject);
  const sort = partOf(source.sort, text.sortNotObject);
  for (const part of [filter, projection, sort]) {
    if (part.kind === 'invalid') {
      return part;
    }
  }
  const value = (part: Part): JsonDocument | undefined => (part.kind === 'document' ? part.value : undefined);
  const projectionValue = value(projection);
  const sortValue = value(sort);
  const query: CodeQuery = {
    kind: 'find',
    filter: value(filter) ?? {},
    ...(projectionValue === undefined ? {} : { projection: projectionValue }),
    ...(sortValue === undefined ? {} : { sort: sortValue }),
  };
  return { kind: 'code', query, database: source.database, collection: source.collection, title: text.titles.find };
}

function aggregateResult(source: Extract<CodeSource, { kind: 'aggregate' }>): CodeResult {
  const built = builtStages(source.stages, source.stages.length - 1);
  if (built.kind === 'invalid') {
    return { kind: 'invalid', message: text.invalid(built.message) };
  }
  return {
    kind: 'code',
    query: { kind: 'aggregate', pipeline: built.stages },
    database: source.database,
    collection: source.collection,
    title: text.titles.aggregate(built.stages.length),
  };
}

function chartResult(source: Extract<CodeSource, { kind: 'chart' }>): CodeResult {
  let before: readonly JsonDocument[];
  if (source.source.kind === 'filter') {
    const filter = partOf(source.source.filter, text.filterNotObject);
    if (filter.kind === 'invalid') {
      return filter;
    }
    before = filter.value === undefined ? [] : [{ $match: filter.value }];
  } else {
    const built = builtStages(source.source.stages, source.source.shown);
    if (built.kind === 'invalid') {
      return { kind: 'invalid', message: text.invalid(built.message) };
    }
    before = built.stages;
  }
  return {
    kind: 'code',
    query: { kind: 'aggregate', pipeline: [...before, ...chartStages(source.chart)] },
    database: source.database,
    collection: source.collection,
    title: text.titles.chart(chartText.typeWord[source.chart.type]),
  };
}

/** Feature: codegen.source — the query to write as code, or the message said in its place. */
export function codeQuery(source: CodeSource): CodeResult {
  switch (source.kind) {
    case 'find':
      return findResult(source);
    case 'aggregate':
      return aggregateResult(source);
    case 'chart':
      return chartResult(source);
  }
}

/** A value with its BSON type, as every language writes it (`codegen.types`). */
export type CodeValue =
  | { readonly kind: 'null' }
  | { readonly kind: 'undefined' }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'long'; readonly digits: string }
  | { readonly kind: 'decimal'; readonly digits: string }
  | { readonly kind: 'object-id'; readonly hex: string }
  | { readonly kind: 'date'; readonly time: number }
  | { readonly kind: 'regex'; readonly pattern: string; readonly options: string }
  | { readonly kind: 'uuid'; readonly text: string }
  | { readonly kind: 'binary'; readonly base64: string; readonly subtype: number }
  | { readonly kind: 'timestamp'; readonly t: number; readonly i: number }
  | { readonly kind: 'min-key' }
  | { readonly kind: 'max-key' }
  | { readonly kind: 'code'; readonly code: string }
  | { readonly kind: 'symbol'; readonly value: string }
  | { readonly kind: 'array'; readonly items: readonly Json[] }
  | { readonly kind: 'document'; readonly entries: readonly (readonly [string, Json])[] };

/** The bytes of base64 text. */
export function base64Bytes(base64: string): readonly number[] {
  return Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function uuidText(base64: string): string | undefined {
  const hex = base64Bytes(base64)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return hex.length === 32
    ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    : undefined;
}

function dateTime(inner: Json | undefined): number {
  if (typeof inner === 'string') {
    return Date.parse(inner);
  }
  return Number(isJsonDocument(inner) ? inner['$numberLong'] : inner);
}

/** The largest time a date of JavaScript holds, in milliseconds either side of 1970. */
const mostTime = 8.64e15;

function typedValue(key: string, inner: Json | undefined): CodeValue | undefined {
  const fields = isJsonDocument(inner) ? inner : {};
  const textOf = (value: Json | undefined): string =>
    typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  switch (key) {
    case '$oid':
      return { kind: 'object-id', hex: textOf(inner) };
    case '$date': {
      const time = dateTime(inner);
      return Number.isFinite(time) && Math.abs(time) <= mostTime ? { kind: 'date', time } : undefined;
    }
    case '$numberInt':
    case '$numberDouble':
      return { kind: 'number', value: Number(inner) };
    case '$numberLong':
      return { kind: 'long', digits: textOf(inner) };
    case '$numberDecimal':
      return { kind: 'decimal', digits: textOf(inner) };
    case '$regularExpression':
      return { kind: 'regex', pattern: textOf(fields['pattern']), options: textOf(fields['options']) };
    case '$uuid':
      return { kind: 'uuid', text: textOf(inner) };
    case '$binary':
      return binaryValue(textOf(fields['base64']), textOf(fields['subType'] ?? '00'));
    case '$timestamp':
      return { kind: 'timestamp', t: Number(fields['t']), i: Number(fields['i']) };
    default:
      return simpleTypedValue(key, inner);
  }
}

function binaryValue(base64: string, subType: string): CodeValue {
  const subtype = Number.parseInt(subType, 16);
  const uuid = subtype === 4 ? uuidText(base64) : undefined;
  return uuid === undefined ? { kind: 'binary', base64, subtype } : { kind: 'uuid', text: uuid };
}

function simpleTypedValue(key: string, inner: Json | undefined): CodeValue | undefined {
  switch (key) {
    case '$minKey':
      return { kind: 'min-key' };
    case '$maxKey':
      return { kind: 'max-key' };
    case '$code':
      return { kind: 'code', code: typeof inner === 'string' ? inner : '' };
    case '$symbol':
      return { kind: 'symbol', value: typeof inner === 'string' ? inner : '' };
    case '$undefined':
      return { kind: 'undefined' };
    default:
      return undefined;
  }
}

/** A value of canonical (or relaxed) Extended JSON with its BSON type. */
export function codeValue(value: Json): CodeValue {
  if (value === null) {
    return { kind: 'null' };
  }
  if (typeof value === 'boolean') {
    return { kind: 'boolean', value };
  }
  if (typeof value === 'string') {
    return { kind: 'string', value };
  }
  if (typeof value === 'number') {
    return { kind: 'number', value };
  }
  if (Array.isArray(value)) {
    return { kind: 'array', items: value as readonly Json[] };
  }
  const document = value as JsonDocument;
  const key = typedKey(document);
  const typed = key === undefined ? undefined : typedValue(key, document[key]);
  return typed ?? { kind: 'document', entries: Object.entries(document) };
}
