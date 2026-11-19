/**
 * Going back through an update (`history.versions`, rule 3): the document before it is the document after it with what
 * the update changed made unknown. For the older format, a sub-document left with only unknown values becomes unknown
 * as a whole, since the update may have created it; an array the `$v: 2` diff resized is unknown as a whole, since its
 * old length is not known.
 */
import type { Json } from '../../../shared/engine-request';
import { mismatchText } from '../text';
import { isRecord, isSubDocument, isUnknown, objectOf, unknownValue, type JsonObject } from '../types';
import { childOf, Mismatch, mutableCopy, operatorKeys, type Mutable } from './forwards';

type MutableObject = { [key: string]: Mutable };

function unknownMark(): Mutable {
  return mutableCopy(unknownValue);
}

/** The document before an update, from the document after it. */
export function revertUpdate(after: JsonObject, o: JsonObject): JsonObject {
  const document = mutableCopy(after) as MutableObject;
  const diff = o['diff'];
  if (isRecord(diff)) {
    revertObjectDiff(document, diff);
    return document;
  }
  if (Object.keys(o).some((key) => !operatorKeys.includes(key))) {
    throw new Mismatch(mismatchText.unknownFormat(Object.keys(o).join(', ')));
  }
  for (const path of [...Object.keys(objectOf(o['$set'])), ...Object.keys(objectOf(o['$unset']))]) {
    markUnknown(document, path.split('.'));
  }
  return document;
}

/** Marks an element unknown, and the `null` the update may have padded the array with before it. */
function markElement(array: Mutable[], index: number): void {
  array[index] = unknownMark();
  if (index !== array.length - 1) {
    return;
  }
  for (let before = index - 1; before >= 0 && array[before] === null; before -= 1) {
    array[before] = unknownMark();
  }
}

/** The containers along a field path, each with the key of the next step; `undefined` when the path is not there. */
function chainOf(root: MutableObject, parts: readonly string[]): [Mutable[] | MutableObject, string][] | undefined {
  const chain: [Mutable[] | MutableObject, string][] = [];
  let node: Mutable | undefined = root;
  for (const [at, key] of parts.entries()) {
    const fits = Array.isArray(node) ? /^\d+$/u.test(key) : isSubDocument(node);
    if (!fits) {
      return undefined;
    }
    chain.push([node as Mutable[] | MutableObject, key]);
    node = at < parts.length - 1 ? childOf(node, key) : node;
    if (node === undefined) {
      // Missing in the document after: the update did not create it, so the path was not there before either.
      return undefined;
    }
  }
  return chain;
}

function setInContainer(container: Mutable[] | MutableObject, key: string, value: Mutable): void {
  if (Array.isArray(container)) {
    container[Number(key)] = value;
  } else {
    container[key] = value;
  }
}

/** Makes the value at a field path unknown, and the sub-documents left with unknown values only. */
function markUnknown(root: MutableObject, parts: readonly string[]): void {
  const chain = chainOf(root, parts);
  const last = chain?.at(-1);
  if (chain === undefined || last === undefined) {
    return;
  }
  const [container, key] = last;
  if (Array.isArray(container)) {
    if (Number(key) < container.length) {
      markElement(container, Number(key));
    }
    return;
  }
  container[key] = unknownMark();
  for (let at = chain.length - 1; at > 0; at -= 1) {
    const [inner] = chain[at] ?? [];
    if (
      inner === undefined ||
      Array.isArray(inner) ||
      !Object.values(inner).every((value) => isUnknown(value as Json))
    ) {
      return;
    }
    const [parent, parentKey] = chain[at - 1] ?? [root, ''];
    setInContainer(parent, parentKey, unknownMark());
  }
}

/** Undoes a `$v: 2` diff in place: what it updated, deleted or added becomes unknown; changes inside are walked. */
function revertObjectDiff(document: MutableObject, diff: JsonObject): void {
  for (const section of ['u', 'd', 'i']) {
    for (const field of Object.keys(objectOf(diff[section]))) {
      document[field] = unknownMark();
    }
  }
  for (const [key, value] of Object.entries(diff)) {
    if (key === 'd' || key === 'u' || key === 'i') {
      continue;
    }
    if (!key.startsWith('s')) {
      throw new Mismatch(mismatchText.unknownSection(key));
    }
    const field = key.slice(1);
    document[field] = revertSubDiff(document[field], objectOf(value));
  }
}

function revertSubDiff(value: Mutable | undefined, diff: JsonObject): Mutable {
  if (diff['a'] === true) {
    return Array.isArray(value) ? revertArrayDiff(value, diff) : unknownMark();
  }
  if (value === undefined || !isSubDocument(value)) {
    return unknownMark();
  }
  revertObjectDiff(value, diff);
  return value;
}

/** Undoes an array diff in place; a resized array is unknown as a whole. */
function revertArrayDiff(array: Mutable[], diff: JsonObject): Mutable {
  if ('l' in diff) {
    return unknownMark();
  }
  for (const [key, value] of Object.entries(diff)) {
    if (key === 'a') {
      continue;
    }
    const match = /^([us])(\d+)$/u.exec(key);
    if (match === null) {
      throw new Mismatch(mismatchText.unknownArraySection(key));
    }
    const index = Number(match[2]);
    if (index >= array.length) {
      continue;
    }
    if (match[1] === 'u') {
      markElement(array, index);
    } else {
      array[index] = revertSubDiff(array[index], objectOf(value));
    }
  }
  return array;
}
