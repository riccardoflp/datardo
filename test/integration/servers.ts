/**
 * The throwaway servers of the integration tests (testing.md, "Throwaway servers"). The global setup starts them once
 * and passes their addresses to the tests through the environment; a test reads them with {@link testServers}.
 */
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server-core';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createClient } from 'redis';

/** The addresses the tests use. `redis` is undefined when no Redis server could be found. */
export interface TestServers {
  readonly mongoStandalone: string;
  readonly mongoReplicaSet: string;
  readonly redis: string | undefined;
  /** The Redis databases a test may empty: 14 and 15 of a shared server, every database of a throwaway one. */
  readonly redisDatabases: readonly number[];
}

/** What the global setup started, so that it can stop it. */
export interface StartedServers {
  readonly servers: TestServers;
  readonly stop: () => Promise<void>;
}

/** The databases of a Redis server given by `DATARDO_TEST_REDIS_URL`, which may hold other data. */
const sharedRedisDatabases = [14, 15];

async function freePort(): Promise<number> {
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

async function redisAnswers(url: string): Promise<boolean> {
  const client = createClient({ url, socket: { connectTimeout: 2000, reconnectStrategy: false } });
  client.on('error', () => {
    // The error is the answer: this server cannot be used, and redisAnswers says so.
  });
  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    if (client.isOpen) {
      client.destroy();
    }
  }
}

async function startRedisBinary(binary: string): Promise<{ url: string; process: ChildProcess }> {
  const port = await freePort();
  const child = spawn(binary, ['--port', String(port), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  const url = `redis://127.0.0.1:${String(port)}`;
  let failed: Error | undefined;
  child.on('error', (error) => {
    failed = error;
  });
  for (let attempt = 0; attempt < 50 && failed === undefined; attempt += 1) {
    if (await redisAnswers(url)) {
      return { url, process: child };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`redis-server at ${binary} did not answer${failed === undefined ? '' : `: ${failed.message}`}.`);
}

async function findRedis(): Promise<{ url: string | undefined; databases: number[]; stop: () => void }> {
  const shared = process.env['DATARDO_TEST_REDIS_URL'];
  if (shared !== undefined && shared !== '') {
    return { url: shared, databases: sharedRedisDatabases, stop: () => undefined };
  }
  const binary = process.env['DATARDO_TEST_REDIS_BINARY'] ?? 'redis-server';
  try {
    const started = await startRedisBinary(binary);
    return {
      url: started.url,
      databases: Array.from({ length: 16 }, (_, index) => index),
      stop: () => {
        started.process.kill();
      },
    };
  } catch {
    return { url: undefined, databases: [], stop: () => undefined };
  }
}

/** Starts a standalone mongod, a single-node replica set, and finds or starts a Redis server. */
export async function startServers(): Promise<StartedServers> {
  const binary = process.env['MONGOMS_SYSTEM_BINARY'];
  const options = binary !== undefined && binary !== '' ? { binary: { systemBinary: binary } } : {};
  const standalone = await MongoMemoryServer.create(options);
  const replicaSet = await MongoMemoryReplSet.create({
    ...options,
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const redis = await findRedis();
  return {
    servers: {
      mongoStandalone: standalone.getUri(),
      mongoReplicaSet: replicaSet.getUri(),
      redis: redis.url,
      redisDatabases: redis.databases,
    },
    stop: async () => {
      redis.stop();
      await replicaSet.stop();
      await standalone.stop();
    },
  };
}

/** The servers the global setup started, as a test sees them. */
export function testServers(): TestServers {
  const value = process.env['DATARDO_TEST_SERVERS'];
  if (value === undefined) {
    throw new Error('The integration tests run through their global setup: npm run test:integration.');
  }
  return JSON.parse(value) as TestServers;
}
