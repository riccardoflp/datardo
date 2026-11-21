/**
 * The documents of the runner's fed steps (`DocumentsFeed`), read in the main process a batch at a time, never a whole
 * collection or file at once: the documents of a collection through a kept cursor, read as stored; those of an
 * archive, in one pass over the file for all the steps fed from it; those of a `.bson` or `.bson.gz` file; generated
 * documents; and documents the plan holds already. Gzip is recognized from the first bytes of a file.
 */
import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { documentOfBytes, type EngineService } from '../engines';
import { bsonFrames, isGzip, readArchive, type ArchiveSource } from '../features/backup/archive-read';
import type { DocumentsFeed, FeedBatches } from '../features/backup/types';
import { isSchemaSummary } from '../features/transfer/generate/analysis';
import { documentGenerator, nextDocument, type GenerateOptions } from '../features/transfer/generate-values';
import type { Json } from '../shared/engine-request';
import type { ConnectionId } from '../shared/ids';
import type { FedBatch, Feeds } from '../runner/ports';

/** The bytes of a file, a piece at a time. */
export async function* fileChunks(path: string, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
  const stream = createReadStream(path, signal === undefined ? {} : { signal });
  for await (const chunk of stream) {
    yield chunk as Buffer;
  }
}

/** Bytes gunzipped as they are read. */
export async function* gunzipped(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  const gunzip = createGunzip();
  const input = Readable.from(chunks);
  input.on('error', (error: Error) => gunzip.destroy(error));
  for await (const chunk of input.pipe(gunzip)) {
    yield chunk as Buffer;
  }
}

/** The bytes of a file, gunzipped when its first two bytes say it is gzipped. */
export async function* plainBytes(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  const iterator = chunks[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done === true) {
    return;
  }
  async function* all(): AsyncGenerator<Uint8Array> {
    yield first.value;
    for (let next = await iterator.next(); next.done !== true; next = await iterator.next()) {
      yield next.value;
    }
  }
  yield* isGzip(first.value) ? gunzipped(all()) : all();
}

/** An archive as `backup.archive-read` reads it, from a file on the disk. */
export function archiveSource(path: string, signal?: AbortSignal, onBytes?: (count: number) => void): ArchiveSource {
  return {
    name: basename(path),
    chunks: fileChunks(path, signal),
    gunzip: gunzipped,
    ...(onBytes === undefined ? {} : { onBytes }),
  };
}

/** The documents of a `.bson` or `.bson.gz` file, each as its bytes. */
export async function* bsonFileDocuments(path: string, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
  for await (const frame of bsonFrames(plainBytes(fileChunks(path, signal)), basename(path), 'bson')) {
    if (frame !== null) {
      yield frame;
    }
  }
}

/** A collection's documents read through a kept cursor, `batch` at a time, each as its bytes as stored. */
export async function* collectionBytes(
  engines: EngineService,
  on: {
    readonly connection: ConnectionId;
    readonly database: string;
    readonly collection: string;
    readonly filter: Json;
  },
  batch: number,
  signal: AbortSignal,
): AsyncGenerator<readonly Uint8Array[]> {
  const base = { engine: 'mongodb', database: on.database, collection: on.collection } as const;
  const send = (method: string, args: readonly Json[], stop: AbortSignal): Promise<unknown> =>
    engines.send({ connection: on.connection, request: { ...base, method, arguments: args } }, stop);
  const opened = (await send('openCursor', ['find', [on.filter, { raw: true }], []], signal)) as { cursor?: Json };
  const cursor = opened.cursor ?? null;
  try {
    for (;;) {
      const read = (await send('cursorNextBytes', [cursor, { $numberInt: String(batch) }], signal)) as {
        documents?: readonly { $binary?: { base64?: string } }[];
        exhausted?: boolean;
      };
      const documents = (read.documents ?? []).map((each) => Buffer.from(each.$binary?.base64 ?? '', 'base64'));
      if (documents.length > 0) {
        yield documents;
      }
      if (read.exhausted !== false || documents.length === 0) {
        return;
      }
    }
  } finally {
    await send('closeCursor', [cursor], AbortSignal.timeout(10_000)).catch(() => undefined);
  }
}

/** Gathers the documents of each feed into batches of at most so many documents and bytes. */
class Batcher {
  private readonly pending: Json[][];
  private readonly sizes: number[];

  constructor(
    count: number,
    private readonly batches: FeedBatches,
  ) {
    this.pending = Array.from({ length: count }, () => []);
    this.sizes = Array.from({ length: count }, () => 0);
  }

