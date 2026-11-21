/**
 * The Pub/Sub pages against the test servers (testing.md): the main process's service of the pages
 * (`src/main/pubsub.ts`, its actions, the watch of their commands) on a state of its own, with the Redis connections
 * **Cache** (writable) and **Cache read-only**, and the MongoDB connection **Local** linked to Cache; the runner with
 * the features of the registry and the test plans, which publish the events of redis-oplog. Redis is shared with other
 * tests that run at the same time: every channel and pattern of a run starts with a prefix of its own (`m18:<hex>:`),
 * and the only client a test closes is a page's own. A test file that uses it replaces `src/main/connections` with
 * `../console/fake-connections`.
 */
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngines, type EngineClient, type EngineService } from '../../../src/engines';
import { pubsubClient, pubsubOwner, type PubSubPage } from '../../../src/features/pubsub/types';
import { runnableFeatures } from '../../../src/features/registry';
import { actions as pubsubActions } from '../../../src/main/actions/pubsub';
import { actions as tabActions } from '../../../src/main/actions/tab';
import type { AppStateHolder } from '../../../src/main/app-state';
import { pubsubReady, start as startPubSub } from '../../../src/main/pubsub';
import { messagesFile, startWithPubSub, withPubSub } from '../../../src/main/pubsub-commands';
import type { MainServices } from '../../../src/main/services';
import { testPlans } from '../../../src/main/test-plans';
import type { OplogClients, RunnerPorts } from '../../../src/runner/ports';
import { runtimeOf } from '../../../src/runner/runtime';
import type { IntentResult } from '../../../src/shared/bridge';
import { noSecretsSaved, type ConnectionView } from '../../../src/shared/connection';
import { redisCommand, type Json } from '../../../src/shared/engine-request';
import type { Answers, RunnableFeature } from '../../../src/shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import type { Target } from '../../../src/shared/target';
import { useFakes } from '../console/fake-connections';
import { testServers } from '../servers';

/** The writable Redis connection. */
export const cacheId = connectionId('c-m18-cache');
/** The same server, read-only. */
export const readOnlyId = connectionId('c-m18-read-only');
/** The MongoDB connection linked to Cache. */
export const localId = connectionId('c-m18-local');
/** The client the tests look at the server with, outside the pages. */
const toolId = connectionId('c-m18-tool');

/** The Pub/Sub pages on the test servers. */
export interface LivePubSub {
  readonly engines: EngineService;
  /** The prefix of every channel and pattern of this run, which is also Local's channel prefix. */
  readonly prefix: string;
  readonly state: () => AppState;
  readonly page: (connection?: ConnectionId) => PubSubPage;
  /** Every request sent to the engines through the runner, as the words of its command. */
  readonly sent: string[];
  /** The files the runner wrote, by path. */
  readonly files: Map<string, string>;
  /** What the dialogs answer: the file of an export, and the answers of a form (none cancels it). */
  file: string | null;
  answers: Answers | undefined;
  /** Starts a feature on a connection, through the bridge's start. */
  readonly start: (feature: string, connection: ConnectionId, args?: Json) => Promise<IntentResult>;
  /** Starts a feature on a target, as a page of the window or a test plan does. */
  readonly startOn: (feature: string, target: Target, args?: Json) => Promise<IntentResult>;
  /** Opens the Pub/Sub tab of a connection, as `tab.open` does. */
  readonly openTab: (connection?: ConnectionId) => Promise<void>;
  /** Sends one command outside the pages, on a client of its own. */
  readonly command: (...words: (string | Uint8Array)[]) => Promise<unknown>;
  /** Changes the state as the main process would. */
  readonly dispatch: (event: AppEvent) => void;
  /** Waits until the page of a connection is in a state. */
  readonly until: (test: (page: PubSubPage) => boolean, connection?: ConnectionId, ms?: number) => Promise<PubSubPage>;
  /** Waits for the events of redis-oplog queued so far. */
  readonly published: () => Promise<void>;
  readonly close: () => Promise<void>;
}

