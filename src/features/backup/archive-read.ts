/**
 * Feature: backup.archive-read
 *
 * Reads an archive, Datardo's or mongodump's, gzipped or not, in one pass: its list of collections, then each document
 * byte for byte with its collection, and the end of each collection once its checksum is checked. Gzip is recognized
 * from the first two bytes, never from the extension; the main process gives the bytes of the file as they are read
 * and the means to gunzip them, and nothing here touches the disk.
 */
import type { Json } from '../../shared/engine-request';
import { groupThousands } from '../../shared/text-units';
import { compareNames } from '../tree/types';
import { archiveMagic, Crc64, joinBytes } from './archive-write';
import { archiveText } from './text';
import {
  deepestMetadata,
  isJsonDocument,
  largestDocument,
  nesting,
  type ArchiveCollection,
  type ArchiveItem,
  type BackupDatabase,
} from './types';

/** The bytes of a file as the main process reads them, with what gunzips them and what counts them. */
export interface ArchiveSource {
  /** The name of the file, for the messages. */
  readonly name: string;
  readonly chunks: AsyncIterable<Uint8Array>;
  readonly gunzip: (chunks: AsyncIterable<Uint8Array>) => AsyncIterable<Uint8Array>;
  /** Told the number of bytes of each piece read from the file, compressed, for the progress. */
  readonly onBytes?: (count: number) => void;
}

/** What `bsonFrames` reads: an archive, where `ff ff ff ff` is a terminator, or a `.bson` file. */
export type FramesOf = 'archive' | 'bson';

/** Whether a file is gzipped, from its first two bytes `1f 8b`. */
export function isGzip(head: Uint8Array): boolean {
  return head[0] === 0x1f && head[1] === 0x8b;
}

function int32At(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, true);
}

/**
 * The BSON documents of a stream of bytes, one piece of bytes each, whole even when split across reads; for an
 * archive, `null` for each terminator. A size below 5 bytes or above 48 MB is not BSON.
 */
export async function* bsonFrames(
  chunks: AsyncIterable<Uint8Array>,
  name: string,
  framesOf: FramesOf,
): AsyncGenerator<Uint8Array | null> {
  let pending: Uint8Array = new Uint8Array(0);
  let offset = 0;
  for await (const chunk of chunks) {
    pending = pending.length === 0 ? chunk : joinBytes([pending, chunk]);
    while (pending.length >= 4) {
      const size = int32At(pending, 0);
      if (framesOf === 'archive' && size === -1) {
        yield null;
        pending = pending.subarray(4);
        offset += 4;
        continue;
      }
      if (size < 5 || size > largestDocument) {
        throw new Error(archiveText.invalidDocument(name, framesOf, groupThousands(offset)));
      }
      if (pending.length < size) {
        break;
      }
      yield pending.slice(0, size);
      pending = pending.subarray(size);
      offset += size;
    }
  }
  if (pending.length > 0) {
    throw new Error(archiveText.lastDocumentIncomplete(name));
  }
}

async function* counted(source: ArchiveSource): AsyncGenerator<Uint8Array> {
  for await (const chunk of source.chunks) {
    source.onBytes?.(chunk.length);
    yield chunk;
  }
}

async function* replayed(head: Uint8Array, rest: AsyncIterator<Uint8Array>): AsyncGenerator<Uint8Array> {
  if (head.length > 0) {
    yield head;
  }
  for (let next = await rest.next(); next.done !== true; next = await rest.next()) {
    yield next.value;
  }
}

/** The bytes of the file, gunzipped when its first two bytes say it is gzipped. */
async function* fileBytes(source: ArchiveSource): AsyncGenerator<Uint8Array> {
  const raw = counted(source)[Symbol.asyncIterator]();
  let head: Uint8Array = new Uint8Array(0);
  while (head.length < 2) {
    const next = await raw.next();
    if (next.done === true) {
      break;
    }
    head = joinBytes([head, next.value]);
  }
  const all = replayed(head, raw);
  yield* isGzip(head) ? source.gunzip(all) : all;
}

