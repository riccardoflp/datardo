/**
 * The connection and the sessions of a script (`playground.runtime`, `playground.sessions`): `db.getMongo()`, its
 * `startSession`, and a session's transactions. The main process keeps the driver's sessions by their number; a
 * session here knows only whether it is in a transaction and whether it has ended. `withTransaction` retries as the
 * driver does: the whole callback on a transient error, the commit when its outcome is unknown, for 120 seconds.
 */
import type { Json } from '../../shared/engine-request';
import { callbackProblem, databaseNameProblem, sessionValue } from '../../features/playground/sessions';
import { hasLabel, jsonArguments, scriptError, type ScriptEnvironment } from './environment';
import { scriptDatabase } from './script-database';

/** How long `withTransaction` retries, as the drivers do. */
const retryingMs = 120_000;

/** What `startSession` answers: the number of the session in the run, and its id. */
interface Started {
  readonly number: number;
  readonly id: unknown;
}

class SessionState {
  inTransaction = false;
  ended = false;

  constructor(
    readonly environment: ScriptEnvironment,
    readonly number: number,
    readonly id: unknown,
  ) {}

  send(method: string, args: readonly unknown[] = []): Promise<unknown> {
    return this.environment.send({
      on: 'session',
      database: this.environment.current(),
      method,
      arguments: jsonArguments(args, this.environment.json),
      session: this.number,
    });
  }

  async start(options: unknown): Promise<void> {
    await this.send('startTransaction', [options]);
    this.inTransaction = true;
  }

  async finish(method: 'commitTransaction' | 'abortTransaction'): Promise<unknown> {
    const reply = await this.send(method);
    this.inTransaction = false;
    return reply;
  }

  async info(part: 'id' | 'clusterTime' | 'operationTime'): Promise<unknown> {
    const reply = (await this.send('sessionInfo')) as Readonly<Record<string, unknown>> | null;
    return reply?.[part] ?? null;
  }
}

async function commitWithRetries(state: SessionState, until: number): Promise<'committed' | 'again'> {
  for (;;) {
    try {
      await state.finish('commitTransaction');
      return 'committed';
    } catch (error) {
      if (Date.now() < until && hasLabel(error, 'UnknownTransactionCommitResult')) {
        continue;
      }
      if (Date.now() < until && hasLabel(error, 'TransientTransactionError')) {
        return 'again';
      }
      throw error;
    }
  }
}

async function withTransaction(state: SessionState, session: object, run: unknown, options: unknown): Promise<unknown> {
  if (typeof run !== 'function') {
    throw scriptError(callbackProblem, state.environment.line());
  }
  const until = Date.now() + retryingMs;
  for (;;) {
    await state.start(options);
    let value: unknown;
    try {
      value = await (run as (session: object) => unknown)(session);
    } catch (error) {
      if (state.inTransaction) {
        await state.finish('abortTransaction');
      }
      if (Date.now() < until && hasLabel(error, 'TransientTransactionError')) {
        continue;
      }
      throw error;
    }
    if (!state.inTransaction || (await commitWithRetries(state, until)) === 'committed') {
      return value;
    }
  }
}

function sessionMethods(
  state: SessionState,
  session: object,
): Readonly<Record<string, (...args: unknown[]) => unknown>> {
  const { environment } = state;
  return {
    getDatabase: (name: unknown) => {
      const problem = databaseNameProblem(typeof name === 'string' ? name : null);
      if (problem !== undefined) {
        throw scriptError(problem, environment.line());
      }
      return scriptDatabase(environment, { database: name as string, session: state.number });
    },
    startTransaction: (options: unknown) => state.start(options),
    commitTransaction: () => state.finish('commitTransaction'),
    abortTransaction: () => state.finish('abortTransaction'),
    withTransaction: (run: unknown, options: unknown) => withTransaction(state, session, run, options),
    endSession: async () => {
      await state.send('endSession');
      state.ended = true;
      state.inTransaction = false;
    },
    inTransaction: () => state.inTransaction,
    hasEnded: () => state.ended,
    getSessionId: () => state.info('id'),
    getClusterTime: () => state.info('clusterTime'),
    getOperationTime: () => state.info('operationTime'),
    getMongo: () => environment.objects.mongo(),
  };
}

/** A session of the script, from what `startSession` answered. */
export function scriptSession(environment: ScriptEnvironment, started: Started): object {
  const state = new SessionState(environment, started.number, started.id);
  const session: Record<string, unknown> = {};
  Object.assign(session, sessionMethods(state, session));
  environment.kinds.set(session, {
    kind: 'session',
    describe: (): Json => sessionValue(environment.json(state.id), state.inTransaction, state.ended),
  });
  return session;
}

/** The connection of the script: `db.getMongo()`. */
export function scriptMongo(environment: ScriptEnvironment, sessions: Map<number, object>): object {
  const send = (method: string, args: readonly unknown[]): Promise<unknown> =>
    environment.send({
      on: 'mongo',
      database: environment.current(),
      method,
      arguments: jsonArguments(args, environment.json),
    });
  const mongo = {
    startSession: async (options: unknown) => {
      const started = (await send('startSession', [options])) as Started;
      const session = scriptSession(environment, started);
      sessions.set(started.number, session);
      return session;
    },
    getDB: (name: unknown) => {
      if (typeof name !== 'string' || name === '') {
        throw scriptError('getDB(): the database name is a string', environment.line());
      }
      return scriptDatabase(environment, { database: name });
    },
    getDBNames: () => send('getDBNames', []),
    getDBs: (options: unknown) => send('getDBs', [options]),
    toString: () => '[Mongo]',
  };
  environment.kinds.set(mongo, { kind: 'mongo' });
  return mongo;
}
