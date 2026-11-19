/**
 * Feature: relation.read
 *
 * Samples every collection of a database, looks up the values that could be references, and gives the references of
 * the database. The read is made of phases, each one request and its parser, which the main process (or a worker)
 * runs in this order and with these bounds:
 *
 * 1. `{ phase: 'collections', connection, database }` — `listCollections`; `system.` collections left out, the others
 *    sorted by name. A failure fails the whole read with the server's message.
 * 2. Per collection that is not a view, 6 collections at a time ({@link collectionsAtOnce}): `{ phase: 'count' }`
 *    and `{ phase: 'indexes' }` together (a failure of either leaves the collection without a number of documents,
 *    or without unique fields), then `{ phase: 'sample', documents, size }`: `$sample` when the estimated count is
 *    above the size, `find({}).limit(size)` otherwise. A sample that fails leaves the collection unreadable
 *    (`CollectionReading.sample.unreadable`). Each collection gives `model/graph › sampledCollection`; the progress is
 *    `text.progress.sampling(n)` first, then `text.progress.sampled(done, n)` after each collection.
 * 3. `model/graph › lookupsOf(candidatesOf(collections))`; `text.progress.checking(candidates, lookups)`; per lookup,
 *    6 at a time, `{ phase: 'lookup', collection, field, values }`, 1,000 values per query. A lookup that fails finds
 *    nothing there.
 * 4. `model/graph › referenceGraph(…)`: the result, kept per connection and database by `kept/references`.
 *
 * Every request has a time limit of 20 seconds (R9.2). The documents keep their BSON types.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { isJsonObject } from '../query/mongosh/ejson';
import { isRecord, type ArgsRecord } from './model/args';
import type { ListedCollection } from './model/graph';
import { compareText, type FoundValues } from './types';

/** How long each request may take on the server, in milliseconds (R9.2). */
export const readTimeLimitMs = 20_000;
/** The collections sampled at the same time, and the lookups sent at the same time. */
export const collectionsAtOnce = 6;
/** The values of one lookup query. */
export const valuesPerLookup = 1000;
/** The sample's size in the background. */
export const backgroundSample = 100;
/** The sizes of **Sample** in the diagram. */
export const diagramSamples = [100, 500, 2000] as const;
/** The largest sample the tool `describe_relations` takes. */
export const largestSample = 2000;
/** The collections and indexes read at most (R9.2; Datardo's choice). */
export const mostEntries = 10_000;

/** The phases of the read. */
export type ReadPhase = 'collections' | 'count' | 'indexes' | 'sample' | 'lookup';

function phaseOf(args: ArgsRecord): ReadPhase {
  const phase = args['phase'];
  return phase === 'count' || phase === 'indexes' || phase === 'sample' || phase === 'lookup' ? phase : 'collections';
}

function text(args: ArgsRecord, name: string): string {
  const value = args[name];
  return typeof value === 'string' ? value : '';
}

function on(
  args: ArgsRecord,
  collection: string | undefined,
  call: Omit<MongoRequest, 'engine' | 'database'>,
): MongoRequest {
  const request: MongoRequest = {
    engine: 'mongodb',
    database: text(args, 'database'),
    ...call,
    timeLimitMs: readTimeLimitMs,
  };
  return collection === undefined ? request : { ...request, collection };
}

function sampleRequest(args: ArgsRecord): MongoRequest {
  const size = typeof args['size'] === 'number' ? args['size'] : backgroundSample;
  const documents = args['documents'];
  const collection = text(args, 'collection');
  return typeof documents === 'number' && documents > size
    ? on(args, collection, {
        method: 'aggregate',
        arguments: [[{ $sample: { size: { $numberInt: String(size) } } }]],
        limit: size,
      })
    : on(args, collection, { method: 'find', arguments: [{}], limit: size });
}

function lookupRequests(args: ArgsRecord): readonly MongoRequest[] {
  const field = text(args, 'field');
  const values = Array.isArray(args['values']) ? (args['values'] as readonly Json[]) : [];
  const requests: MongoRequest[] = [];
  for (let first = 0; first < values.length; first += valuesPerLookup) {
    const chunk = values.slice(first, first + valuesPerLookup);
    requests.push(
      on(args, text(args, 'collection'), {
        method: 'find',
        arguments: [{ [field]: { $in: chunk } }, { projection: { [field]: { $numberInt: '1' } } }],
        limit: chunk.length,
      }),
    );
  }
  return requests;
}

