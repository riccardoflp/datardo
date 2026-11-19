import { gunzipSync, gzipSync } from 'node:zlib';
import { BSON } from 'mongodb';
import { describe, expect, it } from 'vitest';
import {
  archiveDatabases,
  bsonFrames,
  readArchive,
  readArchiveCollections,
  type ArchiveSource,
} from '../../../src/features/backup/archive-read';
import {
  archivePrelude,
  checksumOf,
  collectionSection,
  Crc64,
  joinBytes,
  namespaceHeader,
  terminator,
} from '../../../src/features/backup/archive-write';
import { collectionMetadata } from '../../../src/features/backup/folder-layout';
import type { ArchiveCollection, ArchiveItem } from '../../../src/features/backup/types';
import { stored } from '../transfer/harness';

const encoder = new TextEncoder();

/** The bytes given in pieces of `size` bytes, as a file is read. */
async function* inPieces(bytes: Uint8Array, size = 1 << 20): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < bytes.length; offset += size) {
    yield bytes.subarray(offset, offset + size);
    await Promise.resolve();
  }
}

async function* gunzip(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  const pieces: Uint8Array[] = [];
  for await (const chunk of chunks) {
    pieces.push(chunk);
  }
  yield new Uint8Array(gunzipSync(joinBytes(pieces)));
}

function source(bytes: Uint8Array, name = 'shop.agz', size?: number): ArchiveSource {
  return { name, chunks: inPieces(bytes, size), gunzip };
}

async function items(from: ArchiveSource): Promise<ArchiveItem[]> {
  const read: ArchiveItem[] = [];
  for await (const item of readArchive(from)) {
    read.push(item);
  }
  return read;
}

function said(item: ArchiveItem): string {
  return item.kind === 'end'
    ? `end ${item.collection}`
    : `${item.collection}:${String(BSON.deserialize(item.bytes)['_id'])}`;
}

function entry(database: string, collection: string, type = 'collection'): ArchiveCollection {
  return { database, collection, type, metadata: collectionMetadata({ name: collection, type }, []) };
}

const things = [stored('{"_id": 1}'), stored('{"_id": 2}'), stored('{"_id": 3}')];

/** An archive of `shop.things` (3 documents) then the view `shop.recent`, as `backup.create` writes it. */
function thingsArchive(): Uint8Array {
  const view = { ...entry('shop', 'recent', 'view') };
  return joinBytes([
    archivePrelude('8.2.0', [entry('shop', 'things'), view]),
    ...collectionSection('shop', 'things', things),
    ...collectionSection('shop', 'recent', []),
  ]);
}

describe('backup.archive-write', () => {
  it('checks the 9 bytes 123456789 as 0x995dc9bbdf1939fa, a signed int64', () => {
    expect(checksumOf([encoder.encode('123456789')])).toBe(BigInt.asIntN(64, 0x995dc9bbdf1939fan));
  });

  it('checks `hello, ` then `archive` as `hello, archive`, and no bytes as 0', () => {
    const parts = new Crc64();
    parts.update(encoder.encode('hello, '));
    parts.update(encoder.encode('archive'));
    expect(parts.value()).toBe(checksumOf([encoder.encode('hello, archive')]));
    expect(checksumOf([])).toBe(0n);
  });

  it('writes the prelude, the block and the end of things, then the end of the view with CRC 0', () => {
    const prelude = archivePrelude('8.2.0', [entry('shop', 'things'), entry('shop', 'recent', 'view')]);
    expect(new DataView(prelude.buffer, prelude.byteOffset).getUint32(0, true)).toBe(0x8199e26d);
    const size = new DataView(prelude.buffer, prelude.byteOffset + 4).getInt32(0, true);
    const header = BSON.deserialize(prelude.subarray(4, 4 + size));
    expect(header).toMatchObject({ version: '0.1', server_version: '8.2.0', tool_version: 'Datardo' });
    expect(Buffer.from(prelude.subarray(prelude.length - 4))).toEqual(Buffer.from(terminator));
    const pieces = [...collectionSection('shop', 'things', things), ...collectionSection('shop', 'recent', [])];
    expect(pieces.map((piece) => (piece === terminator || piece.length === 4 ? 'T' : 'D'))).toEqual([
      'D',
      'D',
      'D',
      'D',
      'T',
      'D',
      'T',
      'D',
      'T',
    ]);
    const end = BSON.deserialize(namespaceHeader('shop', 'recent', 0n), { useBigInt64: true });
    expect(end).toEqual({ db: 'shop', collection: 'recent', EOF: true, CRC: 0n });
  });

  it('gives back every document byte for byte, then the end of each collection', async () => {
    const read = await items(source(thingsArchive()));
    expect(read.map(said)).toEqual(['things:1', 'things:2', 'things:3', 'end things', 'end recent']);
    const documents = read.filter((item) => item.kind === 'document');
    expect(documents.map((item) => Buffer.from(item.bytes))).toEqual(things.map((bytes) => Buffer.from(bytes)));
  });

  it('keeps an Int64 of a view pipeline an Int64 in the metadata of the archive', async () => {
    const pipeline = [{ $limit: { $numberLong: '5' } }];
    const view: ArchiveCollection = {
      database: 'shop',
      collection: 'recent',
      type: 'view',
      metadata: collectionMetadata({ name: 'recent', type: 'view', options: { viewOn: 'orders', pipeline } }, []),
    };
    const listed = await readArchiveCollections(source(joinBytes([archivePrelude('8.2.0', [view])])));
    expect(listed[0]?.metadata).toEqual({
      options: { viewOn: 'orders', pipeline: [{ $limit: { $numberLong: '5' } }] },
      indexes: [],
      collectionName: 'recent',
      type: 'view',
    });
  });
});

