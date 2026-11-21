/**
 * A sharded cluster of the UI tests of the Sharding section, with the interface of the standalone server of the
 * collection tests: the config server, the shards `shard01` and `shard02` and the mongos that
 * `test/integration/monitor/own-deployments.ts` starts on free ports, stopped by `stop`. `use` talks to the mongos.
 */
import { MongoClient, type Db } from 'mongodb';
import { ownCluster } from '../../integration/monitor/own-deployments';
import type { OwnDeployment } from '../../integration/monitor/own-server';
import type { TestMongo } from '../query/collection-app';

export { mongosBinary } from '../../integration/monitor/own-deployments';

/** A sharded cluster started by `start` with its seed and stopped by `stop`. */
export function testCluster(): TestMongo {
  let cluster: OwnDeployment | undefined;
  const use = async <T>(action: (db: (name: string) => Db) => Promise<T>): Promise<T> => {
    const client = new MongoClient(cluster?.uri ?? '');
    await client.connect();
    try {
      return await action((name) => client.db(name));
    } finally {
      await client.close();
    }
  };
  return {
    uri: () => cluster?.uri ?? '',
    start: async (seed) => {
      cluster = await ownCluster();
      await use(seed);
    },
    stop: async () => {
      await cluster?.stop();
    },
    use,
  };
}
