/**
 * The reads of the tree run by the runner against a real MongoDB (testing.md): a request that fails is given to
 * `parse` in place of its reply, so one database or one count that fails leaves the others shown, and no
 * notification is raised.
 */
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEngines } from '../../../src/engines';
import { features } from '../../../src/features/tree';
import { refreshArgs, type RefreshedRead } from '../../../src/features/tree/refresh';
import { freshIsland } from '../../../src/features/tree/types';
import { connectionId, featureId } from '../../../src/shared/ids';
import { start } from '../../../src/runner/start';
import { mongoConnection, stateWith } from '../../unit/connection/context';
import { harness } from '../../unit/runner/harness';
import { testServers } from '../servers';

const servers = testServers();
const id = connectionId('c-local');
const database = 'tree_runner';
const signal = (): AbortSignal => AbortSignal.timeout(30_000);
const state = stateWith([mongoConnection({ id })], { [id]: 'connected' });

describe('tree.refresh and tree.count through the runner on MongoDB', () => {
  const engines = createEngines();
  const test = () => harness({ features, state, server: (request, aborted) => engines.send(request, aborted) });

  beforeAll(async () => {
    const client = new MongoClient(servers.mongoStandalone);
    try {
      const db = client.db(database);
      await db.dropDatabase();
      await db.collection('orders').insertMany([{ n: 1 }, { n: 2 }, { n: 3 }]);
      await db.createCollection('active_orders', { viewOn: 'orders', pipeline: [] });
    } finally {
      await client.close();
    }
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: servers.mongoStandalone, connectTimeoutMs: 10_000 },
      signal(),
    );
  });

  afterAll(async () => {
    await engines.disconnectAll();
  });

  it('tree.refresh: a database that cannot be listed fails under its node, and the others are read', async () => {
    const island = { ...freshIsland, expanded: [`database:${database}`, 'database:no/such$database'] };
    const run = test();
    const result = await start(run.ports, {
      feature: featureId('tree.refresh'),
      target: { kind: 'connection', connection: id },
      args: refreshArgs(state, island, id, { kind: 'connection' }),
    });
    expect(result.kind).toBe('read');
    const reads = (result.kind === 'read' ? result.result : []) as readonly RefreshedRead[];
    expect(reads.map((each) => [each.read.read, each.result.kind])).toEqual([
      ['tree.list-databases', 'loaded'],
      ['tree.list-collections', 'loaded'],
      ['tree.list-collections', 'failed'],
    ]);
    expect(run.state().runner.notifications).toEqual([]);
  });

  it('tree.count: a count that fails leaves its collection without a count, and the others are counted', async () => {
    const run = test();
    // The empty name, which the driver refuses, stands for a count that fails between two that do not.
    const result = await start(run.ports, {
      feature: featureId('tree.count'),
      target: { kind: 'connection', connection: id },
      args: { connection: id, database, collections: ['orders', '', 'active_orders'] },
    });
    expect(result).toEqual({ kind: 'read', result: { orders: 3, active_orders: 3 } });
    expect(run.sent).toHaveLength(3);
    expect(run.state().runner.notifications).toEqual([]);
  });
});
