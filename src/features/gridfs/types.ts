/**
 * What the cards of the GridFS area share: the bucket a feature acts on (`BucketRef`, the glossary's), written
 * `Local › shop › fs`; a file as `gridfs.list` returns it; the two collections of a bucket; and the steps of its
 * writes, which are never recorded in the undo history nor published for redis-oplog.
 *
 * A feature of this area is started with `args.connection`, `args.database` and `args.bucket` (the tree, the page and
 * the inspector give them), and `args.id`, the `_id` of the file as canonical Extended JSON, for a feature that acts
 * on one file. Values cross as canonical Extended JSON (R5.5).
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import { refuse, type Answers, type Context, type EngineStep, type Outcome } from '../../shared/feature';
import { connectionId, type ConnectionId } from '../../shared/ids';
import { targetConnection, type Target } from '../../shared/target';
import { formattedValue } from '../aggregate/mongosh/format';
import { numberOf } from '../document/write/values';
import { stepText } from '../runner/step-text';
import { text } from './text';

/** A JSON object, as a reader of arguments and replies sees it. */
export type JsonRecord = Readonly<Record<string, Json>>;

/** Whether a value is a JSON object (not an array, not null). */
export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A text of an object, or `undefined`. */
export function textOf(fields: JsonRecord, name: string): string | undefined {
  const value = fields[name];
  return typeof value === 'string' ? value : undefined;
}

/** A bucket: the connection, the database and the name before `.files` and `.chunks`. */
export interface BucketRef {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly bucket: string;
}

/** Where a feature of this area acts: a bucket, with how its connection is now (D14). */
export interface BucketPlace extends BucketRef {
  /** The name of the connection, or its identifier when it is no longer saved. */
  readonly connectionName: string;
  readonly readOnly: boolean;
}

/** The arguments a feature was started with, as an object; empty when there are none. */
export function startArgs(answers: Answers): JsonRecord {
  const args = answers['args'];
  return isRecord(args) ? args : {};
}

/** The connection a feature acts on, from its arguments or its target, with its name and whether it is read-only. */
function connectionOf(context: Context, args: JsonRecord): Omit<BucketPlace, 'database' | 'bucket'> {
  const id = textOf(args, 'connection') ?? targetConnection(context.target);
  if (id === undefined) {
    throw new Error(`${context.feature} is started on a connection.`);
  }
  const saved = context.state.connections.saved.find((each) => each.id === id);
  return { connection: connectionId(id), connectionName: saved?.name ?? id, readOnly: saved?.readOnly ?? false };
}

/** The database a feature acts on: `args.database`, else the target's. */
export function databaseOf(context: Context, args: JsonRecord): string | undefined {
  const target: Target = context.target;
  return (
    textOf(args, 'database') ??
    (target.kind === 'database' || target.kind === 'collection' ? target.database : undefined)
  );
}

/**
 * The bucket a feature acts on: `args.connection`, `args.database` and `args.bucket`. Every control that starts a
 * feature of this area names them, so a start without them is a fault of the caller.
 */
export function bucketPlace(context: Context, answers: Answers): BucketPlace {
  const args = startArgs(answers);
  const database = databaseOf(context, args);
  const bucket = textOf(args, 'bucket');
  if (database === undefined || bucket === undefined) {
    throw new Error(`${context.feature} is started on a bucket.`);
  }
  return { ...connectionOf(context, args), database, bucket };
}

/** The database of a connection a feature acts on, for `gridfs.create-bucket`, with an empty bucket. */
export function databasePlace(context: Context, answers: Answers): BucketPlace {
  const args = startArgs(answers);
  const database = databaseOf(context, args);
  if (database === undefined) {
    throw new Error(`${context.feature} is started on a database.`);
  }
  return { ...connectionOf(context, args), database, bucket: textOf(args, 'bucket') ?? '' };
}

/** `Local › shop › fs`: the bucket as titles and messages write it. */
export function whereText(place: BucketPlace): string {
  return `${place.connectionName} › ${place.database} › ${place.bucket}`;
}

/** The arguments a bucket is named by, as the features of this area are started and read with. */
export function bucketArgs(place: BucketRef): JsonRecord {
  return { connection: place.connection, database: place.database, bucket: place.bucket };
}

/** The target of a bucket: its database. */
export function bucketTarget(place: BucketRef): Target {
  return { kind: 'database', connection: place.connection, database: place.database };
}

/** `fs.files`. */
export function filesCollection(bucket: string): string {
  return `${bucket}.files`;
}

/** `fs.chunks`. */
export function chunksCollection(bucket: string): string {
  return `${bucket}.chunks`;
}

/** How long a read or a write of this area may take on the server, in milliseconds (Datardo's choice, R9.2). */
export const timeLimitMs = 30_000;

