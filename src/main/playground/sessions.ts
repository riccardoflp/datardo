/**
 * The sessions and transactions of a run, as the main process carries them out (`playground.sessions`): the driver's
 * sessions are kept by the engine, and the book of the run says which are open, which have a transaction, and the
 * writes each transaction keeps for redis-oplog until its commit. When the run ends, fails or is stopped, what is
 * still open is closed, and the notes say so.
 */
import type { Json } from '../../shared/engine-request';
import type { PlaygroundCall } from '../../features/playground/runtime/calls';
import {
  aborted,
  closed,
  committed,
  ended,
  session as sessionStart,
  started,
  transactionOptions,
  transactionStarted,
  type CloseReason,
} from '../../features/playground/sessions';
import { closeCursor } from './cursors';
import { publishWrites } from './publish';
import { CallError, send, type RunContext } from './run-context';

function sessionRequest(context: RunContext, method: string, args: readonly Json[]): Parameters<typeof send>[1] {
  return { engine: 'mongodb', database: context.run.database, method, arguments: args };
}

async function startSession(context: RunContext, call: PlaygroundCall): Promise<Json> {
  const start = sessionStart({ cancelled: context.book.cancelled }, call.arguments[0]);
  if (start.kind === 'refused') {
    throw new CallError(start.message);
  }
  const reply = (await send(context, sessionRequest(context, 'startSession', [start.options]))) as {
    readonly session?: unknown;
    readonly id?: Json;
  } | null;
  if (typeof reply?.session !== 'string') {
    throw new CallError('The session could not be started.');
  }
  const next = started(context.book);
  context.book = next.book;
  context.sessions.set(next.id, reply.session);
  return { number: next.id, id: reply.id ?? null };
}

function hasLabel(error: unknown, label: string): boolean {
  return error instanceof CallError && error.labels.includes(label);
}

async function commit(context: RunContext, number: number, session: string): Promise<Json> {
  try {
    const reply = await send(context, sessionRequest(context, 'commitTransaction', [session]));
    const done = committed(context.book, number);
    context.book = done.book;
    publishWrites(context, done.publish);
    return reply;
  } catch (error: unknown) {
    // A commit whose outcome is unknown is tried again by `withTransaction`: its writes wait for that commit.
    if (!hasLabel(error, 'UnknownTransactionCommitResult')) {
      context.book = aborted(context.book, number);
    }
    throw error;
  }
}

/** Answers `startSession`, and a method of a session: its transactions, its end, what the driver knows of it. */
export async function sessionCall(context: RunContext, call: PlaygroundCall): Promise<Json> {
  if (call.method === 'startSession') {
    return startSession(context, call);
  }
  const number = call.session;
  const session = number === undefined ? undefined : context.sessions.get(number);
  if (number === undefined || session === undefined) {
    throw new CallError('Cannot use a session that has ended');
  }
  switch (call.method) {
    case 'startTransaction': {
      const reply = await send(
        context,
        sessionRequest(context, 'startTransaction', [session, transactionOptions(call.arguments[0])]),
      );
      context.book = transactionStarted(context.book, number);
      return reply;
    }
    case 'commitTransaction':
      return commit(context, number, session);
    case 'abortTransaction': {
      const reply = await send(context, sessionRequest(context, 'abortTransaction', [session]));
      context.book = aborted(context.book, number);
      return reply;
    }
    case 'endSession': {
      context.book = ended(context.book, number);
      context.sessions.delete(number);
      return send(context, sessionRequest(context, 'endSession', [session]));
    }
    case 'sessionInfo':
      return send(context, sessionRequest(context, 'sessionInfo', [session]));
    default:
      throw new CallError(`session.${call.method}() is not available`);
  }
}

/** How long closing what a run left open may take, after the run. */
const closingMs = 10_000;

/**
 * Closes what the run left open: its cursors, its transactions (aborted, never committed) and its sessions. Gives the
 * notes the output ends with. What fails to close is closed by the server in time: the notes say what was done.
 */
export async function closeRun(context: RunContext, reason: CloseReason): Promise<readonly string[]> {
  const signal = AbortSignal.timeout(closingMs);
  const closing = closed(context.book, reason);
  context.book = closing.book;
  const attempts: Promise<unknown>[] = [...context.cursors.keys()].map((number) =>
    closeCursor(context, number, signal),
  );
  for (const number of closing.end) {
    const session = context.sessions.get(number);
    context.sessions.delete(number);
    if (session !== undefined) {
      const abort = closing.abort.includes(number)
        ? send(context, sessionRequest(context, 'abortTransaction', [session]), signal)
        : Promise.resolve(null);
      attempts.push(
        abort
          // endSession aborts a transaction still open all the same.
          .catch(() => null)
          .then(() => send(context, sessionRequest(context, 'endSession', [session]), signal)),
      );
    }
  }
  // A cursor or a session that could not be closed is closed by the server on its own (10 and 30 minutes idle).
  await Promise.allSettled(attempts);
  return closing.notes;
}