/** The requests of one phase. */
export function phaseRequests(args: ArgsRecord): readonly MongoRequest[] {
  const collection = text(args, 'collection');
  switch (phaseOf(args)) {
    case 'collections':
      return [
        on(args, undefined, {
          method: 'listCollections',
          arguments: [{}, { nameOnly: false, authorizedCollections: true }],
          limit: mostEntries,
        }),
      ];
    case 'count':
      return [on(args, collection, { method: 'estimatedDocumentCount', arguments: [] })];
    case 'indexes':
      return [on(args, collection, { method: 'listIndexes', arguments: [], limit: mostEntries })];
    case 'sample':
      return [sampleRequest(args)];
    case 'lookup':
      return lookupRequests(args);
  }
}

/** Feature: relation.read — the request of the phase `args.phase` (`collections` unless said). */
export function request(_context: Context, args: Json): ReadRequest {
  const fields: ArgsRecord = isRecord(args) ? args : {};
  const connection = connectionId(text(fields, 'connection'));
  return { kind: 'engine', requests: phaseRequests(fields).map((each) => ({ connection, request: each })) };
}

function documentsOf(reply: unknown): readonly Json[] {
  return Array.isArray(reply) ? (reply as readonly Json[]) : [];
}

/** The collections and views of a `listCollections` reply: no `system.` collection, sorted by name. */
export function parseCollections(reply: unknown): readonly ListedCollection[] {
  return documentsOf(reply)
    .filter(isJsonObject)
    .flatMap((entry) => {
      const name = entry['name'];
      return typeof name === 'string' && !name.startsWith('system.') ? [{ entry, name }] : [];
    })
    .map(({ entry, name }) => {
      const options = entry['options'];
      const viewOn = isJsonObject(options) && typeof options['viewOn'] === 'string' ? options['viewOn'] : undefined;
      return entry['type'] === 'view'
        ? { name, view: true, ...(viewOn === undefined ? {} : { viewOn }) }
        : { name, view: false };
    })
    .sort((left, right) => compareText(left.name, right.name));
}

/** The estimated number of documents, from a reply of a number in Extended JSON; `undefined` for anything else. */
export function parseCount(reply: unknown): number | undefined {
  if (typeof reply === 'number') {
    return reply;
  }
  const inner = isJsonObject(reply as Json) ? Object.values(reply as Record<string, Json>)[0] : undefined;
  const count = typeof inner === 'string' ? Number(inner) : Number.NaN;
  return Number.isFinite(count) ? count : undefined;
}

/** The fields of the unique indexes of one field, neither partial nor `_id`. */
export function parseUnique(reply: unknown): readonly string[] {
  return documentsOf(reply)
    .filter(isJsonObject)
    .filter(
      (index) => index['unique'] === true && index['partialFilterExpression'] === undefined && index['name'] !== '_id_',
    )
    .flatMap((index) => {
      const keys = isJsonObject(index['key']) ? Object.keys(index['key']) : [];
      const [only] = keys;
      return keys.length === 1 && only !== undefined && only !== '_id' ? [only] : [];
    });
}

/** The value at a dotted path of a document of a lookup. */
function valueAt(document: Json, path: string): Json | undefined {
  let current: Json | undefined = document;
  for (const part of path.split('.')) {
    current = isJsonObject(current) ? current[part] : undefined;
  }
  return current;
}

/** What a lookup found: the values of the field in the documents of every reply. */
export function parseLookup(replies: readonly unknown[], args: ArgsRecord): FoundValues {
  const field = text(args, 'field');
  const values = replies.flatMap(documentsOf).flatMap((document) => {
    const value = valueAt(document, field);
    return value === undefined ? [] : [value];
  });
  return { collection: text(args, 'collection'), field, values };
}

/** Feature: relation.read — what the replies of the phase `args.phase` say. */
export function parse(replies: readonly unknown[], args: Json): unknown {
  const fields: ArgsRecord = isRecord(args) ? args : {};
  switch (phaseOf(fields)) {
    case 'collections':
      return parseCollections(replies[0]);
    case 'count':
      return parseCount(replies[0]) ?? null;
    case 'indexes':
      return parseUnique(replies[0]);
    case 'sample':
      return documentsOf(replies[0]);
    case 'lookup':
      return parseLookup(replies, fields);
  }
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('relation.read'), request, parse };
