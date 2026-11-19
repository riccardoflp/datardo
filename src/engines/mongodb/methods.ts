/**
 * The methods of MongoDB a request can name, as mongosh names them, carried out through the driver. Arguments arrive
 * as canonical Extended JSON and replies leave as canonical Extended JSON, so that every BSON type survives (R5.5).
 */
import { BSON, type AbstractCursor, type Collection, type Db, type Document } from 'mongodb';
import type { Json, MongoRequest } from '../../shared/engine-request';
import { EngineError } from '../engine';
import { documentOfBytes } from './document-bytes';

/** How many documents a method that returns many gives at most when the request names no limit (R9.2). */
export const mostDocuments = 1000;

/** A value of Extended JSON as the driver takes it, its types kept. */
export function fromExtendedJson(value: Json): unknown {
  return (BSON.EJSON.deserialize({ value }, { relaxed: false }) as { value: unknown }).value;
}

/** A value of the driver as canonical Extended JSON. */
export function toExtendedJson(value: unknown): Json {
  return (BSON.EJSON.serialize({ value }, { relaxed: false }) as { value: Json }).value;
}

/**
 * A reply of the driver as canonical Extended JSON. A document asked for as BSON bytes (`raw: true`) is read from its
 * bytes, so that a BSON undefined and a date beyond JavaScript survive; with values not promoted, the driver gives
 * bytes for nothing else.
 */
function replyOf(value: unknown): Json {
  return value instanceof Uint8Array ? documentOfBytes(value) : toExtendedJson(value);
}

/** The options of a method that returns documents, which the driver then gives as BSON bytes (see `replyOf`). */
function asBytes(options: Options): Options {
  return { ...options, raw: true };
}

async function readCursor(cursor: AbstractCursor, limit: number): Promise<unknown[]> {
  const documents: unknown[] = [];
  try {
    while (documents.length < limit) {
      const next: unknown = await cursor.next();
      if (next === null) {
        break;
      }
      documents.push(next);
    }
  } finally {
    await cursor.close();
  }
  return documents;
}

type Options = Document & { readonly signal: AbortSignal; readonly timeoutMS?: number };

function document(value: unknown): Document {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

function documents(value: unknown): Document[] {
  return Array.isArray(value) ? value.map(document) : [];
}

/**
 * A number of the options as the driver wants it: the driver reads `skip`, `limit`, `maxTimeMS` and the like only as
 * numbers of JavaScript, and ignores an Int32, a Double or a Long. Only the first level is changed; a document of the
 * options (a hint, a collation, a projection) keeps its types.
 */
function optionValue(value: unknown): unknown {
  return value instanceof BSON.Int32 || value instanceof BSON.Double || value instanceof BSON.Long
    ? value instanceof BSON.Long
      ? value.toNumber()
      : value.valueOf()
    : value;
}

/** The options a request gives a method, with the signal and the time limit. */
function merged(given: unknown, options: Options): Options {
  const entries = Object.entries(document(given)).map(([name, value]) => [name, optionValue(value)] as const);
  return { ...Object.fromEntries(entries), ...options };
}

function collectionMethod(
  collection: Collection,
  method: string,
  args: readonly unknown[],
  options: Options,
): Promise<unknown> | undefined {
  const [first, second, third] = args;
  switch (method) {
    case 'findOne':
      return collection.findOne(document(first), asBytes(merged(second, options)));
    case 'countDocuments':
      return collection.countDocuments(document(first), merged(second, options));
    case 'estimatedDocumentCount':
      return collection.estimatedDocumentCount(merged(first, options));
    case 'distinct':
      return collection.distinct(String(first), document(second), merged(third, options));
    case 'insertOne':
      return collection.insertOne(document(first), merged(second, options));
    case 'insertMany':
      return collection.insertMany(documents(first), merged(second, options));
    case 'updateOne':
      return collection.updateOne(
        document(first),
        Array.isArray(second) ? documents(second) : document(second),
        merged(third, options),
      );
    case 'updateMany':
      return collection.updateMany(
        document(first),
        Array.isArray(second) ? documents(second) : document(second),
        merged(third, options),
      );
    case 'replaceOne':
      return collection.replaceOne(document(first), document(second), merged(third, options));
    case 'deleteOne':
      return collection.deleteOne(document(first), merged(second, options));
    case 'deleteMany':
      return collection.deleteMany(document(first), merged(second, options));
    default:
      return undefined;
  }
}

function cursorOf(
  db: Db,
  request: MongoRequest,
  args: readonly unknown[],
  options: Options,
): AbstractCursor | undefined {
  const [first, second] = args;
  const collection = request.collection === undefined ? undefined : db.collection(request.collection);
  switch (request.method) {
    case 'find':
      return collection?.find(document(first), asBytes(merged(second, options)));
    case 'aggregate':
      return collection === undefined
        ? db.aggregate(documents(first), asBytes(merged(second, options)))
        : collection.aggregate(documents(first), asBytes(merged(second, options)));
    case 'listCollections':
      return db.listCollections(document(first), merged(second, options));
    case 'listIndexes':
      return collection?.listIndexes(merged(first, options));
    default:
      return undefined;
  }
}

/** Carries out a request on a database of the client and returns the reply as canonical Extended JSON. */
export async function callMethod(db: Db, request: MongoRequest, signal: AbortSignal): Promise<Json> {
  const args = request.arguments.map(fromExtendedJson);
  const options: Options = {
    signal,
    ...(request.timeLimitMs === undefined ? {} : { timeoutMS: request.timeLimitMs }),
  };
  if (request.method === 'runCommand') {
    return toExtendedJson(await db.command(document(args[0]), options));
  }
  const cursor = cursorOf(db, request, args, options);
  if (cursor !== undefined) {
    return (await readCursor(cursor, request.limit ?? mostDocuments)).map(replyOf);
  }
  const reply =
    request.collection === undefined
      ? undefined
      : collectionMethod(db.collection(request.collection), request.method, args, options);
  if (reply === undefined) {
    throw new EngineError(`Datardo cannot call ${request.method} on MongoDB yet.`);
  }
  return replyOf(await reply);
}
