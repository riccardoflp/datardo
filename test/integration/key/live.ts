/**
 * The runner of the keys area against the test Redis (testing.md): the features of the registry, the engines
 * connected to the server as Cache (writable, keeping its undo history) and as Cache read-only, the scans of
 * `src/main/key-scans.ts`, the writer of `key.export`, the actions of the undo history on a temporary data folder,
 * and the window's dialogs answered from a queue. The file dialogs of an export and of an import answer with the paths
 * a test gives. Its keys are prefixed `m13:`, in the databases 13 and 14 of a shared server.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngines, type EngineService } from '../../../src/engines';
import { runnableFeatures } from '../../../src/features/registry';
import { keyExportOf, writeKeyExport } from '../../../src/main/key-export';
import { keyScanActions } from '../../../src/main/key-scans';
import { undoActions } from '../../../src/main/undo-actions';
import type { AppAction, RunnerPorts } from '../../../src/runner/ports';
import { start } from '../../../src/runner/start';
import type { IntentResult } from '../../../src/shared/bridge';
import { noSecretsSaved, type ConnectionView } from '../../../src/shared/connection';
import { redisCommand, type Json } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import { connectionId, featureId, type ConnectionId, type Place } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import type { Target } from '../../../src/shared/target';
import { testServers } from '../servers';

/** The writable connection, which keeps its undo history. */
export const cacheId = connectionId('c-m13-cache');
/** The same server, read-only. */
export const readOnlyId = connectionId('c-m13-read-only');
/** The connection the tests fill and look at the server with, outside the runner. */
const toolId = connectionId('c-m13-tool');

/** The databases the tests of this milestone may use on a shared server. */
export const databases: readonly [number, number] = [13, 14];

/** The runner on the test Redis, what it keeps, and a way to start a feature. */
export interface LiveKeys {
  readonly engines: EngineService;
  readonly folder: string;
  readonly state: () => AppState;
  /** The answers the next questions get, in order; a question with none left is cancelled. */
  readonly answers: Answers[];
  /** The confirmations shown, by their title. */
  readonly confirmed: string[];
  /** The path the save dialog of an export answers with, and the file the open dialog of an import reads. */
  file: string | undefined;
  readonly start: (feature: string, target: Target, args?: Json, place?: Place) => Promise<IntentResult>;
  /** Changes a setting as the settings page would; `undefined` puts back its default. */
  readonly setSetting: (name: string, value: Json | undefined) => void;
  /** Sends one command to a database, outside the runner. */
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
    keepsUndo: true,
    secrets: { ...noSecretsSaved, connectionString: true },
  };
}

function stateWithServer(redisVersion: string): AppState {
  const server = { engine: 'redis' as const, product: 'Redis' as const, version: redisVersion, redisVersion };
  return {
    ...initialState,
    connections: {
      ...initialConnectionsState,
      loaded: true,
      saved: [saved(cacheId, 'Cache', false), saved(readOnlyId, 'Cache read-only', true)],
      live: {
        [cacheId]: { state: 'connected', server },
        [readOnlyId]: { state: 'connected', server },
      },
    },
  };
}

function fileActions(live: { file: string | undefined }): Readonly<Record<string, AppAction>> {
  return {
    'key.choose-file': () => Promise.resolve(live.file ?? null),
    'key.read-file': async () =>
      live.file === undefined ? null : { path: live.file, name: 'keys.redis', text: await readFile(live.file, 'utf8') },
  };
}

async function connectAll(engines: EngineService, url: string): Promise<void> {
  for (const id of [cacheId, readOnlyId, toolId]) {
    await engines.connect(
      id,
      { engine: 'redis', connectionString: url, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(30_000),
    );
  }
}

/** The runner on the test Redis. */
export async function liveKeys(): Promise<LiveKeys> {
  const url = testServers().redis ?? '';
  const folder = await mkdtemp(join(tmpdir(), 'datardo-keys-'));
  const engines = createEngines();
  await connectAll(engines, url);
  const info = (await engines.send(
    { connection: toolId, request: redisCommand(0, 'INFO', 'server') },
    AbortSignal.timeout(10_000),
  )) as Uint8Array;
  const version = /redis_version:([\d.]+)/u.exec(new TextDecoder().decode(info))?.[1] ?? '6.2.0';
  let state = stateWithServer(version);
  const holder = {
    get: () => state,
    dispatch: (event: AppEvent) => {
      state = reduce(state, event);
    },
  };
  const isReadOnly = (id: ConnectionId): boolean => id === readOnlyId;
  const connectionName = (id: ConnectionId): string => (id === readOnlyId ? 'Cache read-only' : 'Cache');
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
  const live: LiveKeys = {
    engines,
    folder,
    state: () => state,
    answers: [],
    confirmed: [],
    file: undefined,
    start: (feature, target, args, place) =>
      start(ports, {
        feature: featureId(feature),
        target,
        ...(args === undefined ? {} : { args }),
        ...(place === undefined ? {} : { place }),
      }),
    setSetting: (name, value) => {
      const { [name]: _old, ...others } = state.settings.stored;
      const stored = value === undefined ? others : { ...others, [name]: value };
      state = { ...state, settings: { ...state.settings, stored } };
    },
    command: (database, ...words) =>
      engines.send({ connection: toolId, request: redisCommand(database, ...words) }, AbortSignal.timeout(30_000)),
    close: async () => {
      await engines.disconnectAll();
      await rm(folder, { recursive: true, force: true });
    },
  };
  const ports: RunnerPorts = {
    features: runnableFeatures(),
    engines,
    appActions: new Map(
      Object.entries({
        ...undo,
        ...keyScanActions({ engines: () => engines, isReadOnly, connectionName }),
        ...fileActions(live),
      }),
    ),
    files: async (step, signal) => {
      const content = step.action === 'write' ? step.content : undefined;
      if (content?.writer !== 'key.export') {
        throw new Error(`No writer for ${step.path} in these tests.`);
      }
      await writeKeyExport(engines, keyExportOf(step.path, content.args), signal);
    },
    dialogs: {
      ask: () => Promise.resolve(live.answers.shift()),
      confirm: (_feature, confirmation) => {
        live.confirmed.push(confirmation.title);
        return Promise.resolve(true);
      },
    },
    state: holder,
    platform: 'windows',
    isReadOnly,
    isConnected: (id) => engines.isConnected(id),
    connectionName,
    now: () => Date.now(),
  };
  return live;
}
