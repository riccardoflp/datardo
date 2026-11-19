/**
 * One request of MongoDB as the engine's methods receive it: the client and the database, the arguments already out
 * of Extended JSON, the options every call of the driver is given, what the client keeps, and the page size.
 */
import type { ClientSession, Db, MongoClient } from 'mongodb';
import type { MongoRequest } from '../../shared/engine-request';
import { EngineError } from '../engine';
import type { Handles } from './handles';
import type { Options } from './methods';

/** A request being carried out. */
export interface Call {
  readonly client: MongoClient;
  readonly db: Db;
  readonly request: MongoRequest;
  /** The arguments, as the driver takes them, their BSON types kept. */
  readonly args: readonly unknown[];
  /** The signal, the time limit and the session. */
  readonly options: Options;
  readonly handles: Handles;
  /** How many documents a method that returns many gives at most (R9.2). */
  readonly limit: number;
}

/** The options of every call of a request: its signal, its time limit, and the session it runs in. */
export function callOptions(request: MongoRequest, signal: AbortSignal, session: ClientSession | undefined): Options {
  return {
    signal,
    ...(request.timeLimitMs === undefined ? {} : { timeoutMS: request.timeLimitMs }),
    ...(session === undefined ? {} : { session }),
  };
}

/** The options of a call, without the signal and the time limit: for what outlives the request (a cursor kept). */
export function lastingOptions(options: Options): { readonly session?: ClientSession } {
  return options.session === undefined ? {} : { session: options.session };
}

/** The error of a call cancelled by its signal. */
export function cancelled(): EngineError {
  return new EngineError('Cancelled.');
}

/**
 * Runs `work`, which reads something that outlives the request (a cursor kept, a change stream); when the signal
 * aborts first, `stop` closes it, so that the read ends at once, and the call fails with *Cancelled.*
 */
export async function stoppable<T>(signal: AbortSignal, stop: () => Promise<void>, work: () => Promise<T>): Promise<T> {
  const isAborted = (): boolean => signal.aborted;
  if (isAborted()) {
    throw cancelled();
  }
  const listener = (): void => {
    stop().catch(() => {
      // The read fails with Cancelled. whatever closing gives: what was being read is given up either way.
    });
  };
  signal.addEventListener('abort', listener, { once: true });
  try {
    return await work();
  } catch (error: unknown) {
    throw isAborted() ? cancelled() : error;
  } finally {
    signal.removeEventListener('abort', listener);
  }
}
