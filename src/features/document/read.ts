/**
 * Feature: document.read
 *
 * Reads one document by its `_id` exactly as it is stored, for the features that edit it, compare it or write it back:
 * `db.orders.find({ _id: ObjectId("…") })`, at most one document, or with a projection of one top-level field when
 * only one value is wanted. The engine reads values without promoting them, so an `Int32`, a `Double` and a `Long` stay
 * apart and a regular expression stays a BSON one. An `_id` that is a number is matched by value, as the server
 * compares numbers: `1` finds the document whose `_id` is `Double(1)`.
 *
 * Started with `{ connection, database, collection, id, field? }`, the `_id` as canonical Extended JSON; the
 * collection is the target's when the arguments do not name one.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { isRecord, textArg, type DocumentPlace, type JsonRecord } from './types';
import { idFilter } from './write/steps';
import { replyDocuments } from './write/values';

/** How long the read may take on the server, in milliseconds (Datardo's choice, R9.2). */
export const readTimeLimitMs = 30_000;

/** What `document.read` is started with. */
export interface ReadArgs {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
  /** The `_id`, as canonical Extended JSON. */
  readonly id: Json;
  /** The top-level field to read alone, besides `_id`. */
  readonly field?: string;
}

/** The arguments that read the document with `_id` `id` of a place, or only its top-level field `field`. */
export function readArgs(place: DocumentPlace, id: Json, field?: string): Json {
  const args = { connection: place.connection, database: place.database, collection: place.collection, id };
  return field === undefined ? args : { ...args, field };
}

/** The top-level field of a field path: `items` of `items.2.qty`. */
export function topField(path: string): string {
  return path.split('.')[0] ?? path;
}

function argsOf(args: Json, context: Context): ReadArgs {
  const fields: JsonRecord = isRecord(args) ? args : {};
  const target = context.target.kind === 'collection' ? context.target : undefined;
  const id = fields['id'];
  if (id === undefined) {
    throw new Error('document.read is started with the _id of a document.');
  }
  const field = textArg(fields, 'field');
  return {
    connection: textArg(fields, 'connection') ?? target?.connection ?? '',
    database: textArg(fields, 'database') ?? target?.database ?? '',
    collection: textArg(fields, 'collection') ?? target?.collection ?? '',
    id,
    ...(field === undefined ? {} : { field }),
  };
}

/** Feature: document.read — the `find` of one document by `_id`. */
export function request(context: Context, args: Json): Extract<ReadRequest, { kind: 'engine' }> {
  const asked = argsOf(args, context);
  const projection: readonly Json[] =
    asked.field === undefined ? [] : [{ projection: { [asked.field]: { $numberInt: '1' } } }];
  return {
    kind: 'engine',
    requests: [
      {
        connection: connectionId(asked.connection),
        request: {
          engine: 'mongodb',
          database: asked.database,
          collection: asked.collection,
          method: 'find',
          arguments: [idFilter(asked.id), ...projection],
          limit: 1,
          timeLimitMs: readTimeLimitMs,
        },
      },
    ],
  };
}

/** Feature: document.read — the document as canonical Extended JSON, or `null` when no document has that `_id`. */
export function parse(replies: readonly unknown[]): JsonRecord | null {
  return replyDocuments(replies[0])[0] ?? null;
}

/** The document a feature asked `document.read` for, under `key` of its answers: `null` when there was none. */
export function readDocument(answers: Readonly<Record<string, unknown>>, key: string): JsonRecord | null {
  const read = answers[key];
  return isRecord(read) ? read : null;
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('document.read'), request, parse };
