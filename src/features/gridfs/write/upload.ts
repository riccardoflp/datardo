/**
 * The reads and the steps of `gridfs.upload`. The bytes of a file are never in the plan: one app step,
 * `gridfs.write-chunks`, reads the file from the disk a chunk at a time and inserts its chunks, deleting those it
 * wrote when it fails or is cancelled (the runner's `instead` would go on with the files document, Q44). Each file is
 * a group of steps (D31): its chunks, its files document, then, with **Replace**, the deletes of the files it
 * replaces, which are not run when the upload of the file fails (D50).
 */
import type { Json } from '../../../shared/engine-request';
import type { Context, EngineStep, ReadFeature, ReadRequest, Step } from '../../../shared/feature';
import { featureId } from '../../../shared/ids';
import { stepText } from '../../runner/step-text';
import { contentTypeOf } from '../content-type';
import { listArgs } from '../list';
import { text } from '../text';
import { bucketRequest, bucketStep, bucketTarget, isRecord, oneLine, textOf, type BucketRef } from '../types';
import type { ChosenFile } from './file';
import { deleteFileSteps } from './plan';

/** The chunk size of an upload: 255 KB, the driver's. */
export const uploadChunkSize = 261_120;

/** How many chunks a file of `size` bytes has: none for 0 bytes. */
export function chunkCount(size: number): number {
  return Math.ceil(Math.max(0, size) / uploadChunkSize);
}

/** The size of the chunk `n` of a file of `size` bytes: 211,763 for the last of 734,003. */
export function chunkLength(size: number, n: number): number {
  return Math.max(0, Math.min(uploadChunkSize, size - n * uploadChunkSize));
}

/** The identifier of the read of the names that exist among those chosen, and whether the bucket is empty. */
export const existingReadId = 'gridfs.upload:existing';

/** What `gridfs.upload:existing` answers. */
export interface Existing {
  readonly names: readonly string[];
  /** Whether the bucket has no files document: the two indexes are created before its first chunk. */
  readonly empty: boolean;
}

function namesOfArgs(args: Json): readonly string[] {
  const names = isRecord(args) ? args['names'] : undefined;
  return Array.isArray(names)
    ? (names as readonly Json[]).filter((name): name is string => typeof name === 'string')
    : [];
}

/**
 * `gridfs.upload:existing`: `db.fs.files.distinct("filename", { filename: { $in: ["a.png", "b.png"] } })` and
 * `db.fs.files.findOne({}, { projection: { _id: 1 } })`.
 */
export const existingRead: ReadFeature = {
  kind: 'read',
  id: featureId(existingReadId),
  request: (_context: Context, args: Json): ReadRequest => {
    const place = listArgs(args);
    const names = [...namesOfArgs(args)];
    const one = { $numberInt: '1' };
    return {
      kind: 'engine',
      requests: [
        {
          connection: place.connection,
          request: bucketRequest(place, 'files', {
            method: 'distinct',
            arguments: ['filename', { filename: { $in: names } }],
          }),
        },
        {
          connection: place.connection,
          request: bucketRequest(place, 'files', { method: 'findOne', arguments: [{}, { projection: { _id: one } }] }),
        },
      ],
    };
  },
  parse: (replies): Existing => {
    const [names, first] = replies;
    return {
      names: Array.isArray(names)
        ? (names as readonly unknown[]).filter((name): name is string => typeof name === 'string')
        : [],
      empty: !isRecord(first),
    };
  },
};

/** What a feature has of `gridfs.upload:existing`. */
export function existingOf(value: unknown): Existing {
  if (!isRecord(value)) {
    return { names: [], empty: false };
  }
  const names = value['names'];
  return {
    names: Array.isArray(names)
      ? (names as readonly Json[]).filter((name): name is string => typeof name === 'string')
      : [],
    empty: value['empty'] === true,
  };
}

/** The identifier of the read of the files a **Replace** deletes. */
export const replacedReadId = 'gridfs.upload:replaced';

/** A file a **Replace** deletes once the new one is uploaded. */
export interface Replaced {
  readonly id: Json;
  readonly filename: string;
}

