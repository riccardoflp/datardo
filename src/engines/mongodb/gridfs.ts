/**
 * The bytes of a GridFS file read through the driver's `GridFSBucket`, a chunk at a time, for `gridfs.download` and
 * `gridfs.open`: the file is never whole in memory, and what the driver finds wrong (a chunk missing, a file gone) is
 * its own error.
 *
 * - `openDownload` `[bucket, id]`, on the request's database: opens the download of the file `id` of the bucket and
 *   keeps it; replies `{ download }`, its identifier. Nothing is read yet.
 * - `readDownload` `[download]`: the next bytes, one chunk, as `{ data, done }`: `data` is binary, `null` once the file
 *   is read, and `done` says so. A read cancelled ends the download.
 * - `closeDownload` `[download]`: ends the download and forgets it; `{ closed }` says whether it was open.
 *
 * The download is read with the values promoted, as the driver's GridFS expects its files document and its chunks.
 */
import { Binary, GridFSBucket, ObjectId, type GridFSBucketReadStream } from 'mongodb';
import type { Json } from '../../shared/engine-request';
import { EngineError } from '../engine';
import { stoppable, type Call } from './call';
import { closeKept } from './handles';

/** A new ObjectId as canonical Extended JSON: the `_id` of the files document of a file being uploaded. */
export function newObjectId(): Json {
  return { $oid: new ObjectId().toHexString() };
}

function opened(call: Call): GridFSBucketReadStream {
  const [bucketName, id] = call.args;
  if (typeof bucketName !== 'string' || bucketName === '') {
    throw new EngineError('openDownload takes the name of the bucket and the _id of the file.');
  }
  // The driver's GridFS reads `length`, `chunkSize` and `n` as numbers, and `data` as a binary.
  const db = call.client.db(call.request.database, { promoteValues: true, promoteLongs: true, promoteBuffers: false });
  return new GridFSBucket(db, { bucketName }).openDownloadStream(id as ObjectId);
}

async function nextBytes(call: Call): Promise<{ readonly data: Binary | null; readonly done: boolean }> {
  const kept = call.handles.download(call.args[0]);
  const next = await stoppable(
    call.options.signal,
    async () => {
      call.handles.release(call.args[0]);
      await kept.stream.abort();
    },
    () => kept.chunks.next(),
  );
  if (next.done === true) {
    return { data: null, done: true };
  }
  return { data: new Binary(next.value), done: false };
}

async function closed(call: Call): Promise<{ readonly closed: boolean }> {
  const kept = call.handles.release(call.args[0]);
  if (kept !== undefined) {
    await closeKept(kept);
  }
  return { closed: kept !== undefined };
}

/** Carries out a method of the downloads of GridFS; `undefined` when the method is not one of them. */
export function gridFsMethod(call: Call): Promise<unknown> | undefined {
  switch (call.request.method) {
    case 'openDownload': {
      const stream = opened(call);
      const chunks = stream[Symbol.asyncIterator]() as AsyncIterator<Uint8Array>;
      return Promise.resolve({ download: call.handles.keep({ kind: 'download', stream, chunks }) });
    }
    case 'readDownload':
      return nextBytes(call);
    case 'closeDownload':
      return closed(call);
    default:
      return undefined;
  }
}
