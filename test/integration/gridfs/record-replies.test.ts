/**
 * Records the replies of the reads of a GridFS bucket from the throwaway MongoDB into `test/fixtures/replies/`, named
 * after the server version they came from (testing.md). It runs only when `DATARDO_RECORD_REPLIES=1`: the unit tests
 * of `gridfs.list` and `gridfs.preview` read the recorded files, and the files change only when they are recorded
 * again. The bucket is written as the driver writes one: a files document and its chunks.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import type { Json } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const id = connectionId('record');
const database = 'gridfs-record';

function int(value: number): Json {
  return { $numberInt: String(value) };
}

function long(value: number): Json {
  return { $numberLong: String(value) };
}

function date(iso: string): Json {
  return { $date: { $numberLong: String(Date.parse(iso)) } };
}

function binary(bytes: Uint8Array): Json {
  return { $binary: { base64: Buffer.from(bytes).toString('base64'), subType: '00' } };
}

const notesId: Json = { $oid: '65f1c0ffee0000000000a2c1' };

/** A file of the bucket: its files document without its length and chunk size, its bytes and its chunk size. */
interface StoredFile {
  readonly document: Readonly<Record<string, Json>>;
  readonly bytes: Uint8Array;
  readonly chunkSize: number;
}

const files: readonly StoredFile[] = [
  {
    document: {
      _id: notesId,
      uploadDate: date('2026-11-18T13:02:11Z'),
      filename: 'notes.txt',
      metadata: { contentType: 'text/plain', owner: 'ada' },
    },
    bytes: new TextEncoder().encode('Hello, GridFS!\n'),
    chunkSize: 8,
  },
  {
    document: { _id: 'readme', uploadDate: date('2026-11-17T09:00:00Z'), filename: 'README' },
    bytes: new TextEncoder().encode('Hello\n'),
    chunkSize: 261120,
  },
  {
    document: { _id: int(7), uploadDate: date('2026-11-16T09:00:00Z'), filename: 'old.gif', contentType: 'image/gif' },
    bytes: new Uint8Array([0x47, 0x49, 0x46]),
    chunkSize: 261120,
  },
  {
    document: {
      _id: { $binary: { base64: 'ASNFZ4mrze8BI0VniavN7w==', subType: '04' } },
      uploadDate: date('2026-11-15T09:00:00Z'),
      filename: 'blob',
      metadata: {},
    },
    bytes: new Uint8Array([0, 1, 2, 3]),
    chunkSize: 261120,
  },
];

async function send(
  engines: EngineService,
  collection: string,
  method: string,
  args: readonly Json[],
): Promise<unknown> {
  return engines.send(
    { connection: id, request: { engine: 'mongodb', database, collection, method, arguments: args } },
    AbortSignal.timeout(20_000),
  );
}

async function store(engines: EngineService, file: StoredFile): Promise<void> {
  const chunks: Json[] = [];
  for (let start = 0, n = 0; start < file.bytes.length; start += file.chunkSize, n += 1) {
    chunks.push({
      files_id: file.document['_id'] ?? null,
      n: int(n),
      data: binary(file.bytes.subarray(start, start + file.chunkSize)),
    });
  }
  if (chunks.length > 0) {
    await send(engines, 'fs.chunks', 'insertMany', [chunks]);
  }
  await send(engines, 'fs.files', 'insertOne', [
    { ...file.document, length: long(file.bytes.length), chunkSize: int(file.chunkSize) },
  ]);
}

async function save(name: string, reply: unknown): Promise<void> {
  await writeFile(join(folder, `mongodb-8.2-gridfs-${name}.json`), `${JSON.stringify(reply, null, 2)}\n`);
}

const totals: Json = [{ $match: {} }, { $group: { _id: null, n: { $sum: int(1) }, bytes: { $sum: '$length' } } }];

async function recordAll(engines: EngineService): Promise<void> {
  await save(
    'files-page',
    await send(engines, 'fs.files', 'find', [
      {},
      { sort: { uploadDate: int(-1), _id: int(-1) }, skip: int(0), limit: int(100) },
    ]),
  );
  await save('files-totals', await send(engines, 'fs.files', 'aggregate', [totals]));
  await save('empty-files-page', await send(engines, 'empty.files', 'find', [{}, { limit: int(100) }]));
  await save('empty-totals', await send(engines, 'empty.files', 'aggregate', [totals]));
  await save('findOne', await send(engines, 'fs.files', 'findOne', [{ _id: notesId }]));
  await save(
    'findOne-missing',
    await send(engines, 'fs.files', 'findOne', [{ _id: { $oid: '65f1c0ffee0000000000ffff' } }]),
  );
  await save(
    'chunks',
    await send(engines, 'fs.chunks', 'find', [{ files_id: notesId }, { sort: { n: int(1) }, limit: int(2) }]),
  );
  await save(
    'distinct-names',
    await send(engines, 'fs.files', 'distinct', ['filename', { filename: { $in: ['notes.txt', 'logo.png'] } }]),
  );
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)('records the files and the chunks of a GridFS bucket on MongoDB', async () => {
    const engines = createEngines();
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    try {
      await mkdir(folder, { recursive: true });
      await engines.send(
        {
          connection: id,
          request: { engine: 'mongodb', database, method: 'runCommand', arguments: [{ dropDatabase: int(1) }] },
        },
        AbortSignal.timeout(20_000),
      );
      for (const file of files) {
        await store(engines, file);
      }
      await recordAll(engines);
      await engines.send(
        {
          connection: id,
          request: { engine: 'mongodb', database, method: 'runCommand', arguments: [{ dropDatabase: int(1) }] },
        },
        AbortSignal.timeout(20_000),
      );
    } finally {
      await engines.disconnectAll();
    }
    expect(recording).toBe(true);
  });
});
