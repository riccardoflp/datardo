/**
 * The writers of an export (`transfer.export`) and of a backup (`backup.create`): the documents read a batch at a time
 * through the connection's client and written as they come, never a whole collection in memory. An export and an
 * archive are written beside the chosen file as `<file>.part` and renamed once complete; a folder backup is written in
 * its new folder. Cancel stops after the batch being written, and a cancel or a failure deletes what was written.
 */
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import type { Writable } from 'node:stream';
import { createGzip, type Gzip } from 'node:zlib';
import { documentOfBytes, type EngineService } from '../engines';
import { archivePrelude, Crc64, namespaceHeader, terminator } from '../features/backup/archive-write';
import type { BackupWriterArgs } from '../features/backup/create';
import { collectionFileNames, metadataText } from '../features/backup/folder-layout';
import { createText } from '../features/backup/text';
import { batchDocuments, type ArchiveCollection, type JsonDocument } from '../features/backup/types';
import { csvTable, plainColumns, toCsv, type CsvColumn } from '../features/transfer/csv-write';
import { exportEnd, exportPieces, exportRequest, relaxed, type ExportWriterArgs } from '../features/transfer/export';
import { exportText } from '../features/transfer/text';
import { isPlainObject } from '../features/transfer/types';
import { safeFileName } from '../features/task/file-names';
import type { Json, MongoRequest } from '../shared/engine-request';
import type { ConnectionId } from '../shared/ids';
import { Cancelled } from '../runner/cancel';
import type { ProgressReport } from '../runner/ports';

/** A file being written, gzipped or not, that waits when the disk is slower than the reads. */
class Sink {
  private readonly file: WriteStream;
  private readonly gzip: Gzip | undefined;
  /** The bytes given, before compression. */
  written = 0;

  constructor(path: string, gzip: boolean) {
    this.file = createWriteStream(path);
    this.gzip = gzip ? createGzip() : undefined;
    this.gzip?.pipe(this.file);
  }

  private get input(): Writable {
    return this.gzip ?? this.file;
  }

  /** Writes text as UTF-8, or bytes as they are. */
  async write(piece: string | Uint8Array): Promise<void> {
    const bytes = typeof piece === 'string' ? Buffer.from(piece, 'utf8') : piece;
    this.written += bytes.length;
    if (!this.input.write(bytes)) {
      await once(this.input, 'drain');
    }
  }

  /** Ends the file, once everything is on the disk. */
  async close(): Promise<void> {
    const finished = once(this.file, 'close');
    this.input.end();
    await finished;
  }

  /** Stops writing, for a file about to be deleted. */
  async abandon(): Promise<void> {
    const closed = once(this.file, 'close').catch(() => undefined);
    this.gzip?.destroy();
    this.file.destroy();
    await closed;
  }
}

/** What a writer works with: the connections' clients, Cancel, and where it says how far it went. */
export interface WriteRun {
  readonly engines: EngineService;
  readonly signal: AbortSignal;
  readonly progress?: ProgressReport;
}

/** Raises Cancel between two batches. */
function stopIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Cancelled();
  }
}

/**
 * The documents of a read of `find` or `aggregate`, a batch at a time, each as its bytes as stored, through a cursor
 * kept by the client and closed at the end.
 */
