/**
 * Cursors a client keeps between requests, for a playground that reads a cursor a batch at a time (`next`, `hasNext`,
 * `forEach`):
 *
 * - `openCursor` `[of, arguments, shape]`: `of` is `find` (on the request's collection) or `aggregate` (on it, or on
 *   the database without one), `arguments` those of the engine's `find` `[filter, options]` or `aggregate`
 *   `[pipeline, options]`, and `shape` the steps `{ method, arguments }` of mongosh's cursor (`sort`, `limit`, `skip`,
 *   `project`, `hint`, …). Replies `{ cursor }`, its identifier; nothing is read yet.
 * - `cursorNext` `[cursor, count]`: the next documents, at most `count` and the request's limit, as `{ documents,
 *   exhausted }`.
 * - `cursorHasNext` `[cursor]`: `{ hasNext }`. `cursorExplain` `[cursor, verbosity]`: the explain of its query.
 * - `closeCursor` `[cursor]`: closes a cursor or a change stream and forgets it; `{ closed }` says whether it was open.
 *
 * A cursor kept is given neither the request's signal nor its time limit, which end with the request; its shape may
 * give `maxTimeMS`. A read cancelled closes the cursor.
 */
import {
  FindCursor,
  type AggregationCursor,
  type CollationOptions,
  type Document,
  type ExplainVerbosityLike,
} from 'mongodb';
import { EngineError } from '../engine';
import { lastingOptions, stoppable, type Call } from './call';
import { closeKept } from './handles';
import { document, documents } from './methods';
import { plainNumber, plainOptions } from './mongosh-forms';

type KeptCursor = FindCursor | AggregationCursor;

function unavailable(method: string): EngineError {
  return new EngineError(`cursor.${method}() is not available on this cursor`);
}

function numberOf(value: unknown, method: string): number {
  const number = plainNumber(value);
  if (typeof number !== 'number') {
    throw new EngineError(`cursor.${method}() takes a number`);
  }
  return number;
}

/** A step of the shape that only the cursor of `find` has. */
function shapedFind(cursor: KeptCursor, method: string, value: unknown): void {
  if (!(cursor instanceof FindCursor)) {
    throw unavailable(method);
  }
  switch (method) {
    case 'hint':
      cursor.hint(typeof value === 'string' ? value : document(value));
      return;
    case 'collation':
      cursor.collation(document(value) as CollationOptions);
      return;
    case 'comment':
      cursor.comment(typeof value === 'string' ? value : String(value));
      return;
    case 'allowDiskUse':
      cursor.allowDiskUse(value !== false);
      return;
    default:
      throw unavailable(method);
  }
}

/** One step of the shape of mongosh's cursor, applied to the driver's; `pretty` and `map` change nothing here. */
function shaped(cursor: KeptCursor, step: Document): void {
  const method = String(step['method']);
  const [value] = Array.isArray(step['arguments']) ? (step['arguments'] as unknown[]) : [];
  switch (method) {
    case 'sort':
      cursor.sort(document(value));
      return;
    case 'limit':
      cursor.limit(numberOf(value, method));
      return;
    case 'skip':
      cursor.skip(numberOf(value, method));
      return;
    case 'project':
    case 'projection':
      cursor.project(document(value));
      return;
    case 'maxTimeMS':
      cursor.maxTimeMS(numberOf(value, method));
      return;
    case 'batchSize':
      cursor.batchSize(numberOf(value, method));
      return;
    case 'pretty':
    case 'map':
      return;
    default:
      shapedFind(cursor, method, value);
  }
}

function opened(call: Call): KeptCursor {
  const [of, given, shape] = call.args;
  const [first, second] = Array.isArray(given) ? (given as unknown[]) : [];
  const options = { ...plainOptions(second), ...lastingOptions(call.options) };
  const collection = call.request.collection;
  let cursor: KeptCursor;
  if (of === 'find' && collection !== undefined) {
    cursor = call.db.collection(collection).find(document(first), options);
  } else if (of === 'aggregate') {
    cursor =
      collection === undefined
        ? call.db.aggregate(documents(first), options)
        : call.db.collection(collection).aggregate(documents(first), options);
  } else {
    throw new EngineError('openCursor opens the cursor of find, on a collection, or of aggregate.');
  }
  for (const step of documents(shape)) {
    shaped(cursor, step);
  }
  return cursor;
}

async function nextDocuments(call: Call): Promise<Document> {
  const [id, count] = call.args;
  const cursor = call.handles.cursor(id);
  const asked = plainNumber(count);
  const most = typeof asked === 'number' && asked > 0 ? Math.min(asked, call.limit) : call.limit;
  const read: unknown[] = [];
  await stoppable(
    call.options.signal,
    () => cursor.close(),
    async () => {
      while (read.length < most) {
        const next: unknown = await cursor.next();
        if (next === null) {
          break;
        }
        read.push(next);
      }
    },
  );
  const exhausted = read.length < most || (cursor.bufferedCount() === 0 && cursor.id?.isZero() === true);
  return { documents: read, exhausted };
}

async function closed(call: Call): Promise<Document> {
  const kept = call.handles.release(call.args[0]);
  if (kept !== undefined) {
    await closeKept(kept);
  }
  return { closed: kept !== undefined };
}

/** Carries out a method of the cursors kept; `undefined` when the method is not one of them. */
export function keptCursorMethod(call: Call): Promise<unknown> | undefined {
  const [first, second] = call.args;
  switch (call.request.method) {
    case 'openCursor':
      return Promise.resolve({ cursor: call.handles.keep({ kind: 'cursor', cursor: opened(call) }) });
    case 'cursorNext':
      return nextDocuments(call);
    case 'cursorHasNext':
      return call.handles
        .cursor(first)
        .hasNext()
        .then((hasNext) => ({ hasNext }));
    case 'cursorExplain':
      return call.handles.cursor(first).explain((second ?? 'queryPlanner') as ExplainVerbosityLike);
    case 'closeCursor':
      return closed(call);
    default:
      return undefined;
  }
}
