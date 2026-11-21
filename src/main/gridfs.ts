/**
 * What the GridFS area does in the main process, through the connections' clients and the disk, never with a whole
 * file in memory:
 *
 * - the writer of `gridfs.download` (and of the copy of `gridfs.open`): the file's chunks, in order, through the
 *   driver's `GridFSBucket` (`openDownload` of the engine), written beside the target as `<file>.part` and renamed once
 *   complete; a cancel or a failure deletes the part, and the file at the path, if any, stays as it was;
 * - `gridfs.check-files`: the first step of an upload, which stops it when a file chosen can no longer be read, or
 *   has changed size, before anything is deleted or written;
 * - `gridfs.write-chunks`: the chunks of one file, read from the disk 255 KB at a time and inserted one after the
 *   other; a cancel or a failure deletes the chunks it wrote.
 *
 * Each says how far it is at most every 200 ms (`runner.progress`). The copies of `gridfs.open` are kept under
 * `datardo-gridfs` in the system's temporary folder, deleted when Datardo quits.
 */
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { EngineService } from '../engines';
import { sizeText } from '../features/gridfs/size-text';
import { text } from '../features/gridfs/text';
import { bucketRequest, isRecord, textOf, type BucketRef, type JsonRecord } from '../features/gridfs/types';
import { chunkCount, chunkLength } from '../features/gridfs/write/upload';
import { progressText, uploadedText } from '../features/gridfs/upload';
import { Cancelled } from '../runner/cancel';
import type { AppAction, StepProgress } from '../runner/ports';
import { GuardRefusal } from '../runner/steps';
import type { Json, MongoRequest } from '../shared/engine-request';
import { connectionId, type ConnectionId, type RefusalCode } from '../shared/ids';
import type { MainServices } from './services';

/** What the GridFS area needs of the main process: the clients, whether a connection is read-only, and its name. */
export interface GridFsPorts {
  readonly engines: () => Pick<EngineService, 'send'>;
  readonly isReadOnly: (connection: ConnectionId) => boolean;
  readonly connectionName: (connection: ConnectionId) => string;
}

/** The progress of a long step is said at most every 200 ms (gridfs.upload, gridfs.download). */
export const progressEveryMs = 200;

/** How long the insert of a chunk, and the deletion of the chunks of an upload that stopped, may take, in ms. */
const cleanUpMs = 30_000;

/** The folder of the copies `gridfs.open` writes, in the system's temporary folder. */
export function copiesFolder(): string {
  return join(tmpdir(), 'datardo-gridfs');
}

/** Deletes the copies `gridfs.open` wrote: when Datardo quits, and when it starts after a quit that could not. */
export async function removeCopies(folder: string = copiesFolder()): Promise<void> {
  await rm(folder, { recursive: true, force: true });
}

/**
 * At start, the copies a quit could not delete are deleted, without waiting; when Datardo quits, those of this time.
 * A copy the system's application still holds open stays until the next start.
 */
export function start(services: MainServices): Promise<void> {
  void removeCopies().catch(() => undefined);
  services.onQuit(() => removeCopies().catch(() => undefined));
  return Promise.resolve();
}

/** What says the progress: the first time at once, then at most every 200 ms, and the last time always. */
function throttled(progress: StepProgress | undefined): (detail: string, last?: 'last') => void {
  let said = 0;
  return (detail, last) => {
    const now = Date.now();
    if (progress !== undefined && (said === 0 || last === 'last' || now - said >= progressEveryMs)) {
      said = now;
      progress({ detail });
    }
  };
}

/** The bucket and the file named by the arguments of a step. */
function bucketOf(fields: JsonRecord): BucketRef {
  return {
    connection: connectionId(textOf(fields, 'connection') ?? ''),
    database: textOf(fields, 'database') ?? '',
    bucket: textOf(fields, 'bucket') ?? '',
  };
}

