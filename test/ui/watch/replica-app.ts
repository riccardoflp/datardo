/**
 * What the UI tests of the document history and of Watch changes share: a single-node replica set seeded by the test
 * file (both read the oplog or a change stream, which a standalone does not have), with the same interface as the
 * standalone server of the collection tests, so that their helpers start Datardo on it.
 */
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import type { TestMongo } from '../query/collection-app';

/** A single-node replica set started by `start` with its seed and stopped by `stop`. */
export function testReplicaSet(): TestMongo {
  let server: MongoMemoryReplSet | undefined;
  const use = async <T>(action: (db: (name: string) => Db) => Promise<T>): Promise<T> => {
    const client = new MongoClient(server?.getUri() ?? '');
    await client.connect();
    try {
      return await action((name) => client.db(name));
    } finally {
      await client.close();
    }
  };
  return {
    uri: () => server?.getUri() ?? '',
    start: async (seed) => {
      const binary = process.env['MONGOMS_SYSTEM_BINARY'];
      server = await MongoMemoryReplSet.create({
        ...(binary === undefined || binary === '' ? {} : { binary: { systemBinary: binary } }),
        replSet: { count: 1, storageEngine: 'wiredTiger' },
      });
      await use(seed);
    },
    stop: async () => {
      await server?.stop();
    },
    use,
  };
}
