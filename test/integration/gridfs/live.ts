/**
 * The runner of the GridFS area against the throwaway MongoDB (testing.md): the features of the registry, the engines
 * connected to it as Local (writable) and as Production (read-only), the actions and the writer of
 * `src/main/gridfs.ts`, and the window's dialogs answered by the tests: the files the open dialog chooses, the path
 * the save dialog gives, a temporary folder of the test as the system's, and the copies handed to the system
 * recorded rather than opened. The files of the disk are written in that temporary folder.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngines, newObjectId, type EngineService } from '../../../src/engines';
import { bucketRequest } from '../../../src/features/gridfs/types';
import { runnableFeatures } from '../../../src/features/registry';
import { gridFsActions, writeDownload } from '../../../src/main/gridfs';
import { cancelLatest } from '../../../src/runner/cancel';
import type { AppAction, RunnerPorts, StepProgress } from '../../../src/runner/ports';
import { start } from '../../../src/runner/start';
import type { IntentResult } from '../../../src/shared/bridge';
import { noSecretsSaved, type ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import { connectionId, featureId, type ConnectionId, type Place } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import { testServers } from '../servers';

/** The writable connection. */
export const localId = connectionId('c-m33-local');
/** The same server, read-only. */
export const productionId = connectionId('c-m33-production');

/** A file the open dialog answers, as `gridfs.choose-file` gives it. */
export interface Chosen {
  readonly path: string;
  readonly name: string;
  readonly size: number;
  readonly id: Json;
}

/** The runner on the test MongoDB, what it keeps, and a way to start a feature. */
export interface LiveGridFs {
  readonly engines: EngineService;
  /** The temporary folder of the test: its files, and the system's temporary folder as `gridfs.open` sees it. */
  readonly folder: string;
  readonly database: string;
  readonly state: () => AppState;
  /** The answers the next questions get, in order; a question with none left is cancelled. */
  readonly answers: Answers[];
  /** The confirmations shown, by their question, and the answer they get (true unless a test says otherwise). */
  readonly confirmed: string[];
  confirmAnswer: boolean;
  /** What the next system dialogs answer, in order: a path, files, or null for a dialog closed. */
  readonly dialogs: (string | readonly Chosen[] | null)[];
  /** The paths of the copies handed to the system's application. */
  readonly opened: string[];
  /** Called with what each long step says while it runs: a test cancels from it. */
  onProgress: ((said: { readonly title?: string; readonly detail?: string }) => void) | undefined;
  /** The bytes of the steps that read the disk, as they are sent. */
  readonly start: (feature: string, args: Json, connection?: ConnectionId, place?: Place) => Promise<IntentResult>;
  /** Cancels the work started last, as **Cancel** of its item does. */
  readonly cancel: () => boolean;
  /** The texts of the notifications shown so far. */
  readonly notifications: () => readonly string[];
  /** Sends a method to a collection of a bucket, outside the runner. */
  readonly send: (bucket: string, of: 'files' | 'chunks', method: string, args: readonly Json[]) => Promise<unknown>;
  /** A file of the disk as the open dialog answers it, with a new `_id`. */
  readonly chosen: (path: string, name: string, size: number) => Chosen;
  readonly close: () => Promise<void>;
}

function saved(id: ConnectionId, name: string, readOnly: boolean): ConnectionView {
  return {
    id,
    name,
    engine: 'mongodb',
    hosts: '127.0.0.1',
    readOnly,
    keepsUndo: false,
    secrets: { ...noSecretsSaved, connectionString: true },
  };
}

function firstState(): AppState {
  return {
    ...initialState,
    connections: {
      ...initialConnectionsState,
      loaded: true,
      saved: [saved(localId, 'Local', false), saved(productionId, 'Production', true)],
    },
  };
}

