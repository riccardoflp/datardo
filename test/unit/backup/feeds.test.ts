import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { BSON } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EngineService } from '../../../src/engines';
import { transferFeeds } from '../../../src/main/transfer-feeds';
import type { FedBatch } from '../../../src/runner/ports';
import type { Json } from '../../../src/shared/engine-request';

const noEngines = (): EngineService => {
  throw new Error('No server in these tests.');
};

let folder = '';

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-feeds-'));
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function all(batches: AsyncIterable<FedBatch>): Promise<FedBatch[]> {
  const read: FedBatch[] = [];
  for await (const batch of batches) {
    read.push(batch);
  }
  return read;
}

/** A `.bson` file of `count` documents, each of about `size` bytes. */
async function bsonFile(name: string, count: number, size: number, gzip = false): Promise<string> {
  const documents = Array.from({ length: count }, (_, at) =>
    BSON.serialize({ _id: at, text: 'x'.repeat(Math.max(0, size - 30)) }),
  );
  const bytes = Buffer.concat(documents);
  const path = join(folder, name);
  await writeFile(path, gzip ? gzipSync(bytes) : bytes);
  return path;
}

describe('backup.restore', () => {
  it('cuts the documents of a .bson file into batches of at most so many documents', async () => {
    const path = await bsonFile('orders.bson', 2500, 100);
    const read = await all(
      transferFeeds(noEngines).read([{ kind: 'bson', path }], { documents: 1000 }, new AbortController().signal),
    );
    expect(read.map((batch) => batch.documents.length)).toEqual([1000, 1000, 500]);
    expect(read[0]?.documents[0]).toMatchObject({ _id: { $numberInt: '0' } });
  });

  it('cuts a batch before the document that would take it over the bytes, never leaving one empty', async () => {
    const path = await bsonFile('large.bson.gz', 10, 1000, true);
    const read = await all(
      transferFeeds(noEngines).read(
        [{ kind: 'bson', path }],
        { documents: 1000, bytes: 3500 },
        new AbortController().signal,
      ),
    );
    expect(read.map((batch) => batch.documents.length)).toEqual([3, 3, 3, 1]);
    const one = await all(
      transferFeeds(noEngines).read(
        [{ kind: 'bson', path }],
        { documents: 1000, bytes: 10 },
        AbortSignal.timeout(5000),
      ),
    );
    expect(one.every((batch) => batch.documents.length === 1)).toBe(true);
  });
});

describe('transfer.import', () => {
  it('gives the documents an import holds in batches of the step', async () => {
    const documents: Json[] = Array.from({ length: 25 }, (_, at) => ({ n: at }));
    const read = await all(
      transferFeeds(noEngines).read(
        [{ kind: 'documents', documents }],
        { documents: 10 },
        new AbortController().signal,
      ),
    );
    expect(read.map((batch) => batch.documents.length)).toEqual([10, 10, 5]);
    expect(read.flatMap((batch) => batch.documents)).toEqual(documents);
  });
});
