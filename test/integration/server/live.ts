/**
 * The runner of the Server area against a test Redis (testing.md): the features of the registry, the engines
 * connected to the server as Cache (writable) and as Cache read-only, every command sent through them recorded, and
 * the confirmations answered from a queue (yes when it is empty). Its keys are prefixed `m17:`, in the databases 8
 * and 9 of a shared server; it never sends `CONFIG SET`, `SLOWLOG RESET` nor `CLIENT KILL` of a client it did not open
 * to the shared server.
 */
import { createEngines, type EngineService } from '../../../src/engines';
import { runnableFeatures } from '../../../src/features/registry';
import type { RunnerPorts } from '../../../src/runner/ports';
import { start } from '../../../src/runner/start';
import type { IntentResult } from '../../../src/shared/bridge';
import { noSecretsSaved, type ConnectionView } from '../../../src/shared/connection';
import { redisCommand, type Json } from '../../../src/shared/engine-request';
import { connectionId, featureId, type ConnectionId, type Place } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import type { Target } from '../../../src/shared/target';

/** The writable connection. */
export const cacheId = connectionId('c-m17-cache');
/** The same server, read-only. */
export const readOnlyId = connectionId('c-m17-read-only');
/** The connection the tests fill and look at the server with, outside the runner. */
const toolId = connectionId('c-m17-tool');

/** The databases the tests of this milestone may use on a shared server. */
export const databases: readonly [number, number] = [8, 9];

/** A command the runner sent: its connection and its words. */
export interface SentCommand {
  readonly connection: ConnectionId;
  readonly database: number;
  readonly text: string;
}

/** The runner on the test Redis, what it keeps, and a way to start a feature. */
export interface LiveServer {
  readonly state: () => AppState;
  /** The answers of the next confirmations, in order; none left answers yes. */
  readonly confirmations: boolean[];
  /** The confirmations shown, by their title. */
  readonly confirmed: string[];
  /** Every command sent through the runner's engines, in order. */
  readonly sent: SentCommand[];
  readonly start: (feature: string, args?: Json, place?: Place, target?: Target) => Promise<IntentResult>;
  /** Sends one command to a database, outside the runner and unrecorded. */
  readonly command: (database: number, ...words: (string | Uint8Array)[]) => Promise<unknown>;
  readonly close: () => Promise<void>;
}

function saved(id: ConnectionId, name: string, readOnly: boolean): ConnectionView {
  return {
    id,
    name,
    engine: 'redis',
    hosts: '127.0.0.1',
    readOnly,
    keepsUndo: false,
    secrets: { ...noSecretsSaved, connectionString: true },
  };
}

function stateWithServer(): AppState {
  const server = { engine: 'redis' as const, product: 'Redis' as const, version: '7.4.0', redisVersion: '7.4.0' };
  return {
    ...initialState,
    connections: {
      ...initialConnectionsState,
      loaded: true,
      saved: [saved(cacheId, 'Cache', false), saved(readOnlyId, 'Cache read-only', true)],
      live: { [cacheId]: { state: 'connected', server }, [readOnlyId]: { state: 'connected', server } },
    },
  };
}

const decoder = new TextDecoder();

function recording(engines: EngineService, sent: SentCommand[]): EngineService {
  return {
    ...engines,
    send: (request, signal) => {
      const redis = request.request;
      if (redis.engine === 'redis') {
        const text = redis.command.map((word) => decoder.decode(word)).join(' ');
        sent.push({ connection: request.connection, database: redis.database, text });
      }
      return engines.send(request, signal);
    },
  };
}

/** The runner on the Redis at `url`. */
export async function liveServer(url: string): Promise<LiveServer> {
  const engines = createEngines();
  for (const id of [cacheId, readOnlyId, toolId]) {
    await engines.connect(
      id,
      { engine: 'redis', connectionString: url, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(30_000),
    );
  }
  let state = stateWithServer();
  const holder = {
    get: () => state,
    dispatch: (event: AppEvent) => {
      state = reduce(state, event);
    },
  };
  const sent: SentCommand[] = [];
  const live: LiveServer = {
    state: () => state,
    confirmations: [],
    confirmed: [],
    sent,
    start: (feature, args, place, target) =>
      start(ports, {
        feature: featureId(feature),
        target: target ?? { kind: 'connection', connection: cacheId },
        ...(args === undefined ? {} : { args }),
        ...(place === undefined ? {} : { place }),
      }),
    command: (database, ...words) =>
      engines.send({ connection: toolId, request: redisCommand(database, ...words) }, AbortSignal.timeout(30_000)),
    close: () => engines.disconnectAll(),
  };
  const isReadOnly = (id: ConnectionId): boolean => id === readOnlyId;
  const ports: RunnerPorts = {
    features: runnableFeatures(),
    engines: recording(engines, sent),
    appActions: new Map(),
    files: () => Promise.reject(new Error('No file in these tests.')),
    dialogs: {
      ask: () => Promise.resolve(undefined),
      confirm: (_feature, confirmation) => {
        live.confirmed.push(confirmation.title);
        return Promise.resolve(live.confirmations.shift() ?? true);
      },
    },
    state: holder,
    platform: 'windows',
    isReadOnly,
    isConnected: (id) => engines.isConnected(id),
    connectionName: (id) => (id === readOnlyId ? 'Cache read-only' : 'Cache'),
    now: () => Date.now(),
  };
  return live;
}

/** The result of a read, or a failure of the test. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names what the read gives.
export function resultOf<T>(result: IntentResult): T {
  if (result.kind !== 'read') {
    throw new Error(`Expected a read, got ${JSON.stringify(result)}`);
  }
  return result.result as T;
}
