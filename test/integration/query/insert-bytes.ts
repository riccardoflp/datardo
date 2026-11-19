/**
 * Puts into a throwaway server a document holding the two values the driver cannot write: a BSON undefined and a date
 * beyond the range of a JavaScript Date. The document is serialized with a placeholder of the same size in their
 * place (a null, a 64-bit integer), the placeholder's type byte is changed, and the bytes go to the server in an
 * OP_MSG insert sent over a socket of its own.
 */
import { BSON } from 'mongodb';
import { connect } from 'node:net';
import type { Json } from '../../../src/shared/engine-request';

const nullType = 0x0a;
const undefinedType = 0x06;
const longType = 0x12;
const dateType = 0x09;
const opMsg = 2013;
/** The most milliseconds from 1970 a JavaScript Date holds, on either side. */
const mostJavaScriptMilliseconds = 8_640_000_000_000_000n;

/** A placeholder to retype: its type, the name of its element, the bytes of its value and the type it becomes. */
interface Placeholder {
  readonly type: number;
  readonly name: string;
  readonly value: Uint8Array;
  readonly becomes: number;
}

function objectOf(value: Json | undefined): Readonly<Record<string, Json>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, Json>>)
    : undefined;
}

function farDate(value: Json): string | undefined {
  const milliseconds = objectOf(objectOf(value)?.['$date'])?.['$numberLong'];
  if (typeof milliseconds !== 'string') {
    return undefined;
  }
  const beyond =
    BigInt(milliseconds) > mostJavaScriptMilliseconds || BigInt(milliseconds) < -mostJavaScriptMilliseconds;
  return beyond ? milliseconds : undefined;
}

function isUndefined(value: Json): boolean {
  return objectOf(value)?.['$undefined'] === true;
}

function longBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, BigInt(text), true);
  return bytes;
}

/** The value with each undefined and each date beyond JavaScript replaced by its placeholder, which `found` lists. */
function withPlaceholders(value: Json, name: string, found: Placeholder[]): Json {
  const far = farDate(value);
  if (far !== undefined) {
    found.push({ type: longType, name, value: longBytes(far), becomes: dateType });
    return { $numberLong: far };
  }
  if (isUndefined(value)) {
    found.push({ type: nullType, name, value: new Uint8Array(), becomes: undefinedType });
    return null;
  }
  if (Array.isArray(value)) {
    return (value as readonly Json[]).map((each, index) => withPlaceholders(each, String(index), found));
  }
  const object = objectOf(value);
  return object === undefined
    ? value
    : Object.fromEntries(Object.entries(object).map(([key, each]) => [key, withPlaceholders(each, key, found)]));
}

function occurrences(bytes: Uint8Array, pattern: Uint8Array): number[] {
  const found: number[] = [];
  for (let index = 0; index + pattern.length <= bytes.length; index += 1) {
    if (pattern.every((byte, offset) => bytes[index + offset] === byte)) {
      found.push(index);
    }
  }
  return found;
}

function patternOf(placeholder: Placeholder): Uint8Array {
  return new Uint8Array([placeholder.type, ...new TextEncoder().encode(placeholder.name), 0, ...placeholder.value]);
}

/**
 * The BSON bytes of a document of canonical Extended JSON in which `{ "$undefined": true }` is a BSON undefined and a
 * date beyond JavaScript keeps its milliseconds. It throws when a placeholder cannot be told from another element.
 */
export function documentBytes(document: Json): Uint8Array {
  const placeholders: Placeholder[] = [];
  const replaced = withPlaceholders(document, '', placeholders);
  const decoded = BSON.EJSON.deserialize(replaced as BSON.Document, { relaxed: false }) as BSON.Document;
  const bytes = BSON.serialize(decoded);
  const counts = new Map<string, { readonly placeholder: Placeholder; count: number }>();
  for (const placeholder of placeholders) {
    const key = patternOf(placeholder).join(',');
    const counted = counts.get(key) ?? { placeholder, count: 0 };
    counted.count += 1;
    counts.set(key, counted);
  }
  for (const { placeholder, count } of counts.values()) {
    const at = occurrences(bytes, patternOf(placeholder));
    if (at.length !== count) {
      throw new Error(`The placeholder of ${placeholder.name} cannot be told from another element.`);
    }
    for (const index of at) {
      bytes[index] = placeholder.becomes;
    }
  }
  return bytes;
}

function int32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeInt32LE(value);
  return bytes;
}

function insertMessage(database: string, collection: string, document: Uint8Array): Buffer {
  const body = BSON.serialize({ insert: collection, $db: database });
  const identifier = Buffer.from('documents\0', 'utf8');
  const sequence = Buffer.concat([int32(4 + identifier.length + document.length), identifier, document]);
  const sections = Buffer.concat([Buffer.from([0]), body, Buffer.from([1]), sequence]);
  const length = 16 + 4 + sections.length;
  return Buffer.concat([int32(length), int32(1), int32(0), int32(opMsg), int32(0), sections]);
}

function reply(address: URL, message: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: address.hostname, port: Number(address.port) });
    let received = Buffer.alloc(0);
    socket.once('error', reject);
    socket.on('data', (data: Buffer) => {
      received = Buffer.concat([received, data]);
      if (received.length >= 4 && received.length >= received.readInt32LE(0)) {
        socket.end();
        resolve(received);
      }
    });
    socket.write(message);
  });
}

/** Inserts the bytes of one document into a collection of the server at `connectionString`, as the driver cannot. */
export async function insertBytes(
  connectionString: string,
  database: string,
  collection: string,
  document: Uint8Array,
): Promise<void> {
  const received = await reply(new URL(connectionString), insertMessage(database, collection, document));
  const answer = BSON.deserialize(received.subarray(21));
  if (answer['ok'] !== 1 || answer['n'] !== 1 || answer['writeErrors'] !== undefined) {
    throw new Error(`The server did not insert the document: ${JSON.stringify(answer)}`);
  }
}
