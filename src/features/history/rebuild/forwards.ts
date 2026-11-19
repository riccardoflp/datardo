/**
 * Applying an update's oplog entry to the document before it, as the server does (`history.versions`, rule 2): `$set`
 * and `$unset` by field path, or the `$v: 2` diff section by section. A `$set` beyond the end of an array pads it with
 * `null`; a `$unset` of an element of an array leaves `null` in its place. Where the update cannot be applied, a
 * {@link Mismatch} says why, and the version is not rebuilt.
 */
import type { Json } from '../../../shared/engine-request';
import { mismatchText } from '../text';
import { copied, isRecord, isSubDocument, numberOf, objectOf, type JsonObject } from '../types';

/** An update that does not fit the document as it is known: the message says why. */
export class Mismatch extends Error {}

/** A value being changed in place: a copy, never a value of a version. */
export type Mutable = null | boolean | number | string | Mutable[] | { [key: string]: Mutable };

/** The keys an update of the older format may have. */
export const operatorKeys: readonly string[] = ['$v', '$set', '$unset'];

/** A copy of a value, to change in place. */
export function mutableCopy(value: Json): Mutable {
  return copied(value) as Mutable;
}

function isContainer(value: Mutable | undefined): value is Mutable[] | { [key: string]: Mutable } {
  return Array.isArray(value) || isSubDocument(value);
}

/** The document after an update's `o`. */
export function applyUpdate(document: JsonObject, o: JsonObject): JsonObject {
  const diff = o['diff'];
  if (isRecord(diff)) {
    return applyObjectDiff(document, diff);
  }
  const others = Object.keys(o).filter((key) => !operatorKeys.includes(key));
  if (others.length > 0) {
    throw new Mismatch(mismatchText.unknownFormat(Object.keys(o).join(', ')));
  }
  const after = mutableCopy(document) as { [key: string]: Mutable };
  for (const [path, value] of Object.entries(objectOf(o['$set']))) {
    setPath(after, path.split('.'), mutableCopy(value));
  }
  for (const path of Object.keys(objectOf(o['$unset']))) {
    unsetPath(after, path.split('.'));
  }
  return after;
}

/** The container a step of a `$set` goes into, created when missing; an array is padded up to the position. */
function childToSet(node: Mutable[] | { [key: string]: Mutable }, parts: readonly string[], at: number): Mutable {
  const key = parts[at] ?? '';
  if (Array.isArray(node)) {
    const position = Number(key);
    if (position === node.length) {
      node.push({});
    }
    return node[position] ?? null;
  }
  node[key] ??= {};
  return node[key];
}

function setPath(root: { [key: string]: Mutable }, parts: readonly string[], value: Mutable): void {
  let node: Mutable[] | { [key: string]: Mutable } = root;
  for (let at = 0; at < parts.length; at += 1) {
    const key = parts[at] ?? '';
    if (Array.isArray(node)) {
      if (!/^\d+$/u.test(key)) {
        throw new Mismatch(mismatchText.notAnIndex(key));
      }
      while (node.length < Number(key)) {
        node.push(null);
      }
    }
    if (at === parts.length - 1) {
      (node as Record<string, Mutable>)[Array.isArray(node) ? Number(key) : key] = value;
      return;
    }
    const child = childToSet(node, parts, at);
    if (!isContainer(child)) {
      throw new Mismatch(mismatchText.cannotHoldFields(parts.slice(0, at + 1).join('.')));
    }
    node = child;
  }
}

/** The value at the next step of a field path. */
export function childOf(node: Mutable | undefined, key: string): Mutable | undefined {
  if (Array.isArray(node)) {
    return /^\d+$/u.test(key) ? node[Number(key)] : undefined;
  }
  return isSubDocument(node) ? (node as Record<string, Mutable>)[key] : undefined;
}

