/**
 * The clients that send the events of redis-oplog (`oplog.publish`): one per MongoDB connection that publishes, to its
 * linked Redis connection, named `datardo` (`CLIENT SETNAME`, its refusal ignored). Each pipeline waits at most 5
 * seconds. A client that failed is closed and opened again for the next write; one whose MongoDB connection is
 * removed, unlinked or linked elsewhere is closed, and so are all of them at quit.
 */
import type { EngineClient } from '../engines';
import { oplogText } from '../features/oplog/text';
import { redisCommand, type RedisRequest } from '../shared/engine-request';
import type { ConnectionId } from '../shared/ids';
import { savedConnection } from '../shared/state/connections';
import type { OplogClients } from '../runner/ports';
import { clientSettings, connectionEngines, findConnection, fullConnectionString } from './connections';
import type { MainServices } from './services';

/** How long a pipeline of events may take, in milliseconds (oplog.publish-error). */
export const publishTimeoutMs = 5000;

interface Opened {
  readonly linked: ConnectionId;
  readonly client: Promise<EngineClient>;
}

const opened = new Map<ConnectionId, Opened>();

function close(mongo: ConnectionId): void {
  const gone = opened.get(mongo);
  opened.delete(mongo);
  void gone?.client.then(
    (client) => client.close(),
    () => undefined,
  );
}

async function open(linked: ConnectionId): Promise<EngineClient> {
  const connection = findConnection(linked);
  const settings = connection === undefined ? undefined : clientSettings(connection, publishTimeoutMs, 'task');
  if (settings === undefined) {
    throw new Error(oplogText.missingLink);
  }
  const client = await connectionEngines().open(settings, AbortSignal.timeout(publishTimeoutMs));
  try {
    await client.send(redisCommand(0, 'CLIENT', 'SETNAME', 'datardo'), AbortSignal.timeout(publishTimeoutMs));
  } catch {
    // A server that refuses CLIENT SETNAME still takes the events: the name only helps who reads CLIENT LIST.
  }
  return client;
}

function clientFor(mongo: ConnectionId, linked: ConnectionId): Promise<EngineClient> {
  const known = opened.get(mongo);
  if (known?.linked === linked) {
    return known.client;
  }
  close(mongo);
  const client = open(linked);
  opened.set(mongo, { linked, client });
  return client;
}

/** `host:port` of the linked connection, as the warning names it. */
function hostAndPort(linked: ConnectionId): { readonly host: string; readonly port: number } {
  const hosts = findConnection(linked)?.hosts ?? '';
  const [host = hosts, port = '6379'] = hosts.split(',')[0]?.split(':') ?? [];
  return { host, port: Number(port) || 6379 };
}

async function sendAll(client: EngineClient, requests: readonly RedisRequest[], linked: ConnectionId): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const { host, port } = hostAndPort(linked);
      reject(new Error(oplogText.noAnswer(host, port)));
    }, publishTimeoutMs);
  });
  try {
    await Promise.race([Promise.all(requests.map((request) => client.send(request, controller.signal))), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** The secrets of the linked connection, taken out of an error before it is shown. */
function secretsOf(linked: ConnectionId): readonly string[] {
  const connectionString = fullConnectionString(linked);
  if (connectionString === undefined) {
    return [];
  }
  try {
    const password = decodeURIComponent(new URL(connectionString).password);
    return password === '' ? [connectionString] : [connectionString, password];
  } catch {
    // A connection string that is no URL is still taken out whole.
    return [connectionString];
  }
}

/** The clients of redis-oplog, as the runner's ports give them. */
export const oplogClients: OplogClients = {
  send: async (mongo, linked, requests) => {
    try {
      await sendAll(await clientFor(mongo, linked), requests, linked);
    } catch (error: unknown) {
      close(mongo);
      throw error;
    }
  },
  secrets: secretsOf,
};

/** Closes the clients whose MongoDB connection no longer publishes to the same Redis connection, and all at quit. */
export function start(services: MainServices): Promise<void> {
  services.state.listen((event, now) => {
    if (event.slice !== 'connections') {
      return;
    }
    for (const [mongo, each] of [...opened]) {
      const connection = savedConnection(now.connections, mongo);
      if (connection?.publishesTo !== each.linked) {
        close(mongo);
      }
    }
    if (event.type === 'removed' && now.oplog.lastErrors[event.connection] !== undefined) {
      services.state.dispatch({ slice: 'oplog', type: 'forgotten', connection: event.connection });
    }
  });
  services.onQuit(() => {
    for (const mongo of [...opened.keys()]) {
      close(mongo);
    }
    return Promise.resolve();
  });
  return Promise.resolve();
}