function redis(id: ConnectionId, name: string, readOnly: boolean): ConnectionView {
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

function holderOf(first: AppState) {
  let state = first;
  const listeners = new Set<(event: AppEvent, state: AppState) => void>();
  return {
    get: () => state,
    dispatch: (event: AppEvent) => {
      state = reduce(state, event);
      for (const listener of [...listeners]) {
        listener(event, state);
      }
    },
    listen: (listener: (event: AppEvent, state: AppState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
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

function recording(engines: EngineService, sent: string[]): EngineService {
  const watched = withPubSub(engines);
  return {
    ...watched,
    send: (request, signal) => {
      if (request.request.engine === 'redis') {
        sent.push(request.request.command.map((word) => new TextDecoder().decode(word)).join(' '));
      }
      return watched.send(request, signal);
    },
  };
}

function features(): ReadonlyMap<ReturnType<typeof featureId>, RunnableFeature> {
  return new Map([
    ...runnableFeatures(),
    ...testPlans.map((plan): [typeof plan.id, RunnableFeature] => [plan.id, plan]),
  ]);
}

async function connectAll(engines: EngineService, url: string, mongo: string): Promise<void> {
  for (const id of [cacheId, readOnlyId, toolId]) {
    await engines.connect(
      id,
      { engine: 'redis', connectionString: url, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(30_000),
    );
  }
  await engines.connect(
    localId,
    { engine: 'mongodb', connectionString: mongo, connectTimeoutMs: 10_000 },
    AbortSignal.timeout(30_000),
  );
}

function stateOf(connections: readonly ConnectionView[]): AppState {
  const server = { engine: 'redis' as const, product: 'Redis' as const, version: '7.0.0', redisVersion: '7.0.0' };
  return {
    ...initialState,
    connections: {
      ...initialConnectionsState,
      loaded: true,
      saved: connections,
      live: {
        [cacheId]: { state: 'connected', server },
        [readOnlyId]: { state: 'connected', server },
        [localId]: { state: 'connected', server: { engine: 'mongodb', product: 'MongoDB', version: '8.0.0' } },
      },
    },
  } as AppState;
}

/** The pages on the test servers, with Local linked to Cache under the prefix of this run. */
export async function livePubSub(): Promise<LivePubSub> {
  const servers = testServers();
  const url = servers.redis ?? '';
  const prefix = `m18:${randomBytes(4).toString('hex')}:`;
  const folder = await mkdtemp(join(tmpdir(), 'datardo-pubsub-'));
  const engines = createEngines();
  await connectAll(engines, url, servers.mongoReplicaSet);
  const local: ConnectionView = {
    ...redis(localId, 'Local', false),
    engine: 'mongodb',
    keepsUndo: false,
    publishesTo: cacheId,
    oplog: { prefix, namespaces: ['tenant1'] },
  };
  const connections = [redis(cacheId, 'Cache', false), redis(readOnlyId, 'Cache read-only', true), local];
  useFakes({ engines, saved: connections, url });
  const holder = holderOf(stateOf(connections));
  const quits: (() => Promise<void>)[] = [];
  const sent: string[] = [];
  const files = new Map<string, string>();
  const oplog = oplogClients(engines, url);
  const names: Readonly<Record<string, string>> = {
    [cacheId]: 'Cache',
    [readOnlyId]: 'Cache read-only',
    [localId]: 'Local',
  };
  const services = {
    state: holder as unknown as AppStateHolder,
    dataFolder: folder,
    window: () => undefined,
    onQuit: (flush: () => Promise<void>) => quits.push(flush),
    dialogs: { ask: () => Promise.resolve(undefined), confirm: () => Promise.resolve(false) },
    platform: 'windows',
    start: (intent: Parameters<MainServices['start']>[0]) => startWithPubSub(ports, intent),
  } as unknown as MainServices;
  const ownerOf = (id: ConnectionId): ConnectionId => pubsubOwner(id) ?? id;
  const live: LivePubSub = {
    engines,
    prefix,
    state: () => holder.get(),
    page: (connection = cacheId) => {
      const found = holder.get().pubsubPages[connection];
      if (found === undefined) {
        throw new Error(`No Pub/Sub page for ${connection}.`);
      }
      return found;
    },
    sent,
    files,
    file: null,
    answers: undefined,
    start: (feature, connection, args) => live.startOn(feature, { kind: 'connection', connection }, args),
    startOn: (feature, target, args) =>
      startWithPubSub(ports, {
        feature: featureId(feature),
        target,
        place: 'toolbar',
        ...(args === undefined ? {} : { args }),
      }),
    openTab: async (connection = cacheId) => {
      await live.start('pubsub.show', connection);
      await live.until(() => true, connection);
    },
    command: (...words) =>
      engines.send({ connection: toolId, request: redisCommand(0, ...words) }, AbortSignal.timeout(30_000)),
    dispatch: (event) => {
      holder.dispatch(event);
    },
    until: async (test, connection = cacheId, ms = 15_000) => {
      for (let waited = 0; waited < ms; waited += 20) {
        const now = holder.get().pubsubPages[connection];
        if (now !== undefined && test(now)) {
          return now;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`The Pub/Sub page of ${connection} never got there.`);
    },
    published: () => runtimeOf(ports).publishing.idle(),
    close: async () => {
      await Promise.allSettled(quits.map((flush) => flush()));
      await oplog.close();
      await engines.disconnectAll();
      await rm(folder, { recursive: true, force: true });
    },
  };
  const ports: RunnerPorts = {
    features: features(),
    engines: recording(engines, sent),
    appActions: new Map(
      Object.entries({
        ...tabActions(services),
        ...pubsubActions(services),
        'pubsub.choose-file': () => Promise.resolve(live.file),
        'nav.copy': () => Promise.resolve(null),
      }),
    ),
    files: async (step) => {
      if (step.content?.writer === 'pubsub.messages') {
        files.set(step.path, await messagesFile(step.content.args));
      }
    },
    dialogs: { ask: () => Promise.resolve(live.answers), confirm: () => Promise.resolve(true) },
    state: holder,
    platform: 'windows',
    isReadOnly: (id) => ownerOf(id) === readOnlyId,
    isConnected: (id) => engines.isConnected(id),
    connectionName: (id) => names[ownerOf(id)] ?? id,
    now: () => Date.now(),
    oplog: oplog.clients,
  };
  await startPubSub(services);
  pubsubReady(ports);
  return live;
}

/** The id the server gives the page's own client, to close it from another client. */
export async function pageClientId(live: LivePubSub, connection: ConnectionId = cacheId): Promise<number> {
  const id = await live.engines.send(
    { connection: pubsubClient(connection), request: redisCommand(0, 'CLIENT', 'ID') },
    AbortSignal.timeout(10_000),
  );
  if (typeof id !== 'number') {
    throw new Error('CLIENT ID did not answer a number.');
  }
  return id;
}
