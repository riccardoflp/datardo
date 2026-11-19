/**
 * The runner with its hooks of the undo history and of redis-oplog against real servers (testing.md): the features of
 * the registry and the test plans, the engines connected to the MongoDB replica set and to the Redis server, the
 * actions of the undo history on a temporary data folder, and clients that send the events of redis-oplog to Redis.
 */
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngines, type EngineClient, type EngineService } from '../../../src/engines';
import { runnableFeatures } from '../../../src/features/registry';
import { undoActions } from '../../../src/main/undo-actions';
import { testPlans } from '../../../src/main/test-plans';
import type { OplogClients, RunnerPorts } from '../../../src/runner/ports';
import { runtimeOf } from '../../../src/runner/runtime';
import { start } from '../../../src/runner/start';
import type { IntentResult } from '../../../src/shared/bridge';
import { noSecretsSaved, type ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import type { RunnableFeature } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import type { Target } from '../../../src/shared/target';
import { testServers } from '../servers';

/** The MongoDB connection, which publishes to the Redis one. */
export const localId = connectionId('c-local');
/** The Redis connection. */
export const cacheId = connectionId('c-cache');

/** The runner on real servers, what it keeps, and a way to start a feature. */
export interface Live {
  readonly ports: RunnerPorts;
  readonly engines: EngineService;
  readonly folder: string;
  /** The prefix of the channels of redis-oplog in this run. */
  readonly prefix: string;
  readonly state: () => AppState;
  readonly start: (feature: string, target: Target, args: Json, place?: 'table') => Promise<IntentResult>;
  /** Waits for the events of redis-oplog queued so far. */
  readonly published: () => Promise<void>;
  readonly close: () => Promise<void>;
}

function saved(id: string, name: string, more: Partial<ConnectionView>): ConnectionView {
  return {
    id: connectionId(id),
    name,
    engine: 'mongodb',
    hosts: '127.0.0.1',
    readOnly: false,
    keepsUndo: true,
    secrets: { ...noSecretsSaved, connectionString: true },
    ...more,
  };
}

function oplogClients(engines: EngineService, url: string): { clients: OplogClients; close: () => Promise<void> } {
  let client: Promise<EngineClient> | undefined;
  return {
    clients: {
      send: async (_mongo, _linked, requests) => {
        client ??= engines.open(
          { engine: 'redis', connectionString: url, connectTimeoutMs: 10_000 },
          AbortSignal.timeout(10_000),
        );
        const open = await client;
        await Promise.all(requests.map((request) => open.send(request, AbortSignal.timeout(5000))));
      },
      secrets: () => [],
    },
    close: async () => {
      await (await client)?.close();
    },
  };
}

function features(): ReadonlyMap<ReturnType<typeof featureId>, RunnableFeature> {
  return new Map([
    ...runnableFeatures(),
    ...testPlans.map((plan): [typeof plan.id, RunnableFeature] => [plan.id, plan]),
  ]);
}

/** The runner on the test servers, with Local publishing to Cache under a prefix of its own. */
export async function live(): Promise<Live> {
  const servers = testServers();
  const redisUrl = servers.redis ?? '';
  const folder = await mkdtemp(join(tmpdir(), 'datardo-undo-'));
  const prefix = `undo-${randomBytes(4).toString('hex')}.`;
  const engines = createEngines();
  await engines.connect(
    localId,
    { engine: 'mongodb', connectionString: servers.mongoReplicaSet, connectTimeoutMs: 10_000 },
    AbortSignal.timeout(30_000),
  );
  await engines.connect(
    cacheId,
    { engine: 'redis', connectionString: redisUrl, connectTimeoutMs: 10_000 },
    AbortSignal.timeout(30_000),
  );
  let state: AppState = {
    ...initialState,
    connections: {
      ...initialConnectionsState,
      loaded: true,
      saved: [
        saved(localId, 'Local', { publishesTo: cacheId, oplog: { prefix } }),
        saved(cacheId, 'Cache', { engine: 'redis' }),
      ],
    },
  };
  const holder = {
    get: () => state,
    dispatch: (event: AppEvent) => {
      state = reduce(state, event);
    },
  };
  const oplog = oplogClients(engines, redisUrl);
  const actions = undoActions({
    state: holder,
    dataFolder: folder,
    engines: () => engines,
    writeEntries: () => undefined,
    indexFound: () => ({ kind: 'current' }),
    connectFirst: () => Promise.resolve(),
    findConnection: () => undefined,
    writeConnection: () => undefined,
  });
  const ports: RunnerPorts = {
    features: features(),
    engines,
    appActions: new Map(Object.entries(actions)),
    files: () => Promise.resolve(),
    dialogs: { ask: () => Promise.resolve({}), confirm: () => Promise.resolve(true) },
    state: holder,
    platform: 'windows',
    isReadOnly: () => false,
    isConnected: (id) => engines.isConnected(id),
    connectionName: (id) => (id === localId ? 'Local' : id === cacheId ? 'Cache' : id),
    now: () => Date.now(),
    oplog: oplog.clients,
  };
  return {
    ports,
    engines,
    folder,
    prefix,
    state: () => state,
    start: (feature, target, args, place) =>
      start(ports, { feature: featureId(feature), target, args, ...(place === undefined ? {} : { place }) }),
    published: () => runtimeOf(ports).publishing.idle(),
    close: async () => {
      await oplog.close();
      await engines.disconnectAll();
      await rm(folder, { recursive: true, force: true });
    },
  };
}
