/**
 * Feature: monitor.query-shape
 *
 * A query with its literal values replaced by `?`, on one line: what makes two runs of the same query with other
 * values one row of the Slow queries section. Field names keep their order, a field path (`"$customerId"`) stays, a
 * list of values of any length is `[?]`, and the numbers of a sort and of a projection stay. Ported from Mongoster's
 * `src/shared/profile.ts › shapeOf`, `shapeOfQuery`. The query parts are Extended JSON, canonical or relaxed.
 */
import type { Json } from '../../shared/engine-request';
import { isRecord, isRegularExpression, isTypedValue, numberOf } from './parts/ejson';
import type { QueryParts } from './types';

/** The parts and the stages inside which numbers and booleans are the shape (rule 5). */
const keepingParts = new Set(['sort', 'projection', '$sort', '$project']);

function keyText(key: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(key) ? key : JSON.stringify(key);
}

function typedShape(value: Json, keep: boolean): string {
  if (isRegularExpression(value)) {
    return '/?/';
  }
  const number = numberOf(value);
  return keep && number !== undefined ? String(number) : '?';
}

function listShape(items: readonly Json[], keep: boolean): string {
  if (items.length === 0) {
    return '[]';
  }
  const shapes = [...new Set(items.map((item) => valueShape(item, keep)))];
  return shapes.length === 1 && shapes[0] === '?' ? '[?]' : `[${shapes.join(', ')}]`;
}

function documentShape(value: Readonly<Record<string, Json>>, keep: boolean): string {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return '{}';
  }
  const fields = entries.map(([key, item]) => `${keyText(key)}: ${valueShape(item, keep || keepingParts.has(key))}`);
  return `{ ${fields.join(', ')} }`;
}

/** The shape of one value; `keep` inside a sort or a projection, where numbers and booleans are the shape. */
export function valueShape(value: Json, keep = false): string {
  if (value === null) {
    return '?';
  }
  if (Array.isArray(value)) {
    return listShape(value as readonly Json[], keep);
  }
  if (isTypedValue(value)) {
    return typedShape(value, keep);
  }
  if (isRecord(value)) {
    return documentShape(value, keep);
  }
  if (typeof value === 'string') {
    return value.startsWith('$') ? JSON.stringify(value) : '?';
  }
  return keep && (typeof value === 'number' || typeof value === 'boolean') ? String(value) : '?';
}

/** The kinds whose shape is `{}` when they have no part at all. */
const filterKinds = new Set(['find', 'count', 'distinct']);

/** Feature: monitor.query-shape — the shape of a query of a kind of operation. */
export function queryShape(kind: string, query: QueryParts): string {
  if (kind === 'aggregate') {
    return valueShape(query.pipeline ?? []);
  }
  const parts: string[] = [];
  if (query.filter !== undefined) {
    parts.push(valueShape(query.filter));
  }
  if (query.sort !== undefined) {
    parts.push(`sort ${valueShape(query.sort, true)}`);
  }
  if (query.projection !== undefined) {
    parts.push(`project ${valueShape(query.projection, true)}`);
  }
  if (query.update !== undefined) {
    parts.push(`update ${valueShape(query.update)}`);
  }
  if (parts.length === 0) {
    return filterKinds.has(kind) ? '{}' : '';
  }
  return parts.join(' · ');
}