export async function* readBatches(
  engines: EngineService,
  connection: ConnectionId,
  request: MongoRequest,
  signal: AbortSignal,
): AsyncGenerator<readonly Uint8Array[]> {
  const [first, options] = request.arguments;
  const raw = { ...(isPlainObject(options) ? (options as Readonly<Record<string, Json>>) : {}), raw: true };
  const base = { engine: 'mongodb', database: request.database, collection: request.collection } as const;
  const send = (method: string, args: readonly Json[], stop: AbortSignal): Promise<unknown> =>
    engines.send({ connection, request: { ...base, method, arguments: args } as MongoRequest }, stop);
  const opened = (await send('openCursor', [request.method, [first ?? {}, raw], []], signal)) as { cursor?: Json };
  const cursor = opened.cursor ?? null;
  try {
    for (;;) {
      const read = (await send('cursorNextBytes', [cursor, { $numberInt: String(batchDocuments) }], signal)) as {
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

/** What an export wrote. */
export interface Exported {
  readonly documents: number;
}

function documentsOf(batch: readonly Uint8Array[]): Json[] {
  return batch.map((bytes) => documentOfBytes(bytes));
}

/** The columns of a CSV export of the tree, which shows no table: the top-level fields of every document, read first. */
async function allColumns(
  engines: EngineService,
  args: ExportWriterArgs,
  request: MongoRequest,
  signal: AbortSignal,
): Promise<readonly CsvColumn[]> {
  const keys = new Map<string, null>();
  for await (const batch of readBatches(engines, args.connection, request, signal)) {
    stopIfCancelled(signal);
    const rows = documentsOf(batch).flatMap((document) => (isPlainObject(document) ? [document] : []));
    for (const column of plainColumns(rows)) {
      keys.set(column.key, null);
    }
  }
  return plainColumns([Object.fromEntries([...keys.keys()].map((key) => [key, null]))]);
}

/**
 * `transfer.export`: the documents of the export's read written to `<path>.part` in its format, a batch at a time,
 * then renamed to `path`; the part is deleted when it fails or is cancelled.
 */
export async function writeExport(run: WriteRun, path: string, args: ExportWriterArgs): Promise<Exported> {
  const { engines, signal, progress } = run;
  const request = exportRequest(args);
  const part = `${path}.part`;
  const sink = new Sink(part, false);
  let count = 0;
  try {
    progress?.({ title: exportText.progressTitle(args.collection ?? ''), detail: exportText.progress(0) });
    const columns =
      args.format === 'csv' ? (args.columns ?? (await allColumns(engines, args, request, signal))) : undefined;
    if (columns !== undefined) {
      await sink.write(`\uFEFF${toCsv(csvTable([], columns))}`);
    }
    for await (const batch of readBatches(engines, args.connection, request, signal)) {
      const documents = documentsOf(batch);
      if (columns === undefined) {
        await sink.write(exportPieces(args.format === 'json' ? 'json' : 'jsonl', documents, count));
      } else {
        const rows = documents.flatMap((document) => {
          const row = relaxed(document);
          return isPlainObject(row) ? [row] : [];
        });
        await sink.write(toCsv(csvTable(rows, columns).slice(1)));
      }
      count += documents.length;
      progress?.({ detail: exportText.progress(count) });
      stopIfCancelled(signal);
    }
    if (columns === undefined) {
      await sink.write(exportEnd(args.format === 'json' ? 'json' : 'jsonl', count));
    }
    await sink.close();
    await rename(part, path);
    return { documents: count };
  } catch (error: unknown) {
    await sink.abandon();
    await rm(part, { force: true });
    throw signal.aborted ? new Cancelled() : error;
  }
}

/** What a backup wrote. */
export interface BackedUp {
  readonly collections: number;
  readonly documents: number;
  /** The bytes of the documents, before compression. */
  readonly bytes: number;
}

type Planned = NonNullable<BackupWriterArgs['plan']>['collections'][number];

/** The read of a collection's documents, all of them, as stored. */
function allDocuments(collection: Planned): MongoRequest {
  return {
    engine: 'mongodb',
    database: collection.database,
    collection: collection.collection,
    method: 'find',
    arguments: [{}, {}],
  };
}

/** A view has no documents to read. */
function hasDocuments(collection: Planned): boolean {
  return collection.type !== 'view';
}

/** The progress of a backup: *\<database\>.\<collection\>: \<n\> documents*. */
function backupProgress(progress: ProgressReport | undefined, collection: Planned, documents: number): void {
  progress?.({ detail: createText.progress(`${collection.database}.${collection.collection}`, documents) });
}

type ChosenBackup = BackupWriterArgs & { readonly plan: NonNullable<BackupWriterArgs['plan']> };

/** The documents of one collection written to an archive, a block per batch; their count and checksum. */
async function archiveDocuments(
  run: WriteRun,
  sink: Sink,
  on: { readonly connection: ConnectionId; readonly collection: Planned },
): Promise<{ readonly documents: number; readonly bytes: number; readonly checksum: Crc64 }> {
  const { collection } = on;
  const checksum = new Crc64();
  let documents = 0;
  let bytesRead = 0;
  if (!hasDocuments(collection)) {
    return { documents, bytes: bytesRead, checksum };
  }
  for await (const batch of readBatches(run.engines, on.connection, allDocuments(collection), run.signal)) {
    await sink.write(namespaceHeader(collection.database, collection.collection));
    for (const bytes of batch) {
      checksum.update(bytes);
      await sink.write(bytes);
      bytesRead += bytes.length;
    }
    await sink.write(terminator);
    documents += batch.length;
    backupProgress(run.progress, collection, documents);
    stopIfCancelled(run.signal);
  }
  return { documents, bytes: bytesRead, checksum };
}

async function writeArchive(run: WriteRun, part: string, args: ChosenBackup): Promise<BackedUp> {
  const sink = new Sink(part, true);
  const counted = { documents: 0, bytes: 0 };
  try {
    const listed: ArchiveCollection[] = args.plan.collections.map((each) => ({
      database: each.database,
      collection: each.collection,
      metadata: each.metadata as JsonDocument,
      type: each.type,
    }));
    await sink.write(archivePrelude(args.plan.serverVersion, listed));
    for (const collection of args.plan.collections) {
      backupProgress(run.progress, collection, 0);
      const done = await archiveDocuments(run, sink, { connection: args.connection, collection });
      counted.bytes += done.bytes;
      await sink.write(namespaceHeader(collection.database, collection.collection, done.checksum.value()));
      await sink.write(terminator);
      counted.documents += done.documents;
    }
    await sink.close();
    return { collections: args.plan.collections.length, ...counted };
  } catch (error: unknown) {
    await sink.abandon();
    throw error;
  }
}

/** The documents of one collection written to its `.bson` file, gzipped or not; their count and bytes. */
async function folderDocuments(
  run: WriteRun,
  path: string,
  on: { readonly connection: ConnectionId; readonly collection: Planned; readonly gzip: boolean },
): Promise<{ readonly documents: number; readonly bytes: number }> {
  const sink = new Sink(path, on.gzip);
  let documents = 0;
  let bytesRead = 0;
  try {
    for await (const batch of readBatches(run.engines, on.connection, allDocuments(on.collection), run.signal)) {
      for (const bytes of batch) {
        await sink.write(bytes);
        bytesRead += bytes.length;
      }
      documents += batch.length;
      backupProgress(run.progress, on.collection, documents);
      stopIfCancelled(run.signal);
    }
    await sink.close();
  } catch (error: unknown) {
    await sink.abandon();
    throw error;
  }
  return { documents, bytes: bytesRead };
}

async function writeFolder(run: WriteRun, root: string, args: ChosenBackup): Promise<BackedUp> {
  const format = args.format === 'gzip' ? 'gzip' : 'plain';
  const gzip = format === 'gzip';
  const counted = { documents: 0, bytes: 0 };
  for (const collection of args.plan.collections) {
    const folder = join(root, safeFileName(collection.database));
    await mkdir(folder, { recursive: true });
    const names = collectionFileNames(collection.collection, format);
    const metadata = new Sink(join(folder, names.metadata), gzip);
    await metadata.write(metadataText(collection.metadata as JsonDocument));
    await metadata.close();
    backupProgress(run.progress, collection, 0);
    if (hasDocuments(collection)) {
      const on = { connection: args.connection, collection, gzip };
      const done = await folderDocuments(run, join(folder, names.documents), on);
      counted.documents += done.documents;
      counted.bytes += done.bytes;
    }
  }
  return { collections: args.plan.collections.length, ...counted };
}

/**
 * `backup.create`: an archive written to `<path>.part` then renamed, or a folder backup written in the new folder
 * `path`; what was written is deleted when it fails or is cancelled. `title` is what the status line says.
 */
export async function writeBackup(
  run: WriteRun & { readonly title: string },
  path: string,
  args: BackupWriterArgs,
): Promise<BackedUp> {
  const { signal } = run;
  const plan = args.plan;
  if (plan === undefined) {
    throw new Error('Datardo backs up what was chosen: this backup names no collection.');
  }
  run.progress?.({ title: run.title });
  const chosen = { ...args, plan };
  if (args.format === 'archive') {
    const part = `${path}.part`;
    try {
      const done = await writeArchive(run, part, chosen);
      await rename(part, path);
      return done;
    } catch (error: unknown) {
      await rm(part, { force: true });
      throw signal.aborted ? new Cancelled() : error;
    }
  }
  // The new folder is made first, outside what a failure deletes: a folder already there is never touched.
  await mkdir(path, { recursive: false });
  try {
    return await writeFolder(run, path, chosen);
  } catch (error: unknown) {
    await rm(path, { recursive: true, force: true });
    throw signal.aborted ? new Cancelled() : error;
  }
}
