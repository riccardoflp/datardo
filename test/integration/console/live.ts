/**
 * The consoles against the test Redis (testing.md): the main process's console service (`src/main/consoles.ts`, its
 * actions and the watch of `console.run`) on a state of its own, with the connections **Cache** (writable, saved on
 * db6) and **Cache read-only** (saved on db7), each with a console tab open; the runner with the features of the
 * registry, its confirmations accepted or cancelled as a test says. The keys are `m16:*`, in the databases 6 and 7 of
 * a shared server. A test file that uses it replaces `src/main/connections` with `./fake-connections`.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngines, type EngineService } from '../../../src/engines';
import { consoleOwner } from '../../../src/features/console/types';
import { runnableFeatures } from '../../../src/features/registry';
import { actions as consoleActions } from '../../../src/main/actions/console';
import { startWithConsoles, withConsoles } from '../../../src/main/console-commands';
import { consolesReady, start as startConsoles } from '../../../src/main/consoles';
import type { MainServices } from '../../../src/main/services';
import type { AppStateHolder } from '../../../src/main/app-state';
import type { RunnerPorts } from '../../../src/runner/ports';
import type { IntentResult } from '../../../src/shared/bridge';
import { noSecretsSaved, type ConnectionView } from '../../../src/shared/connection';
import { redisCommand, type Json } from '../../../src/shared/engine-request';
import { connectionId, featureId, type ConnectionId } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import type { ConsoleState } from '../../../src/shared/state/consoles';
import type { Confirmation } from '../../../src/shared/state/runner';
import { testServers } from '../servers';
import { useFakes } from './fake-connections';

/** The writable connection. */
export const cacheId = connectionId('c-m16-cache');
/** The same server, read-only. */
export const readOnlyId = connectionId('c-m16-read-only');
/** The client the tests look at the server with, outside the consoles. */
const toolId = connectionId('c-m16-tool');

/** The databases this milestone's tests may use on a shared server: Cache is saved on the first, read-only on the other. */
export const databases: readonly [number, number] = [6, 7];

/** The consoles on the test Redis. */
export interface LiveConsoles {
  readonly engines: EngineService;
  readonly folder: string;
  readonly version: string;
  readonly state: () => AppState;
  readonly console: (connection: ConnectionId) => ConsoleState;
  /** The confirmations shown. */
  readonly confirmed: Confirmation[];
  /** Whether the next confirmations are accepted. */
  accept: boolean;
  /** Every request sent to the engines through the runner, as the words of its command. */
  readonly sent: string[];
  /** Runs a line in the console of a connection, as `Enter` does. */
  readonly run: (line: string, connection?: ConnectionId) => Promise<IntentResult>;
  /** Starts a feature on a connection, through the bridge's start. */
  readonly start: (feature: string, connection: ConnectionId, args?: Json) => Promise<IntentResult>;
  /** Sends one command to a database, outside the consoles. */
  readonly command: (database: number, ...words: (string | Uint8Array)[]) => Promise<unknown>;
  /** Changes the state as the main process would. */
  readonly dispatch: (event: AppEvent) => void;
  /** Waits until the console of a connection is in a state. */
  readonly until: (connection: ConnectionId, test: (console: ConsoleState) => boolean) => Promise<ConsoleState>;
  readonly close: () => Promise<void>;
}

function saved(id: ConnectionId, name: string, readOnly: boolean, address: string): ConnectionView {
  return {
    id,
    name,
    engine: 'redis',
    hosts: '127.0.0.1',
    address,
    readOnly,
    keepsUndo: false,
    secrets: { ...noSecretsSaved, connectionString: true },
  };
}

/** A state holder like the main process's: it tells its listeners of every event. */
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

async function serverVersion(engines: EngineService): Promise<string> {
  const info = (await engines.send(
    { connection: toolId, request: redisCommand(0, 'INFO', 'server') },
    AbortSignal.timeout(10_000),
  )) as Uint8Array;
  return /redis_version:([\d.]+)/u.exec(new TextDecoder().decode(info))?.[1] ?? '6.2.0';
}

function recording(engines: EngineService, sent: string[]): EngineService {
  const consoles = withConsoles(engines);
  return {
    ...consoles,
    send: (request, signal) => {
      if (request.request.engine === 'redis') {
        sent.push(request.request.command.map((word) => new TextDecoder().decode(word)).join(' '));
      }
      return consoles.send(request, signal);
    },
  };
}

