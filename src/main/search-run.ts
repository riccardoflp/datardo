/**
 * One search of the Search documents page carried out against MongoDB (`search.collections`, then `search.scan`): the
 * collections of the scope listed, then read from their first document through cursors kept by the engine, three
 * collections at a time, in batches of 500, without a time limit; each batch goes through `search.match`. The news
 * reaches whoever follows the search at most every 200 ms. Stopping (the signal) closes every open cursor at once and
 * keeps what was found; nothing that arrives after changes the search.
 */
import { firstRequest, nextRequests, parse as parseCollections } from '../features/search/collections';
import { isRunning, nextToRead, runAfter, startRun, type SearchEvent } from '../features/search/model/run';
import {
  batchSize,
  isReportDue,
  progressIntervalMs,
  scanEnded,
  scanFailed,
  scanned,
  startScan,
  type Looking,
} from '../features/search/scan';
import { wanted } from '../features/search/text';
import type { CollectionScan, SearchCollection, SearchInput, SearchRun } from '../features/search/types';
import { isJsonObject, type JsonObject } from '../features/query/mongosh/ejson';
import { withoutSecrets } from '../features/runner/error';
import type { ConnectionRequest, Json, MongoRequest } from '../shared/engine-request';
import type { ConnectionId } from '../shared/ids';

/** What a search needs: the engines, the time, and who follows it. */
export interface SearchRunPorts {
  readonly send: (request: ConnectionRequest, signal: AbortSignal) => Promise<unknown>;
  readonly now: () => number;
  /** The search changed: its head, and the collections whose scan changed (`all` for every one of them). */
  readonly changed: (run: SearchRun, scans: readonly number[] | 'all') => void;
}

/** One search to carry out. */
export interface SearchAsked {
  readonly id: number;
  readonly connection: ConnectionId;
  readonly input: SearchInput;
  /** The database searched alone when the user may not list the databases. */
  readonly fallback: string;
  /** The keys the connection excluded from searches when the search started (`tree.excluded`). */
  readonly exclusions?: readonly string[];
}

/** The search as it goes, and the cursors open now. */
class Search {
  run: SearchRun;
  /** The cursors open now, with the collection each reads. */
  readonly cursors = new Map<string, SearchCollection>();
  private readonly pending = new Set<number>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastReport = 0;

  constructor(
    readonly ports: SearchRunPorts,
    readonly asked: SearchAsked,
  ) {
    this.run = startRun(asked.id, asked.input, ports.now());
  }

  /** Applies an event and tells it: at once for the whole search, at most every 200 ms for a collection. */
  apply(event: SearchEvent, index?: number): void {
    const before = this.run;
    this.run = runAfter(before, event);
    if (this.run === before) {
      return;
    }
    if (index === undefined) {
      this.flush();
      this.ports.changed(this.run, 'all');
      return;
    }
    this.pending.add(index);
    this.timer ??= setTimeout(
      () => {
        this.flush();
      },
      Math.max(0, this.lastReport + progressIntervalMs - this.ports.now()),
    );
  }

  /** Tells what waits to be told. */
  flush(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.pending.size === 0) {
      return;
    }
    const indices = [...this.pending].sort((left, right) => left - right);
    this.pending.clear();
    this.lastReport = this.ports.now();
    this.ports.changed(this.run, indices);
  }
}

function failureMessage(error: unknown): string {
  return withoutSecrets(error instanceof Error ? error.message : String(error));
}

/** The replies of the listing, each request after the replies before it; a failure is a reply of its own. */
async function listed(search: Search, signal: AbortSignal): Promise<ReturnType<typeof parseCollections>> {
  const { input, connection, fallback, exclusions = [] } = search.asked;
  const scope = input.database === undefined ? {} : { database: input.database, collections: [...input.collections] };
  const args: Json = { connection, ...scope, views: input.views, fallback, exclusions: [...exclusions] };
  const replies: unknown[] = [];
  let next: readonly ConnectionRequest[] = [firstRequest(args)];
  while (next.length > 0) {
    for (const request of next) {
      signal.throwIfAborted();
      replies.push(await search.ports.send(request, signal).catch((error: unknown) => errorReply(error, signal)));
    }
    next = nextRequests(args, replies);
  }
  return parseListing(args, replies);
}

function errorReply(error: unknown, signal: AbortSignal): unknown {
  signal.throwIfAborted();
  return { kind: 'error', message: failureMessage(error) };
}

function parseListing(args: Json, replies: readonly unknown[]): ReturnType<typeof parseCollections> {
  return parseCollections(replies, args);
}

/** A request on the collection of a scan. */
function on(search: Search, collection: SearchCollection, method: string, args: readonly Json[]): ConnectionRequest {
  const request: MongoRequest = {
    engine: 'mongodb',
    database: collection.database,
    collection: collection.collection,
    method,
    arguments: args,
  };
  return { connection: search.asked.connection, request };
}

