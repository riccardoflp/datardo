/**
 * The MongoDB engine (D8, D11): opens a `MongoClient` with the TLS settings of the connection, carries out requests
 * through it with values that keep their BSON types, and says when it finds no server any more.
 */
import { MongoClient, type MongoClientOptions, type TopologyDescriptionChangedEvent } from 'mongodb';
import type { EngineRequest } from '../../shared/engine-request';
import { EngineError, type ClientSettings, type ClientTls, type Engine, type EngineClient } from '../engine';
import { maskedError, secretsOf } from '../transport/mask';
import { openDirectOrThrough } from '../transport/tunnel';
import { callMethod, toExtendedJson } from './methods';

/** The name the server sees for Datardo's clients (connection.connect). */
export const appName = 'datardo';

/** MongoDB's TLS options: `tls: true` plus each file and exception that is set (connection.connect). */
export function mongoTlsOptions(tls: ClientTls | undefined): MongoClientOptions {
  if (tls === undefined) {
    return {};
  }
  return {
    tls: true,
    ...(tls.caFile === undefined ? {} : { tlsCAFile: tls.caFile }),
    ...(tls.certificateKeyFile === undefined ? {} : { tlsCertificateKeyFile: tls.certificateKeyFile }),
    ...(tls.certificateKeyFilePassword === undefined || tls.certificateKeyFilePassword === ''
      ? {}
      : { tlsCertificateKeyFilePassword: tls.certificateKeyFilePassword }),
    ...(tls.allowInvalidCertificates === true ? { tlsAllowInvalidCertificates: true } : {}),
    ...(tls.allowInvalidHostnames === true ? { tlsAllowInvalidHostnames: true } : {}),
  };
}

/** The options of the client: its name, the time to find a server, values read without promoting them, TLS. */
export function clientOptions(settings: ClientSettings): MongoClientOptions {
  return {
    appName,
    serverSelectionTimeoutMS: settings.connectTimeoutMs,
    connectTimeoutMS: settings.connectTimeoutMs,
    promoteValues: false,
    promoteLongs: false,
    promoteBuffers: false,
    bsonRegExp: true,
    ...mongoTlsOptions(settings.tls),
  };
}

function hasNoServer(event: TopologyDescriptionChangedEvent): boolean {
  const known = (description: TopologyDescriptionChangedEvent['newDescription']): boolean =>
    [...description.servers.values()].some((server) => server.type !== 'Unknown');
  return known(event.previousDescription) && !known(event.newDescription);
}

function clientOf(client: MongoClient, secrets: readonly string[]): EngineClient {
  const dropListeners: ((reason: string) => void)[] = [];
  let dropped = false;
  client.on('topologyDescriptionChanged', (event) => {
    if (!dropped && hasNoServer(event)) {
      dropped = true;
      for (const listener of dropListeners.splice(0)) {
        listener('No server of the deployment answers.');
      }
    }
  });
  return {
    send: async (request: EngineRequest, signal: AbortSignal) => {
      if (request.engine !== 'mongodb') {
        throw new EngineError('A Redis command cannot be sent to MongoDB.');
      }
      try {
        return toExtendedJson(await callMethod(client.db(request.database), request, signal));
      } catch (error: unknown) {
        throw maskedError(error, secrets);
      }
    },
    close: async () => {
      dropped = true;
      await client.close();
    },
    onDrop: (listener) => {
      dropListeners.push(listener);
    },
  };
}

async function connectAbortably(client: MongoClient, signal: AbortSignal): Promise<void> {
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => {
      reject(new EngineError('Cancelled.'));
    });
  });
  try {
    await Promise.race([client.connect(), aborted]);
  } catch (error: unknown) {
    await client.close();
    throw error;
  }
}

/** The MongoDB engine. */
export const mongoEngine: Engine = {
  name: 'mongodb',
  open: async (settings: ClientSettings, signal: AbortSignal) => {
    const secrets = secretsOf(settings);
    try {
      return await openDirectOrThrough(settings, signal, async (direct, servername) => {
        const options = { ...clientOptions(direct), ...(servername === undefined ? {} : { servername }) };
        const client = new MongoClient(direct.connectionString, options);
        await connectAbortably(client, signal);
        return clientOf(client, secrets);
      });
    } catch (error: unknown) {
      throw maskedError(error, secrets);
    }
  },
};
