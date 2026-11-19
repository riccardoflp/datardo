/**
 * The values of documents as the document area reads them: canonical Extended JSON (R5.5), where a value of a BSON type
 * is a wrapper (`{ $oid: "…" }`, `{ $numberLong: "7" }`) and a sub-document is any other object.
 */
import type { Json } from '../../../shared/engine-request';
import { formattedValue, isTypedValue, prettyWidth } from '../../aggregate/mongosh/format';
import { isRecord, type JsonRecord } from '../types';

/** Whether a value is a sub-document: an object that is not the wrapper of a BSON type. */
export function isDocumentValue(value: Json | undefined): value is JsonRecord {
  return isRecord(value) && !isTypedValue(value);
}

/** Whether two values are the same, byte for byte: the same types, the same values, the fields in the same order. */
export function isSameValue(first: Json | undefined, second: Json | undefined): boolean {
  return first !== undefined && second !== undefined && JSON.stringify(first) === JSON.stringify(second);
}

/** A value on one line in mongosh syntax: `7`, `ObjectId("65f1…")`, `{ city: "Rome" }`. */
export function oneLineText(value: Json): string {
  return formattedValue(value, { kind: 'one-line' });
}

/** A value in mongosh syntax as the inspector, the document tab and the editor of a cell show it (76 columns). */
export function prettyText(value: Json): string {
  return formattedValue(value, { kind: 'pretty', width: prettyWidth });
}

/**
 * A document in mongosh syntax with one field a line, indented by two spaces at each level, as the document tab, the
 * text of the inspector and the copy of **Duplicate…** write it (as Mongoster wrote them, whatever their width).
 */
export function documentText(document: Json): string {
  return formattedValue(document, { kind: 'pretty', width: 0 });
}

/** The value at a path of field names and array positions; `undefined` when it is missing. */
export function valueAtPath(document: Json, path: readonly string[]): Json | undefined {
  let current: Json | undefined = document;
  for (const segment of path) {
    current = childOf(current, segment);
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
}

function childOf(value: Json | undefined, segment: string): Json | undefined {
  if (Array.isArray(value)) {
    const items = value as readonly Json[];
    return /^\d+$/u.test(segment) ? items[Number(segment)] : undefined;
  }
  return isDocumentValue(value) && Object.hasOwn(value, segment) ? value[segment] : undefined;
}

/** The document without its `_id`, its other fields in their order. */
export function withoutId(document: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(document).filter(([key]) => key !== '_id'));
}

/** The number of a reply, written as a number or as Extended JSON (`{ $numberInt: "3" }`); `undefined` otherwise. */
export function numberOf(value: Json | undefined): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const inner = value['$numberInt'] ?? value['$numberLong'] ?? value['$numberDouble'];
  return typeof inner === 'string' && inner.trim() !== '' && !Number.isNaN(Number(inner)) ? Number(inner) : undefined;
}

/** A count of a reply of the driver, `deletedCount` of `{ deletedCount: { $numberInt: "3" } }`; 0 when absent. */
export function replyCount(reply: unknown, name: string): number {
  return isRecord(reply) ? (numberOf(reply[name]) ?? 0) : 0;
}

/** The documents of a reply that is a list of them (a `find`); empty otherwise. */
export function replyDocuments(reply: unknown): readonly JsonRecord[] {
  return Array.isArray(reply) ? (reply as readonly unknown[]).filter(isRecord) : [];
}