/** A method called on a collection of the bucket. */
export function bucketRequest(
  place: BucketRef,
  part: 'files' | 'chunks',
  call: { readonly method: string; readonly arguments: readonly Json[]; readonly limit?: number },
): MongoRequest {
  return {
    engine: 'mongodb',
    database: place.database,
    collection: part === 'files' ? filesCollection(place.bucket) : chunksCollection(place.bucket),
    method: call.method,
    arguments: call.arguments,
    ...(call.limit === undefined ? {} : { limit: call.limit }),
    timeLimitMs,
  };
}

/** A step that writes to the bucket, written as the confirmation and the Log show it, the database being the plan's. */
export function bucketStep(place: BucketRef, request: MongoRequest): EngineStep {
  const step = { kind: 'engine', connection: place.connection, request, writes: true } as const;
  return { ...step, text: stepText(step, bucketTarget(place)) };
}

/** The refusal of a write through a read-only connection, with the code of the card that raises it. */
export function refusedReadOnly(place: BucketPlace, code: string, message?: string): Outcome | undefined {
  return place.readOnly ? refuse(code, message ?? text.readOnly(place.connectionName)) : undefined;
}

/** A file of a bucket, as `gridfs.list` returns it. */
export interface GridFile {
  /** The `_id`, as canonical Extended JSON, with its type. */
  readonly id: Json;
  /** The `_id` in mongosh syntax: `ObjectId("65f1c0ffee0000000000a2c1")`, `"readme"`, `7`. */
  readonly idText: string;
  /** `filename`; empty when missing. */
  readonly filename: string;
  /** `length`, in bytes. */
  readonly length: number;
  readonly chunkSize: number;
  /** `uploadDate`, in milliseconds since 1970; `undefined` when it is not a date. */
  readonly uploadDate?: number;
  /** `metadata.contentType` when it is a text, else the `contentType` at the top, which older drivers wrote. */
  readonly contentType?: string;
  /** `metadata`, when there is one. */
  readonly metadata?: Json;
  /** The files document as the server returned it (`FilesDocument`). */
  readonly document: JsonRecord;
}

/** A value in mongosh syntax on one line (`query.format`). */
export function oneLine(value: Json): string {
  return formattedValue(value, { kind: 'one-line' });
}

/** The milliseconds of a date in canonical Extended JSON; `undefined` for any other value. */
export function dateOf(value: Json | undefined): number | undefined {
  if (!isRecord(value) || !('$date' in value)) {
    return undefined;
  }
  const inner = value['$date'];
  if (typeof inner === 'string') {
    const parsed = Date.parse(inner);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return numberOf(inner);
}

/** The content type a files document declares: `metadata.contentType` when it is a text, else the top one. */
export function declaredContentType(document: JsonRecord): string | undefined {
  const metadata = document['metadata'];
  const inMetadata = isRecord(metadata) ? metadata['contentType'] : undefined;
  if (typeof inMetadata === 'string') {
    return inMetadata;
  }
  const top = document['contentType'];
  return typeof top === 'string' ? top : undefined;
}

/** A file of a files document. */
export function fileOf(document: JsonRecord): GridFile {
  const id = document['_id'] ?? null;
  const uploadDate = dateOf(document['uploadDate']);
  const contentType = declaredContentType(document);
  const metadata = document['metadata'];
  return {
    id,
    idText: oneLine(id),
    filename: textOf(document, 'filename') ?? '',
    length: numberOf(document['length']) ?? 0,
    chunkSize: numberOf(document['chunkSize']) ?? 0,
    ...(uploadDate === undefined ? {} : { uploadDate }),
    ...(contentType === undefined ? {} : { contentType }),
    ...(metadata === undefined ? {} : { metadata }),
    document,
  };
}

/** The `_id` of the file a feature is started on, as canonical Extended JSON. */
export function fileIdOf(context: Context, answers: Answers): Json {
  const args = startArgs(answers);
  if (!('id' in args)) {
    throw new Error(`${context.feature} is started on a file.`);
  }
  return args['id'] ?? null;
}

/** A control of the page or the inspector: a feature it starts, or a text it copies. */
export type GridControl =
  | {
      readonly kind: 'start';
      readonly label: string;
      readonly tooltip?: string;
      /** The control's identifier, written whole, as `data-feature` carries it. */
      readonly element: string;
      readonly feature: string;
      readonly target: Target;
      readonly args: Json;
    }
  | { readonly kind: 'copy'; readonly label: string; readonly text: string };

/** A control that starts a feature on the bucket, with more arguments (the `_id` of a file). */
export function startControl(
  label: string,
  ids: { readonly element: string; readonly feature: string; readonly tooltip?: string },
  place: BucketRef,
  args: JsonRecord = {},
): GridControl {
  return {
    kind: 'start',
    label,
    ...(ids.tooltip === undefined ? {} : { tooltip: ids.tooltip }),
    element: ids.element,
    feature: ids.feature,
    target: bucketTarget(place),
    args: { ...bucketArgs(place), ...args },
  };
}

/** The arguments of a feature started on one file: its `_id` with its type, and its name. */
export function fileArgs(file: GridFile): JsonRecord {
  return { id: file.id, filename: file.filename };
}
