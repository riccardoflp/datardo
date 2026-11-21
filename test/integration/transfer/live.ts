/**
 * The runner of the transfer and backup areas against the test replica set (testing.md): the features of the
 * registry, the engines connected as Local (writable, keeping its undo history) and as Local read-only, the feeds,
 * writers and reads of the main process (`src/main/transfer-*.ts`), the actions of the undo history on a temporary
 * data folder, and the window's dialogs: a question is answered from the answers a test gives, by the keys of its
 * fields (closed when one is missing), and the system's file dialogs answer with the paths a test queues. The files
 * are written in a temporary folder.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngines, type EngineService } from '../../../src/engines';
import { runnableFeatures } from '../../../src/features/registry';
import { fedSummary } from '../../../src/features/transfer/ends/summary';
import { collectionBytes, transferFeeds } from '../../../src/main/transfer-feeds';
import {
  listFolder,
  listNames,
  readArchiveList,
  readImportFile,
  readMetadata,
  textArgOf,
} from '../../../src/main/transfer-files';
import { carryOutTransferStep, endsWithOwnMessage } from '../../../src/main/transfer-steps';
import { undoActions } from '../../../src/main/undo-actions';
import { notify } from '../../../src/runner/notify';
import type { AppAction, RunnerPorts } from '../../../src/runner/ports';
import { start } from '../../../src/runner/start';
import type { IntentResult } from '../../../src/shared/bridge';
import { noSecretsSaved, type ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import { jsonFields } from '../../../src/features/connection/types';
import { connectionId, featureId, type ConnectionId } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import type { Target } from '../../../src/shared/target';
import { testServers } from '../servers';

/** The writable connection, which keeps its undo history. */
export const localId = connectionId('c-m25-local');
/** The same server, read-only. */
export const readOnlyId = connectionId('c-m25-read-only');

/** The runner on the test replica set, what it keeps, and a way to start a feature. */
export interface LiveTransfer {
  readonly engines: EngineService;
  readonly folder: string;
  readonly ports: RunnerPorts;
  readonly state: () => AppState;
  /** The answers of the questions, by the keys of their fields. */
  answers: Record<string, unknown>;
  /** The paths the next file dialogs answer with, in order; `null` closes one. */
  readonly paths: (string | null)[];
  /** The confirmations shown, by their text. */
  readonly confirmed: string[];
  readonly start: (feature: string, target: Target, args?: Json) => Promise<IntentResult>;
  /** The text of the notifications shown, the last one last. */
  readonly notices: () => readonly string[];
  /** Sends a request to the server, outside the runner. */
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

function fileActions(live: { paths: (string | null)[] }): Readonly<Record<string, AppAction>> {
  const choose: AppAction = () => Promise.resolve(live.paths.length === 0 ? null : (live.paths.shift() ?? null));
  return {
    'transfer.choose-path': choose,
    'backup.choose-path': choose,
    'transfer.read-file': (args) => readImportFile(textArgOf(args, 'path'), Number(jsonFields(args)['most'])),
    'backup.list-names': async (args) => [...(await listNames(textArgOf(args, 'folder')))],
    'backup.read-archive-list': (args) => readArchiveList(textArgOf(args, 'path')),
    'backup.list-folder': (args) => listFolder(textArgOf(args, 'path')),
    'backup.read-metadata': (args) => {
      const paths = jsonFields(args)['paths'];
      return readMetadata(Array.isArray(paths) ? paths.filter((one): one is string => typeof one === 'string') : []);
    },
    'transfer.open-path': () => Promise.resolve(null),
    'transfer.reveal-path': () => Promise.resolve(null),
  };
}

/** The runner on the test replica set. */
export async function liveTransfer(): Promise<LiveTransfer> {
  const url = testServers().mongoReplicaSet;
  const folder = await mkdtemp(join(tmpdir(), 'datardo-m25-'));
  const engines = createEngines();
  for (const id of [localId, readOnlyId]) {
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: url, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(30_000),
    );
  }
  const server = { engine: 'mongodb' as const, product: 'MongoDB' as const, version: '8.2.0' };
  let state: AppState = {
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
  const holder = {
    get: () => state,
    dispatch: (event: AppEvent) => {
      state = reduce(state, event);
    },
  };
  const isReadOnly = (id: ConnectionId): boolean => id === readOnlyId;
  const connectionName = (id: ConnectionId): string => (id === readOnlyId ? 'Local read-only' : 'Local');
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
  const live: LiveTransfer = {
    engines,
    folder,
    ports: undefined as unknown as RunnerPorts,
    state: () => state,
    answers: {},
    paths: [],
    confirmed: [],
    start: (feature, target, args) =>
      start(live.ports, { feature: featureId(feature), target, ...(args === undefined ? {} : { args }) }),
    notices: () => state.runner.notifications.map((each) => each.text),
    send,
    stored: async (database, collection) => {
      const all: string[] = [];
      const filter = {};
      for await (const batch of collectionBytes(
        engines,
        { connection: localId, database, collection, filter },
        1000,
        AbortSignal.timeout(60_000),
      )) {
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
    appActions: new Map(Object.entries({ ...undo, ...fileActions(live) })),
    files: async (step, signal, progress) => {
      const services = {
        engines: () => engines,
        connectionName,
        notify: (feature: string, after: { level: 'info' | 'success' | 'warning' | 'error'; text: string }) => {
          notify(ports, { feature, level: after.level, text: after.text });
        },
        now: () => Date.now(),
      };
      if (!(await carryOutTransferStep(services, step, signal, progress))) {
        throw new Error(`No writer for ${step.path} in these tests.`);
      }
    },
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
        live.confirmed.push(confirmation.title);
        return Promise.resolve(true);
      },
    },
    state: holder,
    platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
    isReadOnly,
    isConnected: (id) => engines.isConnected(id),
    connectionName,
    now: () => Date.now(),
    feeds: transferFeeds(() => engines),
    fedSummary,
    endsWithOwnMessage,
  };
  (live as { ports: RunnerPorts }).ports = ports;
  return live;
}