describe('backup.archive-read', () => {
  it('reads alternating blocks, and checks a over all its blocks', async () => {
    const [x1, x2, y, z] = [
      stored('{"_id":"x1"}'),
      stored('{"_id":"x2"}'),
      stored('{"_id":"y"}'),
      stored('{"_id":"z"}'),
    ];
    const archive = joinBytes([
      archivePrelude('8.2.0', [entry('d', 'a'), entry('d', 'b')]),
      namespaceHeader('d', 'a'),
      x1,
      x2,
      terminator,
      namespaceHeader('d', 'b'),
      y,
      terminator,
      namespaceHeader('d', 'a'),
      z,
      terminator,
      namespaceHeader('d', 'b', checksumOf([y])),
      terminator,
      namespaceHeader('d', 'a', checksumOf([x1, x2, z])),
      terminator,
    ]);
    expect((await items(source(archive))).map(said)).toEqual(['a:x1', 'a:x2', 'b:y', 'a:z', 'end b', 'end a']);
  });

  it('reads things, events.2024 and an empty collection in their order', async () => {
    const archive = joinBytes([
      archivePrelude('8.2.0', [entry('shop', 'things'), entry('logs', 'events.2024'), entry('shop', 'empty')]),
      ...collectionSection('shop', 'things', things),
      ...collectionSection('logs', 'events.2024', [stored('{"_id": 9}')]),
      ...collectionSection('shop', 'empty', []),
    ]);
    expect((await items(source(archive))).map(said)).toEqual([
      'things:1',
      'things:2',
      'things:3',
      'end things',
      'events.2024:9',
      'end events.2024',
      'end empty',
    ]);
  });

  it('refuses a plain .bson file, or one gzipped, given as an archive', async () => {
    const bson = joinBytes(things);
    const message = 'things.agz is not a mongodump archive (mongodump --archive, with or without --gzip).';
    await expect(items(source(bson, 'things.agz'))).rejects.toThrow(message);
    await expect(items(source(new Uint8Array(gzipSync(bson)), 'things.agz'))).rejects.toThrow(message);
  });

  it('says an archive cut in a document, or in its list, is truncated', async () => {
    const archive = thingsArchive();
    const prelude = archivePrelude('8.2.0', [entry('shop', 'things')]);
    const cut = archive.subarray(0, prelude.length + 60 + 6);
    await expect(items(source(cut))).rejects.toThrow('shop.agz is truncated: its last document is incomplete.');
    const listOnly = prelude.subarray(0, prelude.length - 4);
    await expect(items(source(listOnly))).rejects.toThrow('shop.agz is truncated: it ends in its list of collections.');
  });

  it('gives a document split across two reads whole', async () => {
    const read = await items(source(thingsArchive(), 'shop.agz', 7));
    expect(read.map(said)).toEqual(['things:1', 'things:2', 'things:3', 'end things', 'end recent']);
  });

  it('reads a gzipped archive named .archive and a plain one named .agz', async () => {
    const gzipped = new Uint8Array(gzipSync(thingsArchive()));
    expect((await items(source(gzipped, 'shop.archive'))).length).toBe(5);
    expect((await items(source(thingsArchive(), 'shop.agz'))).length).toBe(5);
  });

  it('says a changed byte of a document of shop.things at the end of that collection', async () => {
    const changed = [stored('{"_id": 1}'), stored('{"_id": 2}'), stored('{"_id": 3}')];
    const archive = joinBytes([
      archivePrelude('8.2.0', [entry('shop', 'things')]),
      namespaceHeader('shop', 'things'),
      ...changed.map((bytes, index) =>
        index === 1 ? Uint8Array.from(bytes, (byte, at) => (at === 10 ? byte + 1 : byte)) : bytes,
      ),
      terminator,
      namespaceHeader('shop', 'things', checksumOf(changed)),
      terminator,
    ]);
    await expect(items(source(archive))).rejects.toThrow(
      "shop.agz is damaged: the checksum of shop.things doesn't match its documents.",
    );
  });

  it('leaves out entries without a database and system collections, sorted by name', () => {
    const databases = archiveDatabases([
      entry('shop', 'orders'),
      entry('', 'oplog.rs'),
      entry('shop', 'system.views'),
      entry('crm', 'leads'),
      entry('shop', 'carts'),
    ]);
    expect(databases.map((each) => [each.name, each.collections.map((collection) => collection.name)])).toEqual([
      ['crm', ['leads']],
      ['shop', ['carts', 'orders']],
    ]);
  });

  it('reads the documents of a .bson file one by one', async () => {
    const frames: (Uint8Array | null)[] = [];
    for await (const frame of bsonFrames(inPieces(joinBytes(things), 5), 'things.bson', 'bson')) {
      frames.push(frame);
    }
    expect(frames.map((frame) => (frame === null ? null : (BSON.deserialize(frame)['_id'] as unknown)))).toEqual([
      1, 2, 3,
    ]);
  });
});
