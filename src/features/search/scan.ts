/**
 * Feature: search.scan
 *
 * Reads each collection of the search from its first document and keeps the documents in which the text is found.
 * The request is `db.orders.find({})` in batches of 500, with `.limit(1000)`, `.limit(10000)` or `.limit(100000)`
 * when **Read** is not **every document**; nothing is filtered, sorted or projected by the server, and there is no time
 * limit (the search has **Stop**, Q36). The documents keep their BSON types.
 *
 * A collection is read batch by batch, on the worker of the search, through pure functions:
 *
 * - `startScan(collection)` — the collection as it starts to be read;
 * - `scanned(scan, documents, looking)` — the scan after a batch: each document goes through `search.match`, the first
 *   50 results are kept to be listed, the `_id`s of the first 1,000 for `search.open-in-collection`, all are counted;
 * - `isReportDue(before, after)` — whether the batch is news for the page: a result more, or 250 documents more read
 *   by a collection without results; the worker sends the news at most every 200 ms ({@link progressIntervalMs});
 * - `scanEnded(scan, read)` and `scanFailed(scan, message)` — how it ended: *read*, *first 1,000 read*, or the
 *   server's message, keeping what was found before.
 *
 * Three collections are read at the same time (`model/run › nextToRead`). Stopping the search, or starting another,
 * closes every open cursor at once; a reply for a search that is no longer the current one is dropped
 * (`model/run › runAfter`). `parse` does the same for a whole reply at once, for a read that is not streamed.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { isJsonObject, type JsonObject } from '../query/mongosh/ejson';
import { failureOf, isObject, numberOf } from '../tree/types';
import { matches } from './match';
import { wanted, type Wanted } from './text';
import { readLimits, type CollectionScan, type ReadLimit, type SearchCollection, type SearchMode } from './types';

/** The documents of one batch. */
export const batchSize = 500;

/** The results of a collection that are listed; the others are counted. */
export const shownPerCollection = 50;

/** The `_id`s kept per collection for **Open in collection**. */
export const idsKept = 1000;

/** The collections read at the same time. */
export const collectionsAtOnce = 3;

/** The news of a search reaches the page at most this often, in milliseconds. */
export const progressIntervalMs = 200;

/** A collection without results reports the documents it read every this many documents. */
export const readReportEvery = 250;

/** What the text looks for, and whether field names are looked at too. */
export interface Looking {
  readonly wanted: Wanted;
  readonly fieldNames: boolean;
}

/** What the read of one collection is started with. */
export interface ScanArgs {
  readonly connection: string;
  readonly collection: SearchCollection;
  readonly read: ReadLimit;
  readonly text: string;
  readonly mode: SearchMode;
  readonly matchCase: boolean;
  readonly fieldNames: boolean;
}

function readLimitOf(value: unknown): ReadLimit {
  return readLimits.find((limit) => limit === value) ?? 0;
}

function collectionOf(fields: Readonly<Record<string, unknown>>): SearchCollection {
  const text = (name: string): string => {
    const value = fields[name];
    return typeof value === 'string' ? value : '';
  };
  const estimate = numberOf(fields['estimate']);
  return {
    database: text('database'),
    collection: text('collection'),
    view: fields['view'] === true,
    ...(estimate === undefined ? {} : { estimate }),
  };
}

/** The arguments of the read, as `scanArgs` writes them. */
export function scanArgsOf(args: Json): ScanArgs {
  const fields = isObject(args) ? args : {};
  const text = fields['text'];
  const connection = fields['connection'];
  return {
    connection: typeof connection === 'string' ? connection : '',
    collection: collectionOf(fields),
    read: readLimitOf(fields['read']),
    text: typeof text === 'string' ? text : '',
    mode: fields['mode'] === 'regex' ? 'regex' : 'contains',
    matchCase: fields['matchCase'] === true,
    fieldNames: fields['fieldNames'] === true,
  };
}

/** The arguments of the read of one collection. */
export function scanArgs(args: ScanArgs): Json {
  const { collection, ...rest } = args;
  return { ...rest, ...collection };
}

/** Feature: search.scan — `db.orders.find({})` in batches of 500, with the limit of **Read**, without a time limit. */
export function request(_context: Context, args: Json): ReadRequest {
  const asked = scanArgsOf(args);
  const batch = { batchSize: { $numberInt: String(batchSize) } };
  const options = asked.read > 0 ? { ...batch, limit: { $numberInt: String(asked.read) } } : batch;
  return {
    kind: 'engine',
    requests: [
      {
        connection: connectionId(asked.connection),
        request: {
          engine: 'mongodb',
          database: asked.collection.database,
          collection: asked.collection.collection,
          method: 'find',
          arguments: [{}, options],
          ...(asked.read > 0 ? { limit: asked.read } : {}),
        },
      },
    ],
  };
}

/** The collection as it starts to be read. */
export function startScan(collection: SearchCollection): CollectionScan {
  return { collection, state: { kind: 'reading' }, read: 0, found: 0, results: [], ids: [] };
}

/** The scan after a batch of documents. */
export function scanned(scan: CollectionScan, documents: readonly JsonObject[], looking: Looking): CollectionScan {
  const results = [...scan.results];
  const ids = [...scan.ids];
  let found = scan.found;
  for (const document of documents) {
    const result = matches(document, looking.wanted, looking.fieldNames);
    if (result !== undefined) {
      found += 1;
      if (results.length < shownPerCollection) {
        results.push(result);
      }
      if (ids.length < idsKept) {
        ids.push(result.id);
      }
    }
  }
  return { ...scan, read: scan.read + documents.length, found, results, ids };
}

/** Whether a batch is news for the page: a result more, or 250 documents more read without results. */
export function isReportDue(before: CollectionScan, after: CollectionScan): boolean {
  if (after.found > before.found) {
    return true;
  }
  return Math.floor(after.read / readReportEvery) > Math.floor(before.read / readReportEvery);
}

/** The scan read to its end: *first 1,000 read* when it gave as many documents as **Read** allows. */
export function scanEnded(scan: CollectionScan, read: ReadLimit): CollectionScan {
  return { ...scan, state: read > 0 && scan.read >= read ? { kind: 'first-read', limit: read } : { kind: 'read' } };
}

/** The scan whose read failed: the server's message, with what was found before. */
export function scanFailed(scan: CollectionScan, message: string): CollectionScan {
  return { ...scan, state: { kind: 'error', message } };
}

/** Feature: search.scan — the scan of a whole reply: its documents, or the failure of the read. */
export function parse(replies: readonly unknown[], args: Json = null): CollectionScan {
  const asked = scanArgsOf(args);
  const [reply] = replies;
  const start = startScan(asked.collection);
  const failure = failureOf(reply);
  if (failure !== undefined) {
    return scanFailed(start, failure);
  }
  const documents = Array.isArray(reply) ? (reply as readonly Json[]).filter(isJsonObject) : [];
  const looking = { wanted: wanted(asked.text, asked.mode, asked.matchCase), fieldNames: asked.fieldNames };
  return scanEnded(scanned(start, documents, looking), asked.read);
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('search.scan'), request, parse };
