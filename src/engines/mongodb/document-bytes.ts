/**
 * A document read as BSON bytes (`raw: true`), as canonical Extended JSON in which every BSON type survives (R5.5).
 * The driver's BSON library reads the bytes as the client would, then a walk of the bytes puts back the two values a
 * JavaScript value cannot hold: a BSON undefined, which the library reads as null, and a date beyond the range of a
 * JavaScript Date, which it reads as an invalid Date.
 */
import { BSON } from 'mongodb';
import type { Json } from '../../shared/engine-request';
import { EngineError } from '../engine';

/** How the client reads values: none promoted, regular expressions kept as BSON (index.ts, `clientOptions`). */
const readOptions = { promoteValues: false, promoteLongs: false, promoteBuffers: false, bsonRegExp: true } as const;

/** The most milliseconds from 1970 a JavaScript Date holds, on either side. */
const mostJavaScriptMilliseconds = 8_640_000_000_000_000n;

const type = {
  document: 0x03,
  array: 0x04,
  undefined: 0x06,
  date: 0x09,
  codeWithScope: 0x0f,
} as const;

/** The bytes of a value of each type whose size does not depend on the value. */
const fixedSizes = new Map<number, number>([
  [0x01, 8], // double
  [0x06, 0], // undefined
  [0x07, 12], // ObjectId
  [0x08, 1], // boolean
  [0x09, 8], // date
  [0x0a, 0], // null
  [0x10, 4], // int32
  [0x11, 8], // timestamp
  [0x12, 8], // int64
  [0x13, 16], // decimal128
  [0x7f, 0], // MaxKey
  [0xff, 0], // MinKey
]);

/** A value the library cannot read, by the keys that lead to it in the Extended JSON of the document. */
interface LostValue {
  readonly path: readonly string[];
  readonly value: Json;
}

/** The bytes being walked and the values found so far. */
interface Walk {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  readonly found: LostValue[];
}

const names = new TextDecoder('utf-8');

function endOfName(walk: Walk, index: number): number {
  const end = walk.bytes.indexOf(0, index);
  if (end < 0) {
    throw new EngineError('MongoDB sent a document that ends in the middle of a name.');
  }
  return end;
}

/** The number of bytes of the value of an element of the given type that starts at `index`. */
function sizeOf(walk: Walk, elementType: number, index: number): number {
  const fixed = fixedSizes.get(elementType);
  if (fixed !== undefined) {
    return fixed;
  }
  switch (elementType) {
    case 0x02: // string
    case 0x0d: // code
    case 0x0e: // symbol
      return 4 + walk.view.getInt32(index, true);
    case 0x05: // binary: the length, the subtype, the bytes
      return 5 + walk.view.getInt32(index, true);
    case 0x0b: // regular expression: the pattern and the options, each ending in a zero
      return endOfName(walk, endOfName(walk, index) + 1) + 1 - index;
    case 0x0c: // DBPointer: a string and an ObjectId
      return 4 + walk.view.getInt32(index, true) + 12;
    case type.document:
    case type.array:
    case type.codeWithScope:
      return walk.view.getInt32(index, true);
    default:
      throw new EngineError(`MongoDB sent a value of a type Datardo does not know (${elementType.toString(16)}).`);
  }
}

/** Notes the value at `index` when it is lost on the way, and walks into the documents it holds. */
function visit(walk: Walk, elementType: number, index: number, path: readonly string[]): void {
  if (elementType === type.undefined) {
    walk.found.push({ path, value: { $undefined: true } });
  } else if (elementType === type.date) {
    const milliseconds = walk.view.getBigInt64(index, true);
    if (milliseconds > mostJavaScriptMilliseconds || milliseconds < -mostJavaScriptMilliseconds) {
      walk.found.push({ path, value: { $date: { $numberLong: milliseconds.toString() } } });
    }
  } else if (elementType === type.document || elementType === type.array) {
    walkDocument(walk, index, path);
  } else if (elementType === type.codeWithScope) {
    walkDocument(walk, index + 8 + walk.view.getInt32(index + 4, true), [...path, '$scope']);
  }
}

/** Walks the elements of the document or array whose bytes start at `start`. */
function walkDocument(walk: Walk, start: number, path: readonly string[]): void {
  const end = start + walk.view.getInt32(start, true) - 1;
  let index = start + 4;
  while (index < end) {
    const elementType = walk.bytes[index] ?? 0;
    const nameEnd = endOfName(walk, index + 1);
    const at = [...path, names.decode(walk.bytes.subarray(index + 1, nameEnd))];
    visit(walk, elementType, nameEnd + 1, at);
    index = nameEnd + 1 + sizeOf(walk, elementType, nameEnd + 1);
  }
}

function isContainer(value: Json | undefined): value is Json[] | Record<string, Json> {
  return typeof value === 'object' && value !== null;
}

/** Puts `value` at `path` in `root`, a document of Extended JSON made for this reply alone. */
function putBack(root: Record<string, Json>, path: readonly string[], value: Json): void {
  let parent: Json[] | Record<string, Json> = root;
  for (const key of path.slice(0, -1)) {
    const child: Json | undefined = Array.isArray(parent) ? parent[Number(key)] : parent[key];
    if (!isContainer(child)) {
      return;
    }
    parent = child;
  }
  const last = path.at(-1) ?? '';
  if (Array.isArray(parent)) {
    parent[Number(last)] = value;
  } else {
    parent[last] = value;
  }
}

/** A document the driver gave as BSON bytes, as canonical Extended JSON with every type as the server holds it. */
export function documentOfBytes(bytes: Uint8Array): Json {
  const document = BSON.EJSON.serialize(BSON.deserialize(bytes, readOptions), { relaxed: false }) as Record<
    string,
    Json
  >;
  const walk: Walk = { bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), found: [] };
  walkDocument(walk, 0, []);
  for (const { path, value } of walk.found) {
    putBack(document, path, value);
  }
  return document;
}
