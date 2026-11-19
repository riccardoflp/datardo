/**
 * Change streams (`watch.stream`, `mcp.debugging-tools`): on a collection, on a database, or on the whole deployment
 * (the database `admin` with no collection, or the option `allChangesForCluster`). Each reply is `{ events,
 * resumeToken }`, the change events as the server sent them and the stream's resume token after them.
 *
 * - `watch` `[pipeline, options]` opens the stream, takes events until `limit` arrived, one is `invalidate`, or the
 *   time limit passed, and closes the stream before it replies (the MCP tool `watch_changes`).
 * - `openChangeStream` `[pipeline, options]` opens a stream the client keeps, and replies `{ cursor }`, its
 *   identifier; `changeStreamNext` `[cursor, most]` waits at most `maxAwaitTimeMS` for change events and replies with
 *   those that came, until the server has no more at once; `closeCursor` `[cursor]` closes it (Watch changes).
 */
import type { ChangeStream, ChangeStreamDocument, Document } from 'mongodb';
import { lastingOptions, stoppable, type Call } from './call';
import { documents } from './methods';
import { plainNumber, plainOptions } from './mongosh-forms';

/** How long `watch` waits for change events when the request gives no time limit, in milliseconds (R9.2). */
export const watchWaitMs = 10_000;

/** How long the server waits for a change before it answers with none, when the options do not say (R9.2). */
export const mostAwaitMs = 1000;

/** The reply of `watch` and `changeStreamNext`. */
export interface ChangesReply {
  readonly events: readonly Document[];
  readonly resumeToken: unknown;
}

/** The stream of the request: on its collection, its database, or the whole deployment. */
function openStream(call: Call, given: unknown, awaitMs: number): ChangeStream {
  const [pipeline] = call.args;
  const { allChangesForCluster, ...rest } = plainOptions(given);
  const options = {
    maxAwaitTimeMS: awaitMs,
    ...rest,
    ...lastingOptions(call.options),
  };
  const stages = documents(pipeline);
  const collection = call.request.collection;
  if (collection !== undefined) {
    return call.db.collection(collection).watch(stages, options);
  }
  return allChangesForCluster === true || call.request.database === 'admin'
    ? call.client.watch(stages, options)
    : call.db.watch(stages, options);
}

function isInvalidate(event: ChangeStreamDocument): boolean {
  return event.operationType === 'invalidate';
}

/**
 * The change events of a stream, at most `most`: after each wait that gives none, `isOver` says whether to stop. An
 * `invalidate` is the last.
 */
async function readEvents(
  stream: ChangeStream,
  most: number,
  signal: AbortSignal,
  isOver: () => boolean,
): Promise<ChangesReply> {
  const events: ChangeStreamDocument[] = [];
  await stoppable(
    signal,
    () => stream.close(),
    async () => {
      while (events.length < most && !signal.aborted) {
        const event = await stream.tryNext();
        if (event !== null) {
          events.push(event);
        }
        if (event === null ? isOver() : isInvalidate(event)) {
          break;
        }
      }
      signal.throwIfAborted();
    },
  );
  return { events, resumeToken: stream.resumeToken ?? null };
}

/** `watch`: the change events of a stream opened and closed for this request. */
async function watchOnce(call: Call): Promise<ChangesReply> {
  const waitMs = call.request.timeLimitMs ?? watchWaitMs;
  const deadline = Date.now() + waitMs;
  const stream = openStream(call, call.args[1], Math.min(mostAwaitMs, Math.max(1, waitMs)));
  try {
    return await readEvents(stream, call.limit, call.options.signal, () => Date.now() >= deadline);
  } finally {
    await stream.close();
  }
}

function mostOf(value: unknown, limit: number): number {
  const most = plainNumber(value);
  return typeof most === 'number' && most > 0 ? Math.min(most, limit) : limit;
}

/** Carries out a method of change streams; `undefined` when the method is not one of them. */
export function changeStreamMethod(call: Call): Promise<unknown> | undefined {
  const [first, second] = call.args;
  switch (call.request.method) {
    case 'watch':
      return watchOnce(call);
    case 'openChangeStream': {
      const stream = openStream(call, second, mostAwaitMs);
      return Promise.resolve({ cursor: call.handles.keep({ kind: 'change-stream', stream }) });
    }
    case 'changeStreamNext': {
      const stream = call.handles.changeStream(first);
      return readEvents(stream, mostOf(second, call.limit), call.options.signal, () => true);
    }
    default:
      return undefined;
  }
}