/** Closes a cursor kept by the engine; what fails to close is given up, as the search no longer reads it. */
async function closeCursor(search: Search, cursor: string): Promise<void> {
  const collection = search.cursors.get(cursor);
  search.cursors.delete(cursor);
  if (collection === undefined) {
    return;
  }
  await search.ports
    .send(on(search, collection, 'closeCursor', [cursor]), AbortSignal.timeout(10_000))
    .catch(() => undefined);
}

/** Reads one collection to its end or to **Read**, batch by batch, telling its news. */
async function readCollection(search: Search, index: number, looking: Looking, signal: AbortSignal): Promise<void> {
  const collection = search.run.scans[index]?.collection;
  if (collection === undefined) {
    return;
  }
  const read = search.asked.input.read;
  let scan: CollectionScan = startScan(collection);
  const tell = (changed: CollectionScan): void => {
    scan = changed;
    search.apply({ kind: 'scanned', search: search.asked.id, index, scan, at: search.ports.now() }, index);
  };
  tell(scan);
  try {
    const options = { batchSize: { $numberInt: String(batchSize) }, ...(read > 0 ? { limit: read } : {}) };
    const opened = await search.ports.send(on(search, collection, 'openCursor', ['find', [{}, options], []]), signal);
    const cursor = isJsonObject(opened as Json) ? (opened as JsonObject)['cursor'] : undefined;
    if (typeof cursor !== 'string') {
      throw new Error('The server opened no cursor.');
    }
    search.cursors.set(cursor, collection);
    try {
      scan = await readBatches(search, { collection, cursor, read, looking, signal }, scan, tell);
    } finally {
      await closeCursor(search, cursor);
    }
    tell(scanEnded(scan, read));
  } catch (error: unknown) {
    if (!signal.aborted) {
      tell(scanFailed(scan, failureMessage(error)));
    }
  }
}

interface Batches {
  readonly collection: SearchCollection;
  readonly cursor: string;
  readonly read: number;
  readonly looking: Looking;
  readonly signal: AbortSignal;
}

/** The batches of a cursor until it is exhausted or gave **Read**; a batch is told when it is news for the page. */
async function readBatches(
  search: Search,
  batches: Batches,
  first: CollectionScan,
  tell: (scan: CollectionScan) => void,
): Promise<CollectionScan> {
  let scan = first;
  for (;;) {
    const reply = await search.ports.send(
      on(search, batches.collection, 'cursorNext', [batches.cursor, batchSize]),
      batches.signal,
    );
    const fields = isJsonObject(reply as Json) ? (reply as JsonObject) : {};
    const documents = Array.isArray(fields['documents']) ? fields['documents'].filter(isJsonObject) : [];
    const after = scanned(scan, documents, batches.looking);
    if (isReportDue(scan, after)) {
      tell(after);
    }
    scan = after;
    if (fields['exhausted'] === true || documents.length === 0 || (batches.read > 0 && after.read >= batches.read)) {
      return scan;
    }
  }
}

/** Reads the collections listed, three at a time, until each has ended or the search is stopped. */
async function readAll(search: Search, looking: Looking, signal: AbortSignal): Promise<void> {
  const reading = new Map<number, Promise<void>>();
  for (;;) {
    for (const index of nextToRead(search.run)) {
      const started = readCollection(search, index, looking, signal).finally(() => reading.delete(index));
      reading.set(index, started);
    }
    if (reading.size === 0 || signal.aborted) {
      return;
    }
    await Promise.race([...reading.values(), aborted(signal)]);
  }
}

function aborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        resolve();
      },
      { once: true },
    );
  });
}

/** Stops the search: what was found stays, *stopped*; every cursor still open is closed at once. */
async function stopped(search: Search): Promise<void> {
  search.apply({ kind: 'stopped', search: search.asked.id, at: search.ports.now() });
  await Promise.all([...search.cursors.keys()].map((cursor) => closeCursor(search, cursor)));
}

/** Carries out a search to its end, or until `signal` stops it; the search as it ended. */
export async function runSearch(ports: SearchRunPorts, asked: SearchAsked, signal: AbortSignal): Promise<SearchRun> {
  const search = new Search(ports, asked);
  ports.changed(search.run, 'all');
  const looking = wanted(asked.input.text, asked.input.mode, asked.input.matchCase);
  try {
    if (looking.kind === 'error') {
      search.apply({ kind: 'list-failed', search: asked.id, message: looking.message, at: ports.now() });
      return search.run;
    }
    const collections = await listed(search, signal);
    if (collections.kind === 'error') {
      search.apply({ kind: 'list-failed', search: asked.id, message: collections.message, at: ports.now() });
      return search.run;
    }
    const { collections: listedCollections, excluded } = collections;
    search.apply({ kind: 'listed', search: asked.id, collections: listedCollections, excluded, at: ports.now() });
    await readAll(search, { wanted: looking, fieldNames: asked.input.fieldNames }, signal);
  } catch (error: unknown) {
    if (!signal.aborted) {
      search.apply({ kind: 'list-failed', search: asked.id, message: failureMessage(error), at: ports.now() });
    }
  }
  if (signal.aborted && isRunning(search.run)) {
    await stopped(search);
  }
  search.flush();
  return search.run;
}
