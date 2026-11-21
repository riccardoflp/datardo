/**
 * A single-node replica set of one test file, for the tests of the document history and of Watch changes: they write
 * many documents and drop databases while change streams are open, and the other test files, run at the same time on
 * the replica set of the global setup, follow the whole deployment's change events and open change streams of their
 * own, which these writes and streams would disturb. The connection *Local* of the live runner is moved to it.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import type { EngineService } from '../../../src/engines';
import { localId } from '../undo/live';

/** A replica set of its own, and how to stop it. */
export interface OwnReplicaSet {
  readonly uri: string;
  readonly stop: () => Promise<void>;
}

/** Starts a replica set for the test file and connects *Local* to it instead of the shared one. */
export async function ownReplicaSet(engines: EngineService): Promise<OwnReplicaSet> {
  const binary = process.env['MONGOMS_SYSTEM_BINARY'];
  const server = await MongoMemoryReplSet.create({
    ...(binary === undefined || binary === '' ? {} : { binary: { systemBinary: binary } }),
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const uri = server.getUri();
  await engines.disconnect(localId);
  await engines.connect(
    localId,
    { engine: 'mongodb', connectionString: uri, connectTimeoutMs: 10_000 },
    AbortSignal.timeout(30_000),
  );
  return {
    uri,
    stop: async () => {
      await server.stop();
    },
  };
}
