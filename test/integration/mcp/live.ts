/**
 * The MCP server against real servers (testing.md): the main process's server (`src/main/mcp/host.ts`) listening on a
 * free port of 127.0.0.1, its tools sending through engines connected to the test MongoDB (the replica set as Local,
 * the standalone as Standalone) and to the test Redis (database 11 as Cache local, keys `m29:*` only), an MCP client
 * talking to it over HTTP, and every request the tools sent recorded. The access token lives in a map that stands for
 * the secret storage. A connection Locked has a password in its connection string and a server that never answers,
 * so that a test can look for that password in everything the server returns.
 */
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngines, type EngineService } from '../../../src/engines';
import { undoHistoryReply, undoWriteReply } from '../../../src/features/mcp/tool/undo-replies';
import { isToolTab } from '../../../src/features/mcp/tool/read-only';
import { mcpActions } from '../../../src/features/mcp/types';
import { runnableFeatures } from '../../../src/features/registry';
import { analyzeForTool } from '../../../src/main/advisor';
import { shardingForTool } from '../../../src/main/sharding';
import { McpHost, tokenKey } from '../../../src/main/mcp/host';
import type { RunnerPorts } from '../../../src/runner/ports';
import { start as startFeature } from '../../../src/runner/start';
import { readOperationFile } from '../../../src/storage/undo';
import { noSecretsSaved, type ConnectionView } from '../../../src/shared/connection';
import { redisCommand, type ConnectionRequest, type Json } from '../../../src/shared/engine-request';
import { connectionId, featureId, type ConnectionId } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import { testServers } from '../servers';

/** Local: the MongoDB replica set. */
export const localId = connectionId('c-m29-local');
/** Standalone: the standalone MongoDB server. */
export const standaloneId = connectionId('c-m29-standalone');
/** Cache local: the Redis server, on database 11. */
export const cacheId = connectionId('c-m29-cache');
/** Prod: the replica set again, read-only and not connected until a tool connects it. */
export const prodId = connectionId('c-m29-prod');
/** Locked: a password in its connection string, and a port where nothing answers. */
export const lockedId = connectionId('c-m29-locked');

/** The password of Locked, which nothing the server returns may hold. */
export const lockedPassword = 's3cret-m29-password';

/** The Redis database the tests use on the shared server. */
export const redisDatabase = 11;

/** The database of MongoDB the tests use. */
export const shopDatabase = 'm29shop';

/** What an HTTP answer was. */
export interface HttpReply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly text: string;
}

/** What a tool answered. */
export interface ToolReply {
  readonly text: string;
  readonly isError: boolean;
}

/** The MCP server on real servers, and an MCP client of it. */
export interface LiveMcp {
  readonly host: McpHost;
  readonly engines: EngineService;
  readonly port: number;
  readonly folder: string;
  readonly secrets: Map<string, string>;
  readonly state: () => AppState;
  readonly dispatch: (event: AppEvent) => void;
  /** Every request the tools sent, in order. */
  readonly sent: ConnectionRequest[];
  /** The intents of the tabs the tools opened. */
  readonly opened: Json[];
  /** Every text the server answered, to look for secrets in. */
  readonly answered: string[];
  /** Sends a raw HTTP request to the server. */
  readonly http: (options: RawRequest) => Promise<HttpReply>;
  /** Sends one JSON-RPC message with the token, and gives the parsed answer. */
  readonly rpc: (method: string, params?: Json, id?: number) => Promise<Record<string, unknown>>;
  /** Calls a tool with the token. */
  readonly tool: (name: string, args?: Json) => Promise<ToolReply>;
  /** Sends a command to Redis outside the server, in database 11. */
  readonly redis: (...words: (string | Uint8Array)[]) => Promise<unknown>;
  /** Sends a request to MongoDB outside the server. */
  readonly mongo: (database: string, method: string, args: Json[], collection?: string) => Promise<unknown>;
  /** The lines of the Log under the source MCP. */
  readonly mcpLines: () => readonly string[];
  readonly close: () => Promise<void>;
}

/** A raw request: its method, path, headers and body. */
export interface RawRequest {
  readonly method?: string;
  readonly path?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Buffer;
  readonly port?: number;
}

/** A port of 127.0.0.1 nothing listens on now. */
export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address !== null) {
          resolve(address.port);
        } else {
          reject(new Error('No free port.'));
        }
      });
    });
  });
}

