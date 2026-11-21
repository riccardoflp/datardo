/**
 * The runner of the compare and structure areas against the test replica set (testing.md): the features of the
 * registry, the engines connected as Local (writable, keeping its undo history) and as Local read-only, the reads of
 * the main process (`compare.compare` with the pairing in the calling thread, `structure.read-both`), the actions of
 * the undo history on a temporary data folder, and `playground.open` and `nav.copy`, which only record what they are
 * given. Every question is answered from the answers a test gives, by the keys of its fields; every confirmation is
 * accepted and recorded.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngines, type EngineService } from '../../../src/engines';
import { runnableFeatures } from '../../../src/features/registry';
import { compareSides } from '../../../src/main/compare-reads';
import { readBoth } from '../../../src/main/structure-reads';
import { collectionBytes } from '../../../src/main/transfer-feeds';
import { undoActions } from '../../../src/main/undo-actions';
import type { AppAction, RunnerPorts } from '../../../src/runner/ports';
import { start } from '../../../src/runner/start';
import { inThread } from '../../../src/runner/workers/pairing';
import type { IntentResult } from '../../../src/shared/bridge';
import { noSecretsSaved, type ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import { connectionId, featureId, type ConnectionId } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import type { Target } from '../../../src/shared/target';
import { testServers } from '../servers';

/** The writable connection, which keeps its undo history. */
export const localId = connectionId('c-m35-local');
/** The same server, read-only. */
export const readOnlyId = connectionId('c-m35-read-only');

/** The runner on the test replica set, what it keeps, and a way to start a feature. */
export interface LiveCompare {
  readonly engines: EngineService;
  readonly state: () => AppState;
  /** The answers of the questions, by the keys of their fields. */
  answers: Record<string, unknown>;
  /** The confirmations shown, by their text. */
  readonly confirmed: string[];
  /** What the app actions that only record were given: `playground.open`, `nav.copy`. */
  readonly recorded: { action: string; args: Json }[];
  readonly start: (feature: string, target: Target, args?: Json) => Promise<IntentResult>;
  /** Sends a request to the server as Local, outside the runner. */
  readonly send: (
    database: string,
    collection: string | undefined,
    method: string,
    args: readonly Json[],
  ) => Promise<unknown>;
  /** The documents of a collection as stored, in hexadecimal, sorted. */
  readonly stored: (database: string, collection: string) => Promise<string[]>;
  readonly close: () => Promise<void>;
}

function saved(id: ConnectionId, name: string, readOnly: boolean): ConnectionView {
  return {
    id,
    name,
    engine: 'mongodb',
    hosts: '127.0.0.1',
    readOnly,
    keepsUndo: true,
    secrets: { ...noSecretsSaved, connectionString: true },
  };
}

function stateOf(): AppState {
  const server = { engine: 'mongodb' as const, product: 'MongoDB' as const, version: '8.2.0' };
  return {
    ...initialState,
    connections: {
      ...initialConnectionsState,
      loaded: true,
      saved: [saved(localId, 'Local', false), saved(readOnlyId, 'Local read-only', true)],
      live: {
        [localId]: { state: 'connected', server },
        [readOnlyId]: { state: 'connected', server },
      },
    } as unknown as AppState['connections'],
  };
}

const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';

/** The runner on the test replica set. */
export async function liveCompare(): Promise<LiveCompare> {
  const url = testServers().mongoReplicaSet;
  const folder = await mkdtemp(join(tmpdir(), 'datardo-m35-'));
  const engines = createEngines();
  for (const id of [localId, readOnlyId]) {
    const settings = { engine: 'mongodb' as const, connectionString: url, connectTimeoutMs: 10_000 };
    await engines.connect(id, settings, AbortSignal.timeout(30_000));
  }
  let state = stateOf();
  const holder = {
    get: () => state,
    dispatch: (event: AppEvent) => {
      state = reduce(state, event);
    },
  };
  const undo = undoActions({
    state: holder,
    dataFolder: folder,
    engines: () => engines,
    writeEntries: () => undefined,
    indexFound: () => ({ kind: 'current' }),
    connectFirst: () => Promise.resolve(),
    findConnection: () => undefined,
    writeConnection: () => undefined,
  });
  const reads = { engines: () => engines, state: holder, now: () => Date.now(), platform } as const;
  const recorded: { action: string; args: Json }[] = [];
  const recording =
    (action: string): AppAction =>
    (args) => {
      recorded.push({ action, args });
      return Promise.resolve(null);
    };
  const actions: Readonly<Record<string, AppAction>> = {
    ...undo,
    'compare.compare': (args, signal, progress) =>
      compareSides({ ...reads, pairing: inThread }, args, signal, progress),
    'structure.read-both': (args, signal, progress) => readBoth(reads, args, signal, progress),
    'playground.open': recording('playground.open'),
    'nav.copy': recording('nav.copy'),
  };
  const send = (database: string, collection: string | undefined, method: string, args: readonly Json[]) =>
    engines.send(
      {
        connection: localId,
        request: {
          engine: 'mongodb',
          database,
          ...(collection === undefined ? {} : { collection }),
          method,
          arguments: args,
        },
      },
      AbortSignal.timeout(60_000),
    );
  const live: LiveCompare = {
    engines,
    state: () => state,
    answers: {},
    confirmed: [],
    recorded,
    start: (feature, target, args) =>
      start(ports, { feature: featureId(feature), target, ...(args === undefined ? {} : { args }) }),
    send,
    stored: async (database, collection) => {
      const all: string[] = [];
      const where = { connection: localId, database, collection, filter: {} };
      for await (const batch of collectionBytes(engines, where, 1000, AbortSignal.timeout(60_000))) {
        all.push(...batch.map((bytes) => Buffer.from(bytes).toString('hex')));
      }
      return all.sort();
    },
    close: async () => {
      await engines.disconnectAll();
      await rm(folder, { recursive: true, force: true });
    },
  };
  const ports: RunnerPorts = {
    features: runnableFeatures(),
    engines,
    appActions: new Map(Object.entries(actions)),
    files: () => Promise.reject(new Error('No file is written in these tests.')),
    dialogs: {
      ask: (_feature, question) => {
        const answered: Record<string, unknown> = {};
        for (const field of question.fields) {
          if (!(field.key in live.answers)) {
            return Promise.resolve(undefined);
          }
          answered[field.key] = live.answers[field.key];
        }
        return Promise.resolve(answered);
      },
      confirm: (_feature, confirmation) => {
        live.confirmed.push(confirmation.danger.text);
        return Promise.resolve(true);
      },
    },
    state: holder,
    platform,
    isReadOnly: (id) => id === readOnlyId,
    isConnected: (id) => engines.isConnected(id),
    connectionName: (id) => (id === readOnlyId ? 'Local read-only' : 'Local'),
    now: () => Date.now(),
  };
  return live;
}