  /** Adds a document; the batch of its feed, when it is full. */
  add(feed: number, document: Json, bytes: number): FedBatch | undefined {
    const pending = this.pending[feed];
    if (pending === undefined) {
      return undefined;
    }
    const most = this.batches.bytes;
    const before = most !== undefined && pending.length > 0 && (this.sizes[feed] ?? 0) + bytes > most;
    const flushed = before ? this.flush(feed) : undefined;
    this.pending[feed]?.push(document);
    this.sizes[feed] = (this.sizes[feed] ?? 0) + bytes;
    if (flushed !== undefined) {
      return flushed;
    }
    return (this.pending[feed]?.length ?? 0) >= this.batches.documents ? this.flush(feed) : undefined;
  }

  /** The documents of a feed not given yet; none when there are none. */
  flush(feed: number): FedBatch | undefined {
    const documents = this.pending[feed] ?? [];
    if (documents.length === 0) {
      return undefined;
    }
    this.pending[feed] = [];
    this.sizes[feed] = 0;
    return { feed, documents };
  }

  /** What every feed has not given yet. */
  flushAll(): FedBatch[] {
    return this.pending.flatMap((_documents, feed) => {
      const batch = this.flush(feed);
      return batch === undefined ? [] : [batch];
    });
  }
}

/** The documents of the archive feeds of one file, in one pass. */
async function* archiveBatches(
  feeds: readonly Extract<DocumentsFeed, { kind: 'archive' }>[],
  batches: FeedBatches,
  signal: AbortSignal,
): AsyncGenerator<FedBatch> {
  const [first] = feeds;
  if (first === undefined) {
    return;
  }
  const byNamespace = new Map(feeds.map((feed, index) => [`${feed.database}.${feed.collection}`, index]));
  const batcher = new Batcher(feeds.length, batches);
  for await (const item of readArchive(archiveSource(first.path, signal))) {
    const feed = byNamespace.get(`${item.database}.${item.collection}`);
    if (feed === undefined) {
      continue;
    }
    const batch =
      item.kind === 'document'
        ? batcher.add(feed, documentOfBytes(item.bytes), item.bytes.length)
        : batcher.flush(feed);
    if (batch !== undefined) {
      yield batch;
    }
  }
  yield* batcher.flushAll();
}

/** The documents of one feed that is not an archive. */
async function* oneFeed(
  engines: () => EngineService,
  feed: Exclude<DocumentsFeed, { kind: 'archive' }>,
  batches: FeedBatches,
  signal: AbortSignal,
): AsyncGenerator<FedBatch> {
  const batcher = new Batcher(1, batches);
  const add = (document: Json, bytes: number): FedBatch | undefined => batcher.add(0, document, bytes);
  switch (feed.kind) {
    case 'bson':
      for await (const bytes of bsonFileDocuments(feed.path, signal)) {
        const batch = add(documentOfBytes(bytes), bytes.length);
        if (batch !== undefined) {
          yield batch;
        }
      }
      break;
    case 'query':
      for await (const read of collectionBytes(engines(), feed, batches.documents, signal)) {
        yield { feed: 0, documents: read.map((bytes) => documentOfBytes(bytes)) };
      }
      break;
    case 'generated': {
      if (!isSchemaSummary(feed.analysis)) {
        throw new Error('The analysis of the documents to generate cannot be read.');
      }
      const generator = documentGenerator(feed.analysis, feed.options as unknown as GenerateOptions);
      for (let made = 0; made < feed.count; made += 1) {
        const batch = add(nextDocument(generator), 0);
        if (batch !== undefined) {
          yield batch;
        }
      }
      break;
    }
    case 'documents':
      for (const document of feed.documents) {
        const batch = add(document, 0);
        if (batch !== undefined) {
          yield batch;
        }
      }
      break;
  }
  yield* batcher.flushAll();
}

/** The feeds of the runner, reading through the connections' clients. */
export function transferFeeds(engines: () => EngineService): Feeds {
  return {
    read: (feeds, batches, signal) => {
      const archives = feeds.filter((feed) => feed.kind === 'archive');
      if (archives.length === feeds.length) {
        return archiveBatches(archives, batches, signal);
      }
      const [only] = feeds;
      if (only === undefined || only.kind === 'archive' || feeds.length > 1) {
        throw new Error('Datardo reads together only the feeds of one archive.');
      }
      return oneFeed(engines, only, batches, signal);
    },
  };
}