/** Sends a raw HTTP request to 127.0.0.1. */
export function httpRequest(port: number, options: RawRequest): Promise<HttpReply> {
  return new Promise((resolve, reject) => {
    const body = options.body;
    const sent = request(
      {
        host: '127.0.0.1',
        port: options.port ?? port,
        method: options.method ?? 'POST',
        path: options.path ?? '/mcp',
        headers: {
          ...(body === undefined ? {} : { 'Content-Length': String(Buffer.byteLength(body)) }),
          ...options.headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
        response.on('error', reject);
      },
    );
    sent.on('error', reject);
    sent.end(body);
  });
}

function saved(id: ConnectionId, name: string, engine: 'mongodb' | 'redis', more: Partial<ConnectionView>) {
  return {
    id,
    name,
    engine,
    hosts: '127.0.0.1',
    readOnly: false,
    keepsUndo: true,
    secrets: { ...noSecretsSaved, connectionString: true },
    ...more,
  } satisfies ConnectionView;
}

function textOf(value: Json | undefined): string {
  return typeof value === 'string' ? value : '';
}

function holderOf(first: AppState) {
  let state = first;
  return {
    get: () => state,
    dispatch: (event: AppEvent) => {
      state = reduce(state, event);
    },
  };
}

/** The connection strings of the connections, as the secret storage would keep them. */
function connectionStrings(locked: number): Readonly<Record<string, string>> {
  const servers = testServers();
  return {
    [localId]: servers.mongoReplicaSet,
    [prodId]: servers.mongoReplicaSet,
    [standaloneId]: servers.mongoStandalone,
    [cacheId]: `${servers.redis ?? ''}/${String(redisDatabase)}`,
    [lockedId]: `mongodb://ada:${lockedPassword}@127.0.0.1:${String(locked)}/?serverSelectionTimeoutMS=1500`,
  };
}

/** Starts the MCP server on a free port, on a state whose connections Local, Standalone and Cache local are connected. */
export async function liveMcp(options: { readonly settings?: Readonly<Record<string, Json>> } = {}): Promise<LiveMcp> {
  const servers = testServers();
  const folder = await mkdtemp(join(tmpdir(), 'datardo-mcp-'));
  const engines = createEngines();
  const strings = connectionStrings(await freePort());
  const engineOf = (id: ConnectionId): 'mongodb' | 'redis' => (id === cacheId ? 'redis' : 'mongodb');
  const open = (id: ConnectionId) =>
    engines.connect(
      id,
      { engine: engineOf(id), connectionString: strings[id] ?? '', connectTimeoutMs: 10_000 },
      AbortSignal.timeout(30_000),
    );
  await Promise.all([localId, standaloneId, cacheId].map(open));
  const connections = [
    saved(localId, 'Local', 'mongodb', { address: servers.mongoReplicaSet, folder: 'Work' }),
    saved(standaloneId, 'Standalone', 'mongodb', { address: servers.mongoStandalone }),
    saved(cacheId, 'Cache local', 'redis', { address: strings[cacheId] ?? '' }),
    saved(prodId, 'Prod', 'mongodb', { address: servers.mongoReplicaSet, readOnly: true }),
    saved(lockedId, 'Locked', 'mongodb', { address: 'mongodb://ada@127.0.0.1/' }),
  ];
  const holder = holderOf({
    ...initialState,
    settings: { ...initialState.settings, stored: { ...options.settings } },
    connections: {
      ...initialConnectionsState,
      loaded: true,
      saved: connections,
      live: {
        [localId]: { state: 'connected' },
        [standaloneId]: { state: 'connected' },
        [cacheId]: { state: 'connected' },
      },
    },
  });
  const sent: ConnectionRequest[] = [];
  const opened: Json[] = [];
  const answered: string[] = [];
  const secrets = new Map<string, string>();
  const recorded = {
    send: (asked: ConnectionRequest, signal: AbortSignal) => {
      sent.push(asked);
      return engines.send(asked, signal);
    },
  };
  // The runner of the main process, for the reads `advisor.analyze` starts: nothing it may ask is answered.
  const ports: RunnerPorts = {
    features: runnableFeatures(),
    engines: recorded,
    appActions: new Map(),
    files: () => Promise.resolve(),
    dialogs: { ask: () => Promise.resolve(undefined), confirm: () => Promise.resolve(false) },
    state: holder,
    platform: 'windows',
    isReadOnly: (id) => holder.get().connections.saved.find((each) => each.id === id)?.readOnly === true,
    isConnected: (id) => engines.isConnected(id),
    connectionName: (id) => holder.get().connections.saved.find((each) => each.id === id)?.name ?? id,
    now: () => Date.now(),
  };
  const appAction = async (action: string, args: Json): Promise<unknown> => {
    const fields = (args ?? {}) as Readonly<Record<string, Json>>;
    switch (action) {
      case mcpActions.connect: {
        const id = connectionId(textOf(fields['connection']));
        try {
          await open(id);
          holder.dispatch({ slice: 'connections', type: 'state', connection: id, state: 'connected' });
          return 'connected';
        } catch {
          // Only the user can connect it: the tool says so.
          return 'needs-the-user';
        }
      }
      case mcpActions.undoHistory: {
        const state = holder.get();
        return undoHistoryReply(state.undo.entries, state.connections.saved);
      }
      case mcpActions.undoWrite: {
        const file = await readOperationFile(folder, textOf(fields['id']));
        if (file.kind !== 'read') {
          throw new Error(`its file is ${file.kind}`);
        }
        return undoWriteReply(file.content, Number(fields['limit'] ?? 20));
      }
      case mcpActions.openTab:
        if (!isToolTab(fields['intent'])) {
          throw new Error('The MCP server opens no such tab.');
        }
        opened.push(fields['intent'] ?? null);
        return { hidden: false };
      case 'saved-query.list':
        return { connectionName: 'Local', mine: [], recent: [], folder: null };
      case 'advisor.analyze':
        return analyzeForTool(args, (need, connection) =>
          startFeature(
            ports,
            { feature: need.read, target: { kind: 'connection', connection }, args: need.args },
            { startedBy: 'mcp' },
          ),
        );
      case 'monitor.sharding':
        return shardingForTool(args, (feature, given, connection) =>
          startFeature(
            ports,
            { feature: featureId(feature), target: { kind: 'connection', connection }, args: given },
            { startedBy: 'mcp' },
          ),
        );
      default:
        throw new Error(`No action ${action}.`);
    }
  };
  const host = new McpHost({
    state: holder,
    secrets: { get: (key) => secrets.get(key), set: (key, value) => (secrets.set(key, value), true) },
    randomBytes: (count) => new Uint8Array(randomBytes(count)),
    retryMs: 200,
    calls: {
      engines: recorded,
      appAction,
      version: '0.1.0',
      platform: 'windows',
      now: () => Date.now(),
    },
  });
  const port = await freePort();
  await host.start(port);
  const http = (options: RawRequest) =>
    httpRequest(port, options).then((reply) => {
      answered.push(reply.text);
      return reply;
    });
  const token = (): string => secrets.get(tokenKey) ?? '';
  const rpc = async (method: string, params?: Json, id = 1) => {
    const reply = await http({
      headers: { Host: `127.0.0.1:${String(port)}`, Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }),
    });
    return JSON.parse(reply.text) as Record<string, unknown>;
  };
  return {
    host,
    engines,
    port,
    folder,
    secrets,
    state: () => holder.get(),
    dispatch: (event) => {
      holder.dispatch(event);
    },
    sent,
    opened,
    answered,
    http,
    rpc,
    tool: async (name, args = {}) => {
      const answer = await rpc('tools/call', { name, arguments: args });
      const result = answer['result'] as { content?: { text: string }[]; isError?: boolean } | undefined;
      if (result === undefined) {
        throw new Error(`No result: ${JSON.stringify(answer)}`);
      }
      return { text: result.content?.[0]?.text ?? '', isError: result.isError === true };
    },
    redis: (...words) =>
      engines.send(
        { connection: cacheId, request: redisCommand(redisDatabase, ...words) },
        AbortSignal.timeout(10_000),
      ),
    mongo: (database, method, args, collection) =>
      engines.send(
        {
          connection: localId,
          request: {
            engine: 'mongodb',
            database,
            method,
            arguments: args,
            ...(collection === undefined ? {} : { collection }),
          },
        },
        AbortSignal.timeout(30_000),
      ),
    mcpLines: () =>
      holder
        .get()
        .runner.log.filter((line) => line.source === 'MCP')
        .map((line) => line.text),
    close: async () => {
      host.stop();
      await engines.disconnectAll();
      await rm(folder, { recursive: true, force: true });
    },
  };
}
