/**
 * The reads of a script's cursors, as the main process answers them (`playground.runtime`): the driver's cursor is
 * opened at the first read with the cursor's shape and kept between reads (`next`, `hasNext`, `forEach`), and closed
 * once read to its end, or when the run ends. `count` of a `find` counts on the server the documents that match its
 * filter; `itcount` reads what is left and counts it.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import { findArguments, type CursorCall, type PlaygroundCall } from '../../features/playground/runtime/calls';
import { CallError, send, sessionOf, type RunContext } from './run-context';

/** How many documents one read takes at most, as the engine gives them. */
const batch = 1000;

interface Read {
  readonly documents: readonly Json[];
  readonly exhausted: boolean;
}

function requestOn(
  context: RunContext,
  cursor: CursorCall,
  call: PlaygroundCall,
): Omit<MongoRequest, 'method' | 'arguments'> {
  return {
    engine: 'mongodb',
    database: cursor.database,
    ...(cursor.collection === undefined ? {} : { collection: cursor.collection }),
    ...sessionOf(context, call.session),
  };
}

function engineArguments(cursor: CursorCall): readonly Json[] {
  if (cursor.of === 'find') {
    const [filter, options] = findArguments(cursor.arguments);
    return [filter ?? {}, options ?? {}];
  }
  const [pipeline, options] = cursor.arguments;
  return [pipeline ?? [], options ?? {}];
}

async function opened(context: RunContext, cursor: CursorCall, call: PlaygroundCall): Promise<string> {
  const kept = context.cursors.get(cursor.id);
  if (kept !== undefined) {
    return kept;
  }
  const reply = await send(context, {
    ...requestOn(context, cursor, call),
    method: 'openCursor',
    arguments: [
      cursor.of,
      engineArguments(cursor),
      cursor.shape.map((step) => ({ method: step.method, arguments: step.arguments })),
    ],
  });
  const id = (reply as { readonly cursor?: unknown } | null)?.cursor;
  if (typeof id !== 'string') {
    throw new CallError('The cursor could not be opened.');
  }
  context.cursors.set(cursor.id, id);
  return id;
}

/** Closes a cursor of the run and forgets it; a cursor already gone on the server is gone all the same. */
export async function closeCursor(context: RunContext, number: number, signal: AbortSignal): Promise<void> {
  const id = context.cursors.get(number);
  context.cursors.delete(number);
  if (id !== undefined) {
    await send(
      context,
      { engine: 'mongodb', database: context.run.database, method: 'closeCursor', arguments: [id] },
      signal,
    );
  }
}

async function next(context: RunContext, call: PlaygroundCall, cursor: CursorCall, count: number): Promise<Read> {
  const id = await opened(context, cursor, call);
  const reply = (await send(context, {
    ...requestOn(context, cursor, call),
    method: 'cursorNext',
    arguments: [id, count],
  })) as Read | null;
  const read = { documents: reply?.documents ?? [], exhausted: reply?.exhausted !== false };
  if (read.exhausted) {
    await closeCursor(context, cursor.id, context.signal);
  }
  return read;
}

async function all(context: RunContext, call: PlaygroundCall, cursor: CursorCall): Promise<Json[]> {
  const documents: Json[] = [];
  for (;;) {
    const read = await next(context, call, cursor, batch);
    documents.push(...read.documents);
    if (read.exhausted) {
      return documents;
    }
  }
}

async function counted(context: RunContext, call: PlaygroundCall, cursor: CursorCall): Promise<Json> {
  const on = requestOn(context, cursor, call);
  if (cursor.of === 'find') {
    const [filter] = engineArguments(cursor);
    return send(context, { ...on, method: 'countDocuments', arguments: [filter ?? {}] });
  }
  const [pipeline, options] = engineArguments(cursor);
  const stages = [...(Array.isArray(pipeline) ? (pipeline as readonly Json[]) : []), { $count: 'n' }];
  const reply = await send(context, { ...on, method: 'aggregate', arguments: [stages, options ?? {}] });
  const [first] = Array.isArray(reply) ? (reply as readonly Json[]) : [];
  return (first as { readonly n?: Json } | undefined)?.n ?? { $numberInt: '0' };
}

function numberArgument(call: PlaygroundCall): number | undefined {
  const [first] = call.arguments;
  return typeof first === 'number' && first > 0 ? first : undefined;
}

/** Answers a read of a cursor: `toArray` (all, or the first `n` for the result of a run), `next`, a count, explain. */
export async function cursorCall(context: RunContext, call: PlaygroundCall): Promise<Json> {
  const cursor = call.cursor;
  if (cursor === undefined) {
    throw new CallError(`cursor.${call.method}() needs a cursor.`);
  }
  switch (call.method) {
    case 'toArray': {
      const most = numberArgument(call);
      if (most === undefined) {
        return all(context, call, cursor);
      }
      const read = await next(context, call, cursor, most);
      await closeCursor(context, cursor.id, context.signal);
      return read.documents;
    }
    case 'next':
      return (await next(context, call, cursor, numberArgument(call) ?? 1)) as unknown as Json;
    case 'count':
      return counted(context, call, cursor);
    case 'itcount':
      return (await all(context, call, cursor)).length;
    case 'explain': {
      const id = await opened(context, cursor, call);
      const [verbosity] = call.arguments;
      return send(context, {
        ...requestOn(context, cursor, call),
        method: 'cursorExplain',
        arguments: [id, typeof verbosity === 'string' ? verbosity : 'queryPlanner'],
      });
    }
    default:
      throw new CallError(`cursor.${call.method}() is not available on this cursor`);
  }
}
