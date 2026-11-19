/**
 * A query on a server made slow stops after the time limit and says so (QA8, M9's exit criterion): `query.run` run by
 * the runner against a real MongoDB with `datardo.query.timeLimitSeconds` at 1, and a filter that makes the server
 * wait for every document.
 */
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEngines } from '../../../src/engines';
import { features } from '../../../src/features/query';
import { failureLine, type RunResult } from '../../../src/features/query/run';
import { emptyTexts } from '../../../src/features/query/types';
import { connectionId, featureId } from '../../../src/shared/ids';
import { start } from '../../../src/runner/start';
import { mongoConnection, stateWith } from '../../unit/connection/context';
import { harness } from '../../unit/runner/harness';
import { testServers } from '../servers';

const servers = testServers();
const id = connectionId('c-local');
const database = 'query_time_limit';
const connected = stateWith([mongoConnection({ id })], { [id]: 'connected' });
const state = {
  ...connected,
  settings: { ...connected.settings, stored: { 'datardo.query.timeLimitSeconds': 1 } },
};

describe('query.run stops at the time limit', () => {
  const engines = createEngines();
  const test = () => harness({ features, state, server: (request, aborted) => engines.send(request, aborted) });

  beforeAll(async () => {
    const client = new MongoClient(servers.mongoStandalone);
    try {
      const db = client.db(database);
      await db.dropDatabase();
      await db.collection('orders').insertMany(Array.from({ length: 10 }, (_, n) => ({ n })));
    } finally {
      await client.close();
    }
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: servers.mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
  });

  afterAll(async () => {
    await engines.disconnectAll();
  });

  it('a query the server makes wait stops after 1 second and says that the server took longer than 1 second', async () => {
    const run = test();
    const began = Date.now();
    const result = await start(run.ports, {
      feature: featureId('query.run'),
      target: { kind: 'collection', connection: id, database, collection: 'orders' },
      args: {
        connection: id,
        database,
        collection: 'orders',
        texts: { ...emptyTexts, filter: '{ $where: "sleep(500) || true" }' },
        page: 1,
        pageSize: 50,
      },
    });
    const took = Date.now() - began;
    expect(result.kind).toBe('read');
    const read = (result.kind === 'read' ? result.result : { documents: [] }) as RunResult;
    expect(read.documents).toEqual([]);
    expect(read.failure).toBeDefined();
    expect(failureLine({ message: read.failure ?? '' }, 1000).message).toBe('The server took longer than 1 seconds.');
    expect(took).toBeLessThan(4500);
    expect(run.state().runner.notifications).toEqual([]);
  });
});