/** The consoles on the test Redis, with a console tab open for each connection. */
export async function liveConsoles(): Promise<LiveConsoles> {
  const url = testServers().redis ?? '';
  const folder = await mkdtemp(join(tmpdir(), 'datardo-console-'));
  const engines = createEngines();
  for (const id of [cacheId, readOnlyId, toolId]) {
    await engines.connect(
      id,
      { engine: 'redis', connectionString: url, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(30_000),
    );
  }
  const version = await serverVersion(engines);
  const connections = [
    saved(cacheId, 'Cache', false, `${url}/${String(databases[0])}`),
    saved(readOnlyId, 'Cache read-only', true, `${url}/${String(databases[1])}`),
  ];
  useFakes({ engines, saved: connections, url });
  const server = { engine: 'redis' as const, product: 'Redis' as const, version, redisVersion: version };
  const holder = holderOf({
    ...initialState,
    connections: {
      ...initialConnectionsState,
      loaded: true,
      saved: connections,
      live: { [cacheId]: { state: 'connected', server }, [readOnlyId]: { state: 'connected', server } },
    },
  });
  const quits: (() => Promise<void>)[] = [];
  const sent: string[] = [];
  const confirmed: Confirmation[] = [];
  const services = {
    state: holder as unknown as AppStateHolder,
    dataFolder: folder,
    window: () => undefined,
    onQuit: (flush: () => Promise<void>) => quits.push(flush),
    dialogs: { ask: () => Promise.resolve(undefined), confirm: () => Promise.resolve(false) },
    platform: 'windows',
  } as unknown as MainServices;
  const names: Readonly<Record<string, string>> = { [cacheId]: 'Cache', [readOnlyId]: 'Cache read-only' };
  const live: LiveConsoles = {
    engines,
    folder,
    version,
    state: () => holder.get(),
    console: (connection) => {
      const found = holder.get().consoles[connection];
      if (found === undefined) {
        throw new Error(`No console for ${connection}.`);
      }
      return found;
    },
    confirmed,
    accept: true,
    sent,
    run: (line, connection = cacheId) => live.start('console.run', connection, { line, lines: 1 }),
    start: (feature, connection, args) =>
      startWithConsoles(ports, {
        feature: featureId(feature),
        target: { kind: 'connection', connection },
        place: 'editor',
        ...(args === undefined ? {} : { args }),
      }),
    command: (database, ...words) =>
      engines.send({ connection: toolId, request: redisCommand(database, ...words) }, AbortSignal.timeout(30_000)),
    dispatch: (event) => {
      holder.dispatch(event);
    },
    until: async (connection, test) => {
      for (let waited = 0; waited < 15_000; waited += 20) {
        const now = holder.get().consoles[connection];
        if (now !== undefined && test(now)) {
          return now;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`The console of ${connection} never got there.`);
    },
    close: async () => {
      await Promise.allSettled(quits.map((flush) => flush()));
      await engines.disconnectAll();
      await rm(folder, { recursive: true, force: true });
    },
  };
  const ports: RunnerPorts = {
    features: runnableFeatures(),
    engines: recording(engines, sent),
    appActions: new Map(Object.entries({ ...consoleActions(services), 'nav.copy': () => Promise.resolve(null) })),
    files: () => Promise.resolve(),
    dialogs: {
      ask: () => Promise.resolve(undefined),
      confirm: (_feature, confirmation) => {
        confirmed.push(confirmation);
        return Promise.resolve(live.accept);
      },
    },
    state: holder,
    platform: 'windows',
    isReadOnly: (id) => (consoleOwner(id) ?? id) === readOnlyId,
    isConnected: (id) => engines.isConnected(id),
    connectionName: (id) => names[consoleOwner(id) ?? id] ?? id,
    now: () => Date.now(),
  };
  await startConsoles(services);
  consolesReady(ports);
  for (const connection of [cacheId, readOnlyId]) {
    holder.dispatch({
      slice: 'tabs',
      type: 'opened',
      seed: { shows: { kind: 'console', connection } },
      key: `console ${connection}`,
      background: false,
      at: Date.now(),
    });
  }
  for (const connection of [cacheId, readOnlyId]) {
    await live.until(connection, (console) => console.status === 'ready');
  }
  return live;
}
