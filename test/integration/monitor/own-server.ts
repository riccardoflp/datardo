/**
 * A mongod of its own for the tests of the Monitor page and of the Index advisor (testing.md, "Throwaway servers"):
 * their profiler threshold (`slowms`) is the server's, so changing it on the shared servers would change what the
 * other test files log. The runner is given the features of the registry, the engine connected to this server, and
 * the app actions of the MCP server's `advisor.analyze`; the confirmations answer as each test says.
 */
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { createEngines, type EngineService } from '../../../src/engines';
import { runnableFeatures } from '../../../src/features/registry';
import type { RunnerPorts } from '../../../src/runner/ports';
import { start } from '../../../src/runner/start';
import type { IntentResult } from '../../../src/shared/bridge';
import { noSecretsSaved, type ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../../src/shared/ids';
import type { Question } from '../../../src/shared/question';
import type { Confirmation } from '../../../src/shared/state/runner';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';

/** The connection to the server, and its read-only twin. */
export const ownId = connectionId('c-monitor');
export const readOnlyId = connectionId('c-monitor-read-only');

/** What a test answers to a confirmation, and what it was asked. */
export interface Dialogs {
  confirm: boolean;
  readonly confirmed: Confirmation[];
  readonly asked: Question[];
  answer: (question: Question) => Answers;
}

/** The runner on a server of its own. */
export interface OwnServer {
  readonly uri: string;
  readonly ports: RunnerPorts;
  readonly engines: EngineService;
  readonly dialogs: Dialogs;
  readonly state: () => AppState;
  readonly start: (feature: string, args: Json, connection?: ConnectionId) => Promise<IntentResult>;
  /** Sends a command to the server, as the runner would. */
  readonly command: (database: string, command: Json) => Promise<unknown>;
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

/** Starts the server, connects both connections, and makes the runner. */
export async function ownServer(): Promise<OwnServer> {
  const binary = process.env['MONGOMS_SYSTEM_BINARY'];
  const server = await MongoMemoryServer.create(
    binary === undefined || binary === '' ? {} : { binary: { systemBinary: binary } },
  );
  const uri = server.getUri();
  const engines = createEngines();
  for (const id of [ownId, readOnlyId]) {
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: uri, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(30_000),
    );
  }
  let state: AppState = {
    ...initialState,
    connections: {
      ...initialConnectionsState,
      loaded: true,
      saved: [saved(ownId, 'Local', false), saved(readOnlyId, 'Production', true)],
    },
    nav: { ...initialState.nav, current: ownId },
  };
  const holder = {
    get: () => state,
    dispatch: (event: AppEvent) => {
      state = reduce(state, event);
    },
  };
  const dialogs: Dialogs = { confirm: true, confirmed: [], asked: [], answer: () => ({}) };
  const ports: RunnerPorts = {
    features: runnableFeatures(),
    engines,
    appActions: new Map(),
    files: () => Promise.resolve(),
    dialogs: {
      ask: (_feature, question) => {
        dialogs.asked.push(question);
        return Promise.resolve(dialogs.answer(question));
      },
      confirm: (_feature, question) => {
        dialogs.confirmed.push(question);
        return Promise.resolve(dialogs.confirm);
      },
    },
    state: holder,
    platform: 'windows',
    isReadOnly: (id) => id === readOnlyId,
    isConnected: (id) => engines.isConnected(id),
    connectionName: (id) => (id === ownId ? 'Local' : id === readOnlyId ? 'Production' : id),
    now: () => Date.now(),
  };
  return {
    uri,
    ports,
    engines,
    dialogs,
    state: () => state,
    start: (feature, args, connection = ownId) =>
      start(ports, { feature: featureId(feature), target: { kind: 'connection', connection }, args }),
    command: (database, command) =>
      engines.send(
        { connection: ownId, request: { engine: 'mongodb', database, method: 'runCommand', arguments: [command] } },
        AbortSignal.timeout(30_000),
      ),
    close: async () => {
      await engines.disconnectAll();
      await server.stop();
    },
  };
}
