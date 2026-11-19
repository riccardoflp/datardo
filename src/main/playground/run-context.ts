/**
 * What the main process keeps of a run while it answers the calls of its script (`playground.run`): the runner's
 * ports, the run, its connection as the check of `playground.writes` reads it, what stops it, the book of its
 * sessions (`playground.sessions`), and the driver's sessions and cursors it opened, by their number in the run.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { PlaygroundRun } from '../../shared/state/playgrounds';
import { emptyBook, type SessionBook } from '../../features/playground/sessions';
import type { WriteConnection } from '../../features/playground/writes';
import type { RunnerPorts } from '../../runner/ports';

/** The run being answered. */
export interface RunContext {
  readonly ports: RunnerPorts;
  readonly run: PlaygroundRun;
  readonly connection: WriteConnection;
  /** Raised when the run is stopped: what is being sent is no longer waited for. */
  readonly signal: AbortSignal;
  book: SessionBook;
  /** The engine's identifier of each session of the run, by its number. */
  readonly sessions: Map<number, string>;
  /** The engine's identifier of each cursor of the run kept open between reads, by its number. */
  readonly cursors: Map<number, string>;
  /** The publishing of the run's writes for redis-oplog, one after the other so that they go out in order. */
  publishing: Promise<void>;
}

/** A new run's context, with no session and no cursor. */
export function runContext(
  ports: RunnerPorts,
  run: PlaygroundRun,
  connection: WriteConnection,
  signal: AbortSignal,
): RunContext {
  return {
    ports,
    run,
    connection,
    signal,
    book: emptyBook,
    sessions: new Map(),
    cursors: new Map(),
    publishing: Promise.resolve(),
  };
}

/** The error a call throws in the script: its message, without secrets, and the server's labels. */
export class CallError extends Error {
  /** An error with what the script is told. */
  constructor(
    message: string,
    readonly labels: readonly string[] = [],
  ) {
    super(message);
    this.name = 'CallError';
  }
}

function labelsOf(error: unknown): readonly string[] {
  const labels = typeof error === 'object' && error !== null && 'labels' in error ? error.labels : undefined;
  return Array.isArray(labels) ? labels.filter((each): each is string => typeof each === 'string') : [];
}

/** An error of a call as the script gets it: the engine's message (which holds no secret) and labels. */
export function callError(error: unknown): CallError {
  if (error instanceof CallError) {
    return error;
  }
  return new CallError(error instanceof Error ? error.message : String(error), labelsOf(error));
}

/** Sends one request on the run's connection; what fails is a {@link CallError}. */
export async function send(context: RunContext, request: MongoRequest, signal = context.signal): Promise<Json> {
  try {
    return (await context.ports.engines.send({ connection: context.run.connection, request }, signal)) as Json;
  } catch (error: unknown) {
    throw callError(error);
  }
}

/** The engine's identifier of a session of the run, for a call made in it; none outside a session. */
export function sessionOf(context: RunContext, number: number | undefined): { readonly session?: string } {
  if (number === undefined) {
    return {};
  }
  const session = context.sessions.get(number);
  if (session === undefined) {
    // The driver's own words for a session used after `endSession()`.
    throw new CallError('Cannot use a session that has ended');
  }
  return { session };
}