/** The bytes after the magic number, or an error when the file does not start with it. */
async function* afterMagic(source: ArchiveSource): AsyncGenerator<Uint8Array> {
  let start: Uint8Array | undefined = new Uint8Array(0);
  for await (const chunk of fileBytes(source)) {
    if (start === undefined) {
      yield chunk;
      continue;
    }
    start = joinBytes([start, chunk]);
    if (start.length < 4) {
      continue;
    }
    if (new DataView(start.buffer, start.byteOffset, 4).getUint32(0, true) !== archiveMagic) {
      throw new Error(archiveText.notAnArchive(source.name));
    }
    if (start.length > 4) {
      yield start.subarray(4);
    }
    start = undefined;
  }
  if (start !== undefined) {
    throw new Error(archiveText.notAnArchive(source.name));
  }
}

/** A field of a header document, of the few types headers hold; `undefined` for the others. */
export type HeaderField = string | boolean | number | bigint | undefined;

const textDecoder = new TextDecoder('utf-8', { fatal: false });

function cStringEnd(bytes: Uint8Array, from: number): number {
  const end = bytes.indexOf(0, from);
  return end < 0 ? bytes.length : end;
}

/** How many bytes the value of a BSON type takes, from where it starts. */
function valueSize(bytes: Uint8Array, type: number, at: number): number {
  switch (type) {
    case 0x01:
    case 0x09:
    case 0x11:
    case 0x12:
      return 8;
    case 0x02:
    case 0x0d:
    case 0x0e:
      return 4 + int32At(bytes, at);
    case 0x03:
    case 0x04:
    case 0x0f:
      return int32At(bytes, at);
    case 0x05:
      return 5 + int32At(bytes, at);
    case 0x07:
      return 12;
    case 0x08:
      return 1;
    case 0x0b:
      return cStringEnd(bytes, cStringEnd(bytes, at) + 1) + 1 - at;
    case 0x0c:
      return 4 + int32At(bytes, at) + 12;
    case 0x10:
      return 4;
    case 0x13:
      return 16;
    default:
      return 0;
  }
}

function fieldValue(bytes: Uint8Array, type: number, at: number): HeaderField {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  switch (type) {
    case 0x01:
      return view.getFloat64(at, true);
    case 0x02:
      return textDecoder.decode(bytes.subarray(at + 4, at + 4 + int32At(bytes, at) - 1));
    case 0x08:
      return bytes[at] === 1;
    case 0x10:
      return view.getInt32(at, true);
    case 0x12:
      return view.getBigInt64(at, true);
    default:
      return undefined;
  }
}

/** The top-level fields of a header document of an archive: strings, booleans, numbers; others are skipped. */
export function headerFields(bytes: Uint8Array): Readonly<Record<string, HeaderField>> {
  const fields: Record<string, HeaderField> = {};
  let at = 4;
  while (at < bytes.length - 1) {
    const type = bytes[at] ?? 0;
    const nameEnd = cStringEnd(bytes, at + 1);
    const name = textDecoder.decode(bytes.subarray(at + 1, nameEnd));
    const start = nameEnd + 1;
    fields[name] = fieldValue(bytes, type, start);
    const size = valueSize(bytes, type, start);
    if (type === 0 || size <= 0) {
      break;
    }
    at = start + size;
  }
  return fields;
}

function textField(fields: Readonly<Record<string, HeaderField>>, name: string): string {
  const value = fields[name];
  return typeof value === 'string' ? value : '';
}

/** A collection of the list, its metadata read with limits (R14.4). */
function listedCollection(frame: Uint8Array, name: string): ArchiveCollection {
  const fields = headerFields(frame);
  const database = textField(fields, 'db');
  const collection = textField(fields, 'collection');
  const text = textField(fields, 'metadata');
  const parsed = (text === '' ? {} : JSON.parse(text)) as Json;
  if (!isJsonDocument(parsed) || nesting(parsed, deepestMetadata) > deepestMetadata) {
    throw new Error(archiveText.invalidMetadata(name, `${database}.${collection}`));
  }
  const type = textField(fields, 'type');
  return { database, collection, metadata: parsed, type: type === '' ? 'collection' : type };
}

/** What `parseArchive` gives: the list of collections first, then the documents and the ends. */
type Parsed = { readonly kind: 'collections'; readonly collections: readonly ArchiveCollection[] } | ArchiveItem;