function numberIn(fields: JsonRecord, name: string): number {
  const value = fields[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

type Send = (request: MongoRequest, signal: AbortSignal) => Promise<unknown>;

function sender(ports: Pick<GridFsPorts, 'engines'>, connection: ConnectionId): Send {
  return (request, signal) => ports.engines().send({ connection, request }, signal);
}

/** The request of a method of the engine's downloads, on the bucket's database. */
function downloadRequest(place: BucketRef, method: string, args: readonly Json[]): MongoRequest {
  return { engine: 'mongodb', database: place.database, method, arguments: args };
}

/** The bytes of a binary of canonical Extended JSON. */
function bytesOf(data: unknown): Uint8Array {
  const binary = isRecord(data) && isRecord(data['$binary']) ? data['$binary'] : undefined;
  return Buffer.from(binary === undefined ? '' : (textOf(binary, 'base64') ?? ''), 'base64');
}

/** The download being written: the bucket, the file and what is said of it. */
interface Download {
  readonly place: BucketRef;
  readonly id: Json;
  readonly title: string;
  readonly length: number;
  readonly cancelled?: string;
}

function downloadOf(args: Json): Download {
  const fields = isRecord(args) ? args : {};
  const cancelled = textOf(fields, 'cancelled');
  return {
    place: bucketOf(fields),
    id: fields['id'] ?? null,
    title: textOf(fields, 'title') ?? '',
    length: numberIn(fields, 'length'),
    ...(cancelled === undefined ? {} : { cancelled }),
  };
}

/** Reads the chunks of the download kept as `download` into the file, in order. */
async function copyChunks(
  send: Send,
  asked: { readonly download: Download; readonly handle: string; readonly path: string },
  signal: AbortSignal,
  say: (detail: string, last?: 'last') => void,
): Promise<void> {
  const file = await open(asked.path, 'w');
  try {
    let done = 0;
    const total = sizeText(asked.download.length);
    say(text.download.progressBytes(sizeText(0), total));
    for (;;) {
      const reply = await send(downloadRequest(asked.download.place, 'readDownload', [asked.handle]), signal);
      if (!isRecord(reply) || reply['done'] === true) {
        break;
      }
      const bytes = bytesOf(reply['data']);
      await file.write(bytes);
      done += bytes.length;
      say(text.download.progressBytes(sizeText(done), total));
    }
    say(text.download.progressBytes(sizeText(done), total), 'last');
  } finally {
    await file.close();
  }
}

/**
 * The writer of `gridfs.download`: the bytes of the file, as the driver's `GridFSBucket` reads them, in `<path>.part`,
 * renamed to `path` once complete. A cancel or a failure deletes the part and leaves `path` as it was.
 */
export async function writeDownload(
  ports: Pick<GridFsPorts, 'engines'>,
  path: string,
  args: Json,
  more: { readonly signal: AbortSignal; readonly progress?: StepProgress },
): Promise<void> {
  const download = downloadOf(args);
  const send = sender(ports, download.place.connection);
  more.progress?.({ title: download.title });
  const opened = await send(
    downloadRequest(download.place, 'openDownload', [download.place.bucket, download.id]),
    more.signal,
  );
  const handle = isRecord(opened) ? textOf(opened, 'download') : undefined;
  if (handle === undefined) {
    throw new Error(`The download of ${path} did not start.`);
  }
  const part = `${path}.part`;
  try {
    // The folder of a copy of `gridfs.open` is made the first time; that of a download was chosen in a dialog.
    await mkdir(dirname(path), { recursive: true });
    await copyChunks(send, { download, handle, path: part }, more.signal, throttled(more.progress));
    // A cancel that came with the last chunk leaves no file either.
    more.signal.throwIfAborted();
    await rename(part, path);
  } catch (error: unknown) {
    await rm(part, { force: true });
    // The download is ended whatever the reason; one that cannot be ended is closed with its client.
    await send(downloadRequest(download.place, 'closeDownload', [handle]), AbortSignal.timeout(cleanUpMs)).catch(
      () => undefined,
    );
    throw more.signal.aborted ? new Cancelled(download.cancelled) : error;
  }
}

/** `gridfs.check-files` `{ files: [{ path, size }] }`: each file is still there, readable, with its size. */
export async function checkFiles(args: Json): Promise<void> {
  const files = isRecord(args) && Array.isArray(args['files']) ? (args['files'] as readonly Json[]) : [];
  for (const each of files.filter(isRecord)) {
    const path = textOf(each, 'path') ?? '';
    const found = await stat(path);
    if (!found.isFile() || found.size !== numberIn(each, 'size')) {
      throw new Error(text.upload.changed(path));
    }
    const handle = await open(path, 'r');
    await handle.close();
  }
}

/** The chunks of one file of an upload, and where the file is in it. */
interface Upload {
  readonly place: BucketRef;
  readonly id: Json;
  readonly path: string;
  readonly size: number;
  readonly where: string;
  readonly files: readonly { readonly name: string; readonly size: number }[];
  readonly index: number;
  readonly skipped: number;
}

function uploadOf(args: Json): Upload {
  const fields = isRecord(args) ? args : {};
  const files = Array.isArray(fields['files']) ? (fields['files'] as readonly Json[]).filter(isRecord) : [];
  return {
    place: bucketOf(fields),
    id: fields['id'] ?? null,
    path: textOf(fields, 'path') ?? '',
    size: numberIn(fields, 'size'),
    where: textOf(fields, 'where') ?? '',
    files: files.map((each) => ({ name: textOf(each, 'name') ?? '', size: numberIn(each, 'size') })),
    index: numberIn(fields, 'index'),
    skipped: numberIn(fields, 'skipped'),
  };
}

/** The files of the upload as the texts of `gridfs.upload` take them. */
function chosen(upload: Upload): readonly { path: string; name: string; size: number; id: Json }[] {
  return upload.files.map((each) => ({ path: '', name: each.name, size: each.size, id: null }));
}

/** *Uploaded 1 file (717 KB) to Local › shop › fs, cancelled.*: the files before this one are in the bucket. */
function cancelledText(upload: Upload): string {
  return uploadedText(chosen(upload).slice(0, upload.index), upload.where, {
    skipped: upload.skipped,
    cancelled: true,
  });
}

/** Reads the chunk `n` of the file from the disk: exactly its bytes, or an error when the file has fewer. */
async function readChunk(file: Awaited<ReturnType<typeof open>>, upload: Upload, n: number): Promise<Uint8Array> {
  const length = chunkLength(upload.size, n);
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, n * chunkLength(upload.size, 0));
  if (bytesRead < length) {
    throw new Error(text.upload.changed(upload.path));
  }
  return buffer;
}

/** Inserts the chunks of the file, one after the other, saying how far the upload is. */
async function insertChunks(send: Send, upload: Upload, signal: AbortSignal, progress?: StepProgress): Promise<void> {
  const say = throttled(progress);
  const before = upload.files.slice(0, upload.index).reduce((sum, each) => sum + each.size, 0);
  const file = await open(upload.path, 'r');
  try {
    for (let n = 0; n < chunkCount(upload.size); n += 1) {
      say(progressText(chosen(upload), upload.index, before + n * chunkLength(upload.size, 0)));
      signal.throwIfAborted();
      const data = Buffer.from(await readChunk(file, upload, n)).toString('base64');
      const chunk = {
        files_id: upload.id,
        n: { $numberInt: String(n) },
        data: { $binary: { base64: data, subType: '00' } },
      };
      // The chunk being sent is not stopped by a cancel, which would leave its insert to land after the chunks are
      // deleted: the cancel is read before the next one.
      await send(
        bucketRequest(upload.place, 'chunks', { method: 'insertOne', arguments: [chunk] }),
        AbortSignal.timeout(cleanUpMs),
      );
    }
    say(progressText(chosen(upload), upload.index, before + upload.size), 'last');
    // A cancel that came with the last chunk stops the file here, before its files document is written.
    signal.throwIfAborted();
  } finally {
    await file.close();
  }
}

/** `gridfs.write-chunks`: the chunks of one file; a cancel or a failure deletes those written. */
export async function writeChunks(
  ports: GridFsPorts,
  args: Json,
  signal: AbortSignal,
  progress?: StepProgress,
): Promise<{ readonly insertedCount: number }> {
  const upload = uploadOf(args);
  const connection = upload.place.connection;
  if (ports.isReadOnly(connection)) {
    // The guard of the runner asks only of engine steps: this one, which writes, asks itself (R5.2).
    throw new GuardRefusal('gridfs.upload/read-only' as RefusalCode, text.readOnly(ports.connectionName(connection)));
  }
  const send = sender(ports, connection);
  progress?.({ title: text.upload.progressTitle(upload.where) });
  try {
    await insertChunks(send, upload, signal, progress);
  } catch (error: unknown) {
    await send(
      bucketRequest(upload.place, 'chunks', { method: 'deleteMany', arguments: [{ files_id: upload.id }] }),
      AbortSignal.timeout(cleanUpMs),
    );
    throw signal.aborted ? new Cancelled(cancelledText(upload)) : error;
  }
  return { insertedCount: chunkCount(upload.size) };
}

/** The actions of the GridFS area that need no window: the check of the files and the chunks of an upload. */
export function gridFsActions(ports: GridFsPorts): Readonly<Record<string, AppAction>> {
  return {
    'gridfs.check-files': (args) => checkFiles(args),
    'gridfs.write-chunks': (args, signal, progress) => writeChunks(ports, args, signal, progress),
  };
}