/** `gridfs.upload:replaced`: `db.fs.files.find({ filename: { $in: [...] } }, { projection: { _id: 1, filename: 1 } })`. */
export const replacedRead: ReadFeature = {
  kind: 'read',
  id: featureId(replacedReadId),
  request: (_context: Context, args: Json): ReadRequest => {
    const place = listArgs(args);
    const one = { $numberInt: '1' };
    const filter = { filename: { $in: [...namesOfArgs(args)] } };
    return {
      kind: 'engine',
      requests: [
        {
          connection: place.connection,
          request: bucketRequest(place, 'files', {
            method: 'find',
            arguments: [filter, { projection: { _id: one, filename: one } }],
          }),
        },
      ],
    };
  },
  parse: (replies): readonly Replaced[] => replacedOf(replies[0]),
};

/** The files a **Replace** deletes, from the read. */
export function replacedOf(value: unknown): readonly Replaced[] {
  return Array.isArray(value)
    ? (value as readonly unknown[])
        .filter(isRecord)
        .map((each) => ({ id: each['_id'] ?? null, filename: textOf(each, 'filename') ?? '' }))
    : [];
}

/** `db.fs.files.createIndex({ filename: 1, uploadDate: 1 })` and `db.fs.chunks.createIndex({ files_id: 1, n: 1 }, { unique: true })`. */
export function indexSteps(place: BucketRef): readonly EngineStep[] {
  const one = { $numberInt: '1' };
  return [
    bucketStep(
      place,
      bucketRequest(place, 'files', { method: 'createIndex', arguments: [{ filename: one, uploadDate: one }] }),
    ),
    bucketStep(
      place,
      bucketRequest(place, 'chunks', {
        method: 'createIndex',
        arguments: [{ files_id: one, n: one }, { unique: true }],
      }),
    ),
  ];
}

/** The text of the chunks of a file as one step: the first chunk, with `…` for its bytes, and their number. */
export function chunksText(place: BucketRef, id: Json, count: number): string {
  const first = { files_id: id, n: { $numberInt: '0' }, data: { $binary: { base64: '', subType: '00' } } };
  const step = {
    kind: 'engine',
    connection: place.connection,
    request: bucketRequest(place, 'chunks', { method: 'insertOne', arguments: [first] }),
    writes: true,
  } as const;
  const written = stepText(step, bucketTarget(place)).replace(/data: [^}]*\)/u, 'data: BinData(0, "…")');
  return `${written} ${text.upload.chunks(count)}`;
}

/** The app step that writes the chunks of a file from the disk. */
export function chunksStep(place: BucketRef, file: ChosenFile, group: string): Step {
  return {
    kind: 'app',
    action: 'gridfs.write-chunks',
    args: {
      connection: place.connection,
      database: place.database,
      bucket: place.bucket,
      id: file.id,
      path: file.path,
      size: file.size,
      chunkSize: uploadChunkSize,
    },
    text: chunksText(place, file.id, chunkCount(file.size)),
    group,
  };
}

/** The files document of an upload: its metadata `{ contentType }` of `gridfs.content-type`, or `{}`. */
export function filesDocument(file: ChosenFile, now: number): Json {
  const contentType = contentTypeOf(file.name);
  return {
    _id: file.id,
    length: { $numberLong: String(file.size) },
    chunkSize: { $numberInt: String(uploadChunkSize) },
    uploadDate: { $date: { $numberLong: String(now) } },
    filename: file.name,
    metadata: contentType === undefined ? {} : { contentType },
  };
}

/** The steps of one file: its chunks, its files document, then the deletes of the files it replaces. */
export function fileSteps(
  place: BucketRef,
  file: ChosenFile,
  replaced: readonly Replaced[],
  now: number,
): readonly Step[] {
  const group = `${file.name} (${oneLine(file.id)})`;
  const insert = bucketStep(
    place,
    bucketRequest(place, 'files', { method: 'insertOne', arguments: [filesDocument(file, now)] }),
  );
  return [
    ...(chunkCount(file.size) > 0 ? [chunksStep(place, file, group)] : []),
    { ...insert, group },
    ...replaced.flatMap((old) => deleteFileSteps(place, old.id).map((step) => ({ ...step, group }))),
  ];
}
