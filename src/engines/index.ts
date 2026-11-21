/**
 * The engines behind one interface (D8): what the runner sends a request to, and what the main process connects and
 * disconnects. One client per connection; a request names its connection, and goes to that connection's client.
 */
import type { ConnectionId } from '../shared/ids';
import type { ConnectionRequest, EngineName } from '../shared/engine-request';
import { EngineError, type ClientSettings, type Engine, type EngineClient } from './engine';
import { mongoEngine } from './mongodb';
import { redisEngine } from './redis';
import { openConsoleClient } from './redis/console-client';

export type {
  ClientSettings,
  ClientSsh,
  ClientThrough,
  ClientTls,
  Engine,
  EngineClient,
  HostKeyCheck,
  TunnelTarget,
} from './engine';
export { EngineError } from './engine';
export { MongoEngineError } from './mongodb/errors';
export { bsonBytes } from './mongodb/bson-bytes';
export { redisAddress } from './redis';
export { closedBeforeReply } from './redis/console-client';

/** Carries out requests on the connections it holds a client for. */
export interface EngineService {
  /** Carries out a request on the connection it names. */
  readonly send: (request: ConnectionRequest, signal: AbortSignal) => Promise<unknown>;
  /** Opens the client of a connection, closing the one it had. */
  readonly connect: (connection: ConnectionId, settings: ClientSettings, signal: AbortSignal) => Promise<void>;
  /**
   * Opens the console's own connection to a Redis server (`console.connect`) under an id of its own, closing the one
   * it had: a socket that sends what it is given and answers each command with a `ConsoleAnswer`, the server's errors
   * included.
   */
  readonly openConsole: (connection: ConnectionId, settings: ClientSettings, signal: AbortSignal) => Promise<void>;
  /** Closes the client of a connection, if it has one. */
  readonly disconnect: (connection: ConnectionId) => Promise<void>;
  /** Closes every client: when Datardo quits. */
  readonly disconnectAll: () => Promise<void>;
  /** Whether the connection has an open client. */
  readonly isConnected: (connection: ConnectionId) => boolean;
  /** Opens a client that belongs to no connection, for a test of the form: whoever opens it closes it. */
  readonly open: (settings: ClientSettings, signal: AbortSignal) => Promise<EngineClient>;
  /** Calls `listener` each time a connection's client is lost by itself; returns what stops listening. */
  readonly onDrop: (listener: (connection: ConnectionId, reason: string) => void) => () => void;
}

/** What the engines are made of: replaced by fakes in tests. */
export interface EngineOptions {
  readonly engines?: Readonly<Record<EngineName, Engine>>;
}

const defaultEngines: Readonly<Record<EngineName, Engine>> = { mongodb: mongoEngine, redis: redisEngine };

/** The engines, holding one client per connected connection. */
export function createEngines(options: EngineOptions = {}): EngineService {
  const engines = options.engines ?? defaultEngines;
  const clients = new Map<ConnectionId, EngineClient>();
  const listeners = new Set<(connection: ConnectionId, reason: string) => void>();
  const disconnect = async (connection: ConnectionId): Promise<void> => {
    const client = clients.get(connection);
    clients.delete(connection);
    await client?.close();
  };
  const keep = (connection: ConnectionId, client: EngineClient): void => {
    clients.set(connection, client);
    client.onDrop((reason) => {
      if (clients.get(connection) !== client) {
        return;
      }
      clients.delete(connection);
      void client.close();
      for (const listener of listeners) {
        listener(connection, reason);
      }
    });
  };
  const connect = async (connection: ConnectionId, settings: ClientSettings, signal: AbortSignal): Promise<void> => {
    await disconnect(connection);
    keep(connection, await engines[settings.engine].open(settings, signal));
  };
  const openConsole = async (connection: ConnectionId, settings: ClientSettings, signal: AbortSignal) => {
    await disconnect(connection);
    keep(connection, await openConsoleClient(settings, signal));
  };
  return {
    openConsole,
    send: (request, signal) => {
      const client = clients.get(request.connection);
      if (client === undefined) {
        return Promise.reject(new EngineError(`The connection ${request.connection} is not connected.`));
      }
      return client.send(request.request, signal);
    },
    connect,
    disconnect,
    disconnectAll: async () => {
      await Promise.allSettled([...clients.keys()].map(disconnect));
    },
    isConnected: (connection) => clients.has(connection),
    open: (settings, signal) => engines[settings.engine].open(settings, signal),
    onDrop: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