/** The digest of the bytes of a file, read as a stream. */
export async function digestOf(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

function dialogActions(live: LiveGridFs): Readonly<Record<string, AppAction>> {
  return {
    'gridfs.choose-file': () => Promise.resolve(live.dialogs.shift() ?? null),
    'gridfs.temporary-folder': () => Promise.resolve(live.folder),
    'gridfs.open-copy': (args) => {
      const path = (args as { path?: string } | null)?.path ?? '';
      live.opened.push(path);
      return Promise.resolve(null);
    },
  };
}

/** What a long step says, given to the test before the runner. */
function heard(live: LiveGridFs, progress: StepProgress | undefined): StepProgress {
  return (said) => {
    progress?.(said);
    live.onProgress?.(said);
  };
}

/** The runner on the test MongoDB, its databases named after `name`. */
export async function liveGridFs(name: string): Promise<LiveGridFs> {
  const url = testServers().mongoStandalone;
  const folder = await mkdtemp(join(tmpdir(), 'datardo-gridfs-test-'));
  const engines = createEngines();
  for (const id of [localId, productionId]) {
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: url, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(30_000),
    );
  }
  let state = firstState();
  const holder = {
    get: () => state,
    dispatch: (event: AppEvent) => {
      state = reduce(state, event);
    },
  };
  const isReadOnly = (id: ConnectionId): boolean => id === productionId;
  const connectionName = (id: ConnectionId): string => (id === productionId ? 'Production' : 'Local');
  const database = `m33-${name}`;
  const gridFs = gridFsActions({ engines: () => engines, isReadOnly, connectionName });
  const live: LiveGridFs = {
    engines,
    folder,
    database,
    state: () => state,
    answers: [],
    confirmed: [],
    confirmAnswer: true,
    dialogs: [],
    opened: [],
    onProgress: undefined,
    start: (feature, args, connection = localId, place = 'tree-menu') =>
      start(ports, {
        feature: featureId(feature),
        target: { kind: 'database', connection, database },
        args,
        place,
      }),
    cancel: () => cancelLatest(ports),
    notifications: () => state.runner.notifications.map((each) => each.text),
    send: (bucket, of, method, args) =>
      engines.send(
        {
          connection: localId,
          request: bucketRequest({ connection: localId, database, bucket }, of, { method, arguments: args }),
        },
        AbortSignal.timeout(30_000),
      ),
    chosen: (path, fileName, size) => ({ path, name: fileName, size, id: newObjectId() }),
    close: async () => {
      await engines
        .send(
          { connection: localId, request: { engine: 'mongodb', database, method: 'dropDatabase', arguments: [] } },
          AbortSignal.timeout(30_000),
        )
        .catch(() => undefined);
      await engines.disconnectAll();
      await rm(folder, { recursive: true, force: true });
    },
  };
  const actions: Readonly<Record<string, AppAction>> = {
    'gridfs.check-files': gridFs['gridfs.check-files'] as AppAction,
    'gridfs.write-chunks': (args, signal, progress) =>
      (gridFs['gridfs.write-chunks'] as AppAction)(args, signal, heard(live, progress)),
    ...dialogActions(live),
  };
  const ports: RunnerPorts = {
    features: runnableFeatures(),
    engines,
    appActions: new Map(Object.entries(actions)),
    files: async (step, signal, progress) => {
      const content = step.action === 'write' ? step.content : undefined;
      if (content?.writer !== 'gridfs.download') {
        throw new Error(`No writer for ${step.path} in these tests.`);
      }
      await writeDownload({ engines: () => engines }, step.path, content.args, {
        signal,
        progress: heard(live, progress),
      });
    },
    dialogs: {
      ask: () => Promise.resolve(live.answers.shift()),
      confirm: (_feature, confirmation) => {
        live.confirmed.push(confirmation.danger.text.split('\n')[0] ?? '');
        return Promise.resolve(live.confirmAnswer);
      },
    },
    state: holder,
    platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
    isReadOnly,
    isConnected: (id) => engines.isConnected(id),
    connectionName,
    now: () => Date.now(),
  };
  return live;
}