async function listOf(frames: AsyncIterator<Uint8Array | null>, name: string): Promise<readonly ArchiveCollection[]> {
  const header = await frames.next();
  if (header.done === true || header.value === null) {
    throw new Error(archiveText.notAnArchive(name));
  }
  const collections: ArchiveCollection[] = [];
  for (;;) {
    const next = await frames.next();
    if (next.done === true) {
      throw new Error(archiveText.endsInList(name));
    }
    if (next.value === null) {
      return collections;
    }
    collections.push(listedCollection(next.value, name));
  }
}

/** The open block: the collection whose documents come until the next terminator. */
interface Block {
  readonly database: string;
  readonly collection: string;
  readonly checksum: Crc64;
}

/** The end of a collection, once the checksum of all its blocks is that of its EOF header. */
function ended(fields: Readonly<Record<string, HeaderField>>, checksum: Crc64, name: string): ArchiveItem {
  const database = textField(fields, 'db');
  const collection = textField(fields, 'collection');
  const expected = fields['CRC'];
  const given = typeof expected === 'number' ? BigInt(expected) : expected;
  if (typeof given === 'bigint' && given !== checksum.value()) {
    throw new Error(archiveText.damaged(name, `${database}.${collection}`));
  }
  return { kind: 'end', database, collection };
}

/** The list of collections, then the documents and the ends of the collections; checks each checksum. */
async function* parseArchive(source: ArchiveSource): AsyncGenerator<Parsed> {
  const frames = bsonFrames(afterMagic(source), source.name, 'archive')[Symbol.asyncIterator]();
  yield { kind: 'collections', collections: await listOf(frames, source.name) };
  const checksums = new Map<string, Crc64>();
  let block: Block | undefined;
  for (let next = await frames.next(); next.done !== true; next = await frames.next()) {
    const frame = next.value;
    if (frame === null) {
      block = undefined;
    } else if (block !== undefined) {
      block.checksum.update(frame);
      yield { kind: 'document', database: block.database, collection: block.collection, bytes: frame };
    } else {
      const fields = headerFields(frame);
      const database = textField(fields, 'db');
      const collection = textField(fields, 'collection');
      const key = `${database}.${collection}`;
      const checksum = checksums.get(key) ?? new Crc64();
      checksums.set(key, checksum);
      if (fields['EOF'] === true) {
        yield ended(fields, checksum, source.name);
      } else {
        block = { database, collection, checksum };
      }
    }
  }
  if (block !== undefined) {
    throw new Error(archiveText.incomplete(source.name, `${block.database}.${block.collection}`));
  }
}

/** The collections of an archive, from its list: the rest of the file is not read. */
export async function readArchiveCollections(source: ArchiveSource): Promise<readonly ArchiveCollection[]> {
  const parser = parseArchive(source);
  try {
    const first = await parser.next();
    return first.done !== true && first.value.kind === 'collections' ? first.value.collections : [];
  } finally {
    await parser.return(undefined);
  }
}

/** The documents of an archive as they are read, and the end of each collection, its checksum checked. */
export async function* readArchive(source: ArchiveSource): AsyncGenerator<ArchiveItem> {
  for await (const item of parseArchive(source)) {
    if (item.kind !== 'collections') {
      yield item;
    }
  }
}

/**
 * The databases of an archive for a restore: entries without a database (mongodump's `--oplog`) and `system.*`
 * collections left out, databases and collections sorted by name.
 */
export function archiveDatabases(collections: readonly ArchiveCollection[]): readonly BackupDatabase[] {
  const found = new Map<string, { readonly name: string; readonly meta: ArchiveCollection['metadata'] }[]>();
  for (const each of collections) {
    if (each.database !== '' && !each.collection.startsWith('system.')) {
      const list = found.get(each.database) ?? [];
      list.push({ name: each.collection, meta: { ...each.metadata, type: each.type } });
      found.set(each.database, list);
    }
  }
  return [...found]
    .map(([name, list]) => ({
      name,
      collections: [...list]
        .sort((one, other) => compareNames(one.name, other.name))
        .map((each) => ({ name: each.name, meta: each.meta, size: 0 })),
    }))
    .sort((one, other) => compareNames(one.name, other.name));
}
