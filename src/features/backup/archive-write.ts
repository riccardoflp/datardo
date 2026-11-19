/**
 * Feature: backup.archive-write
 *
 * The bytes of an archive as `mongodump --archive --gzip` writes them, before gzip, so that `mongorestore` reads
 * Datardo's archives: the magic number, the prelude (a header, a document per collection, a terminator), then each
 * collection in turn, never alternating: its documents in a block, then its EOF header with the CRC-64 of its
 * documents. The main process streams the documents between these pieces and gzips the whole.
 * https://github.com/mongodb/mongo-tools/tree/master/common/archive
 */
import type { ArchiveCollection } from './types';

/** The first 4 bytes of an archive, little-endian. */
export const archiveMagic = 0x8199e26d;

/** What ends the prelude and each block of an archive. */
export const terminator: Uint8Array = Uint8Array.of(0xff, 0xff, 0xff, 0xff);

/** What the archive's header says wrote it. */
export const toolVersion = 'Datardo';

/** The server's version written when `buildInfo` did not give one. */
export const unknownServerVersion = '0.0.0';

/** The bytes of several pieces, one after the other. */
export function joinBytes(pieces: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(pieces.reduce((total, piece) => total + piece.length, 0));
  let offset = 0;
  for (const piece of pieces) {
    joined.set(piece, offset);
    offset += piece.length;
  }
  return joined;
}

// CRC-64 with the ECMA polynomial, reflected, as Go's hash/crc64 computes it (CRC-64/XZ), in two halves of 32 bits.
const crcTables = ((): { readonly low: Uint32Array; readonly high: Uint32Array } => {
  const low = new Uint32Array(256);
  const high = new Uint32Array(256);
  for (let byte = 0; byte < 256; byte += 1) {
    let lowHalf = byte;
    let highHalf = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      const odd = lowHalf & 1;
      lowHalf = ((lowHalf >>> 1) | ((highHalf & 1) << 31)) >>> 0;
      highHalf >>>= 1;
      lowHalf = odd === 1 ? (lowHalf ^ 0xd7870f42) >>> 0 : lowHalf;
      highHalf = odd === 1 ? (highHalf ^ 0xc96c5795) >>> 0 : highHalf;
    }
    low[byte] = lowHalf;
    high[byte] = highHalf;
  }
  return { low, high };
})();

/** The checksum of a collection's documents, updated as they come, as the archive's EOF header carries it. */
export class Crc64 {
  // Kept inverted between updates, as Go does.
  private low = 0xffffffff;
  private high = 0xffffffff;

  /** Adds the bytes of a document. */
  update(bytes: Uint8Array): void {
    let { low, high } = this;
    for (const byte of bytes) {
      const index = (low ^ byte) & 0xff;
      low = ((low >>> 8) | (high << 24)) ^ (crcTables.low[index] ?? 0);
      high = (high >>> 8) ^ (crcTables.high[index] ?? 0);
    }
    this.low = low >>> 0;
    this.high = high >>> 0;
  }

  /** The checksum, as the signed int64 of the archive: 0 for no bytes. */
  value(): bigint {
    const low = ~this.low >>> 0;
    const high = ~this.high >>> 0;
    return BigInt.asIntN(64, (BigInt(high) << 32n) | BigInt(low));
  }
}

/** The checksum of documents given at once. */
export function checksumOf(documents: readonly Uint8Array[]): bigint {
  const checksum = new Crc64();
  documents.forEach((document) => {
    checksum.update(document);
  });
  return checksum.value();
}

/** A value of a header document: a string, a boolean, an `Int32` (a number) or an `Int64` (a bigint). */
export type HeaderValue = string | boolean | number | bigint;

const textEncoder = new TextEncoder();

function cString(text: string): Uint8Array {
  return joinBytes([textEncoder.encode(text), Uint8Array.of(0)]);
}

function littleEndian(size: number, write: (view: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(size);
  write(new DataView(bytes.buffer));
  return bytes;
}

function element(name: string, value: HeaderValue): Uint8Array {
  if (typeof value === 'string') {
    const text = textEncoder.encode(value);
    const length = littleEndian(4, (view) => {
      view.setInt32(0, text.length + 1, true);
    });
    return joinBytes([Uint8Array.of(0x02), cString(name), length, text, Uint8Array.of(0)]);
  }
  if (typeof value === 'boolean') {
    return joinBytes([Uint8Array.of(0x08), cString(name), Uint8Array.of(value ? 1 : 0)]);
  }
  if (typeof value === 'bigint') {
    const bytes = littleEndian(8, (view) => {
      view.setBigInt64(0, value, true);
    });
    return joinBytes([Uint8Array.of(0x12), cString(name), bytes]);
  }
  const bytes = littleEndian(4, (view) => {
    view.setInt32(0, value, true);
  });
  return joinBytes([Uint8Array.of(0x10), cString(name), bytes]);
}

/** A BSON document of the fields given, in their order: the few types the headers of an archive hold. */
export function headerDocument(fields: readonly (readonly [string, HeaderValue])[]): Uint8Array {
  const body = joinBytes(fields.map(([name, value]) => element(name, value)));
  const size = littleEndian(4, (view) => {
    view.setInt32(0, body.length + 5, true);
  });
  return joinBytes([size, body, Uint8Array.of(0)]);
}

/**
 * The start of an archive, up to the end of its prelude: the magic number, the header `{ concurrent_collections: 1,
 * version: '0.1', server_version, tool_version: 'Datardo' }`, a document per collection `{ db, collection, metadata,
 * size: 0, type }` with the metadata as canonical Extended JSON text, and a terminator.
 */
export function archivePrelude(serverVersion: string, collections: readonly ArchiveCollection[]): Uint8Array {
  const magic = littleEndian(4, (view) => {
    view.setUint32(0, archiveMagic, true);
  });
  const header = headerDocument([
    ['concurrent_collections', 1],
    ['version', '0.1'],
    ['server_version', serverVersion === '' ? unknownServerVersion : serverVersion],
    ['tool_version', toolVersion],
  ]);
  const listed = collections.map((each) =>
    headerDocument([
      ['db', each.database],
      ['collection', each.collection],
      ['metadata', JSON.stringify(each.metadata)],
      ['size', 0],
      ['type', each.type],
    ]),
  );
  return joinBytes([magic, header, ...listed, terminator]);
}

/**
 * The header of a block of a collection's documents `{ db, collection, EOF: false, CRC: 0 }`; with a checksum, the
 * EOF header that ends the collection `{ db, collection, EOF: true, CRC: <checksum> }`.
 */
export function namespaceHeader(database: string, collection: string, checksum?: bigint): Uint8Array {
  return headerDocument([
    ['db', database],
    ['collection', collection],
    ['EOF', checksum !== undefined],
    ['CRC', checksum ?? 0n],
  ]);
}

/**
 * The bytes of one collection after the prelude: when it has documents, a block (its header, the documents as stored, a
 * terminator); then, for a view or an empty collection too, its EOF header and a terminator.
 */
export function collectionSection(
  database: string,
  collection: string,
  documents: readonly Uint8Array[],
): readonly Uint8Array[] {
  const block = documents.length === 0 ? [] : [namespaceHeader(database, collection), ...documents, terminator];
  return [...block, namespaceHeader(database, collection, checksumOf(documents)), terminator];
}
