/**
 * The Redis engine (D11, D12): one client per connection with node-redis, in RESP3, named `datardo`, with the TLS
 * settings of the connection. Commands are sent as bytes in the database each request names; `KEYS` is never sent
 * (R9.3). The client does not reconnect by itself: `connection.reconnect` decides.
 */
import {
  createClient,
  type RedisClientOptions,
  type RedisClientType,
  type RedisFunctions,
  type RedisModules,
  type RedisScripts,
  type RespVersions,
} from 'redis';
import type { EngineRequest } from '../../shared/engine-request';
import { EngineError, type ClientSettings, type Engine, type EngineClient } from '../engine';
import { maskedError, secretsOf } from '../transport/mask';
import { socketTlsOptions } from '../transport/tls';
import { openDirectOrThrough } from '../transport/tunnel';
import { bytesMapping, toRedisReply } from './replies';
import { selectedAtStart, sendInDatabase } from './select';

/** The name the server sees for Datardo's clients (`CLIENT SETNAME`). */
export const clientName = 'datardo';

/** Where a Redis connection string leads, and with whom. */
export interface RedisAddress {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: number;
  readonly tls: boolean;
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    // Not percent-encoded: the text is its own value.
    return text;
  }
}

/** The address of a `redis://` or `rediss://` connection string. */
export function redisAddress(connectionString: string): RedisAddress {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // The message names no part of the string: it may hold the password.
    throw new EngineError('Invalid Redis connection string');
  }
  const database = Number.parseInt(url.pathname.replace(/^\//, '') || '0', 10);
  return {
    host: url.hostname.replace(/^\[(.*)\]$/, '$1'),
    port: url.port === '' ? 6379 : Number(url.port),
    username: decoded(url.username),
    password: decoded(url.password),
    database: Number.isNaN(database) ? 0 : database,
    tls: url.protocol === 'rediss:',
  };
}

type Client = RedisClientType<RedisModules, RedisFunctions, RedisScripts, RespVersions>;
type Options = RedisClientOptions<RedisModules, RedisFunctions, RedisScripts, RespVersions>;

/** How a client is opened: its settings, its address, and the host its certificate is checked against. */
interface Opening {
  readonly settings: ClientSettings;
  readonly address: RedisAddress;
  readonly servername: string;
}

async function optionsOf(opening: Opening, resp: RespVersions): Promise<Options> {
  const { settings, address } = opening;
  const common = { connectTimeout: settings.connectTimeoutMs, reconnectStrategy: false as const };
  const tls = address.tls || settings.tls !== undefined;
  return {
    RESP: resp,
    name: clientName,
    disableClientInfo: true,
    ...(address.username === '' ? {} : { username: address.username }),
    ...(address.password === '' ? {} : { password: address.password }),
    socket: tls
      ? {
          ...common,
          host: address.host,
          port: address.port,
          tls: true,
          ...(await socketTlsOptions(settings.tls ?? {}, opening.servername)),
        }
      : { ...common, host: address.host, port: address.port },
  };
}

function noAnswer(address: RedisAddress, settings: ClientSettings): EngineError {
  const seconds = String(Math.round(settings.connectTimeoutMs / 1000));
  return new EngineError(`Redis ${address.host}:${String(address.port)} didn't answer in ${seconds} seconds`);
}

function reasonOf(error: unknown, address: RedisAddress, settings: ClientSettings): unknown {
  return (error as { name?: unknown }).name === 'ConnectionTimeoutError' ? noAnswer(address, settings) : error;
}

/**
 * Waits for the client to be ready: the socket, then `HELLO` and `SETNAME`. node-redis bounds only the socket; a
 * server that accepts and never answers is bounded here, by the same time.
 */
async function readyInTime(
  client: Client,
  address: RedisAddress,
  settings: ClientSettings,
  signal: AbortSignal,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: (() => void) | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(noAnswer(address, settings));
    }, settings.connectTimeoutMs);
    stop = () => {
      reject(new EngineError('Cancelled.'));
    };
    signal.addEventListener('abort', stop, { once: true });
  });
  try {
    await Promise.race([client.connect(), late]);
  } finally {
    clearTimeout(timer);
    if (stop !== undefined) {
      signal.removeEventListener('abort', stop);
    }
  }
}

async function connectWith(opening: Opening, resp: RespVersions, signal: AbortSignal): Promise<Client> {
  const { settings, address } = opening;
  const client: Client = createClient(await optionsOf(opening, resp));
  client.on('error', () => {
    // Errors of the socket reach the commands and the 'end' of the client, which say them where they matter.
  });
  try {
    await readyInTime(client, address, settings, signal);
    return client;
  } catch (error: unknown) {
    if (client.isOpen) {
      client.destroy();
    }
    throw reasonOf(error, address, settings);
  }
}

function isHelloUnknown(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /unknown command/i.test(message) && /hello/i.test(message);
}

function clientOf(client: Client, secrets: readonly string[]): EngineClient {
  const selected = selectedAtStart();
  const dropListeners: ((reason: string) => void)[] = [];
  let closing = false;
  const dropped = (): void => {
    if (!closing) {
      for (const listener of dropListeners.splice(0)) {
        listener('The connection to Redis was closed.');
      }
    }
  };
  client.on('end', dropped);
  // With no reconnection, a socket the server closes ends in an error, not in 'end': the client is then closed.
  client.on('error', () => {
    if (!client.isOpen) {
      dropped();
    }
  });
  const send = async (request: EngineRequest, signal: AbortSignal): Promise<unknown> => {
    if (request.engine !== 'redis') {
      throw new EngineError('A MongoDB request cannot be sent to Redis.');
    }
    try {
      const options = {
        typeMapping: bytesMapping,
        abortSignal: signal,
        ...(request.timeLimitMs === undefined ? {} : { timeout: request.timeLimitMs }),
      };
      const reply = await sendInDatabase(selected, request, (command) =>
        client.sendCommand(
          command.map((word) => Buffer.from(word)),
          options,
        ),
      );
      return toRedisReply(reply);
    } catch (error: unknown) {
      throw maskedError(error, secrets);
    }
  };
  return {
    send,
    close: async () => {
      closing = true;
      if (client.isOpen) {
        client.destroy();
      }
      await Promise.resolve();
    },
    onDrop: (listener) => {
      dropListeners.push(listener);
    },
  };
}

/** The Redis engine. */
export const redisEngine: Engine = {
  name: 'redis',
  open: async (settings: ClientSettings, signal: AbortSignal) => {
    const secrets = secretsOf(settings);
    try {
      signal.throwIfAborted();
      return await openDirectOrThrough(settings, signal, async (direct, servername) => {
        const address = redisAddress(direct.connectionString);
        const opening: Opening = { settings: direct, address, servername: servername ?? address.host };
        const client = await connectWith(opening, 3, signal).catch((error: unknown) => {
          if (isHelloUnknown(error)) {
            return connectWith(opening, 2, signal);
          }
          throw error;
        });
        return clientOf(client, secrets);
      });
    } catch (error: unknown) {
      throw maskedError(error, secrets);
    }
  },
};