function unsetPath(root: Mutable, parts: readonly string[]): void {
  let node: Mutable | undefined = root;
  for (const key of parts.slice(0, -1)) {
    node = childOf(node, key);
    if (!isContainer(node)) {
      return;
    }
  }
  const last = parts.at(-1) ?? '';
  if (Array.isArray(node)) {
    if (/^\d+$/u.test(last) && Number(last) < node.length) {
      node[Number(last)] = null;
    }
  } else if (isContainer(node)) {
    // A field that is not there is left as it is, as the server does.
    Reflect.deleteProperty(node, last);
  }
}

function subDiffsOf(diff: JsonObject): Map<string, JsonObject> {
  const sections = new Map<string, JsonObject>();
  for (const [key, value] of Object.entries(diff)) {
    if (key === 'd' || key === 'u' || key === 'i') {
      continue;
    }
    if (!key.startsWith('s')) {
      throw new Mismatch(mismatchText.unknownSection(key));
    }
    sections.set(key.slice(1), objectOf(value));
  }
  return sections;
}

/** The `$v: 2` diff of a sub-document: `d` deletes, `u` updates in place, `i` adds at the end, `s<field>` inside. */
function applyObjectDiff(document: JsonObject, diff: JsonObject): JsonObject {
  const deleted = objectOf(diff['d']);
  const updated = objectOf(diff['u']);
  const inserted = objectOf(diff['i']);
  const inside = subDiffsOf(diff);
  for (const field of [...Object.keys(deleted), ...Object.keys(updated), ...inside.keys()]) {
    if (!(field in document)) {
      throw new Mismatch(mismatchText.missingField(field));
    }
  }
  const after: Record<string, Json> = {};
  for (const [field, value] of Object.entries(document)) {
    if (field in deleted || field in inserted) {
      continue;
    }
    const sub = inside.get(field);
    after[field] =
      field in updated ? copied(updated[field] ?? null) : sub === undefined ? value : applySubDiff(value, sub);
  }
  for (const [field, value] of Object.entries(inserted)) {
    after[field] = copied(value);
  }
  return after;
}

function applySubDiff(value: Json, diff: JsonObject): Json {
  if (diff['a'] === true) {
    if (!Array.isArray(value)) {
      throw new Mismatch(mismatchText.notAnArray);
    }
    return applyArrayDiff(value as readonly Json[], diff);
  }
  if (!isSubDocument(value)) {
    throw new Mismatch(mismatchText.notASubDocument);
  }
  return applyObjectDiff(value, diff);
}

type ElementChange = { readonly kind: 'u'; readonly value: Json } | { readonly kind: 's'; readonly diff: JsonObject };

function elementChanges(diff: JsonObject): Map<number, ElementChange> {
  const changes = new Map<number, ElementChange>();
  for (const [key, value] of Object.entries(diff)) {
    if (key === 'a' || key === 'l') {
      continue;
    }
    const match = /^([us])(\d+)$/u.exec(key);
    if (match === null) {
      throw new Mismatch(mismatchText.unknownArraySection(key));
    }
    const change: ElementChange = match[1] === 'u' ? { kind: 'u', value } : { kind: 's', diff: objectOf(value) };
    changes.set(Number(match[2]), change);
  }
  return changes;
}

/** The `$v: 2` diff of an array: `l` the new length, `u<n>` a new element, `s<n>` inside one; new slots are `null`. */
function applyArrayDiff(array: readonly Json[], diff: JsonObject): Json {
  const changes = elementChanges(diff);
  const length = numberOf(diff['l']) ?? Math.max(array.length, ...[...changes.keys()].map((index) => index + 1));
  const after: Json[] = [];
  for (let index = 0; index < length; index += 1) {
    const change = changes.get(index);
    if (change?.kind === 's' && index >= array.length) {
      throw new Mismatch(mismatchText.missingElement(index));
    }
    after.push(elementAfter(array[index], change));
  }
  return after;
}

function elementAfter(element: Json | undefined, change: ElementChange | undefined): Json {
  if (change === undefined) {
    return element ?? null;
  }
  return change.kind === 'u' ? copied(change.value) : applySubDiff(element ?? null, change.diff);
}
