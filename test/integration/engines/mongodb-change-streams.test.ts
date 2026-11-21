/**
 * Change streams through the MongoDB engine against a real replica set (testing.md): `watch` reads what came and
 * closes its stream before it replies, from a resume token, on a collection, a database or the deployment, up to its
 * limit and its time limit, and ends at an `invalidate`; a stream kept by the client gives its change events a batch
 * at a time until it is closed; a standalone server refuses with its own code.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Json } from '../../../src/shared/engine-request';
import { testServers } from '../servers';
import { int, testClient, type TestClient } from './client';

const servers = testServers();
const database = 'engine_changes';
let client: TestClient;

type Changes = { readonly events: readonly Record<string, unknown>[]; readonly resumeToken: Json };

const typed = {
  _id: int(1),
  int: int(7),
  long: { $numberLong: '9007199254740993' },
  decimal: { $numberDecimal: '1.50' },
};

beforeAll(async () => {
  client = await testClient(servers.mongoReplicaSet, database);
  await client.send({ method: 'dropDatabase', arguments: [] });
  await client.send({ method: 'createCollection', arguments: ['orders'] });
});

afterAll(async () => {
  await client.send({ method: 'dropDatabase', arguments: [] });
  await client.close();
});

/** The resume token of now, from a `watch` that waits for nothing. */
async function now(collection?: string): Promise<Json> {
  const reply = (await client.send({
    ...(collection === undefined ? {} : { collection }),
    method: 'watch',
    arguments: [[], {}],
    timeLimitMs: 0,
  })) as Changes;
  expect(reply.events).toEqual([]);
  return reply.resumeToken;
}

/** The change streams open on the server for this database's collections. */
async function openStreams(): Promise<number> {
  const listed = (await client.send({
    database: 'admin',
    method: 'aggregate',
    arguments: [
      [{ $currentOp: { idleCursors: true } }, { $match: { 'cursor.originatingCommand.aggregate': 'orders' } }],
    ],
  })) as unknown[];
  return listed.length;
}

describe('the MongoDB engine: watch', () => {
  it('gives the change events after a resume token, their types kept, and closes its stream', async () => {
    const token = await now('orders');
    expect(typeof (token as Record<string, unknown>)['_data']).toBe('string');
    await client.send({ collection: 'orders', method: 'insertOne', arguments: [typed] });
    await client.send({
      collection: 'orders',
      method: 'updateOne',
      arguments: [{ _id: int(1) }, { $inc: { int: int(1) } }],
    });
    const reply = (await client.send({
      collection: 'orders',
      method: 'watch',
      arguments: [[], { resumeAfter: token, fullDocument: 'updateLookup' }],
      limit: 5,
      timeLimitMs: 2000,
    })) as Changes;
    expect(reply.events.map((each) => each['operationType'])).toEqual(['insert', 'update']);
    expect(reply.events[0]?.['fullDocument']).toEqual(typed);
    expect(reply.events[1]?.['fullDocument']).toEqual({ ...typed, int: int(8) });
    expect(typeof (reply.resumeToken as Record<string, unknown>)['_data']).toBe('string');
    expect(await openStreams()).toBe(0);
  });

  it('stops at its limit, and goes on from the resume token it gave', async () => {
    const token = await now('orders');
    await client.send({
      collection: 'orders',
      method: 'insertMany',
      arguments: [[2, 3, 4].map((n) => ({ _id: int(n) }))],
    });
    const first = (await client.send({
      collection: 'orders',
      method: 'watch',
      arguments: [[{ $match: { operationType: 'insert' } }], { resumeAfter: token }],
      limit: 2,
    })) as Changes;
    expect(first.events.map((each) => (each['documentKey'] as Record<string, unknown>)['_id'])).toEqual([
      int(2),
      int(3),
    ]);
    const rest = (await client.send({
      collection: 'orders',
      method: 'watch',
      arguments: [[], { resumeAfter: first.resumeToken }],
      timeLimitMs: 500,
    })) as Changes;
    expect(rest.events.map((each) => (each['documentKey'] as Record<string, unknown>)['_id'])).toEqual([int(4)]);
  });

  it('with nothing to read, replies empty once its time limit passed', async () => {
    const started = Date.now();
    const reply = (await client.send({
      collection: 'orders',
      method: 'watch',
      arguments: [[], {}],
      timeLimitMs: 800,
    })) as Changes;
    expect(reply.events).toEqual([]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(700);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('on a database, and on the whole deployment', async () => {
    const onDatabase = await now();
    // Only this database's change events: another test file may write elsewhere at the same time, and a token of one
    // of its change events is not found again by the stream filtered below.
    const token = (await client.send({
      database: 'admin',
      method: 'watch',
      arguments: [[{ $match: { 'ns.db': database } }], {}],
      timeLimitMs: 0,
    })) as Changes;
    await client.send({ collection: 'other', method: 'insertOne', arguments: [{ _id: int(9) }] });
    const database_ = (await client.send({
      method: 'watch',
      arguments: [[], { resumeAfter: onDatabase }],
      limit: 1,
    })) as Changes;
    expect(database_.events[0]?.['ns']).toEqual({ db: database, coll: 'other' });
    const deployment = (await client.send({
      database: 'admin',
      method: 'watch',
      arguments: [[{ $match: { 'ns.db': database } }], { resumeAfter: token.resumeToken }],
      limit: 1,
    })) as Changes;
    expect(deployment.events[0]?.['ns']).toEqual({ db: database, coll: 'other' });
    const cluster = (await client.send({
      method: 'watch',
      arguments: [[{ $match: { 'ns.db': database } }], { resumeAfter: token.resumeToken, allChangesForCluster: true }],
      limit: 1,
    })) as Changes;
    expect(cluster.events).toEqual(deployment.events);
  });

  it('ends at the invalidate of a collection dropped', async () => {
    await client.send({ collection: 'dropped', method: 'insertOne', arguments: [{}] });
    const token = await now('dropped');
    await client.send({ collection: 'dropped', method: 'drop', arguments: [] });
    const reply = (await client.send({
      collection: 'dropped',
      method: 'watch',
      arguments: [[], { resumeAfter: token }],
      limit: 10,
      timeLimitMs: 5000,
    })) as Changes;
    expect(reply.events.map((each) => each['operationType'])).toEqual(['drop', 'invalidate']);
  });
});

describe('the MongoDB engine: a change stream kept', () => {
  it('gives its change events a batch at a time until it is closed', async () => {
    const opened = (await client.send({
      collection: 'orders',
      method: 'openChangeStream',
      arguments: [[], { maxAwaitTimeMS: int(300) }],
    })) as Record<string, unknown>;
    const cursor = String(opened['cursor']);
    expect(cursor).toMatch(/^change-stream-\d+$/);
    const first = (await client.send({ method: 'changeStreamNext', arguments: [cursor] })) as Changes;
    expect(first.events).toEqual([]);
    await client.send({ collection: 'orders', method: 'insertOne', arguments: [{ _id: int(20), n: int(1) }] });
    await client.send({ collection: 'orders', method: 'insertOne', arguments: [{ _id: int(21), n: int(2) }] });
    const events: Record<string, unknown>[] = [];
    for (let attempt = 0; attempt < 10 && events.length < 2; attempt += 1) {
      events.push(...((await client.send({ method: 'changeStreamNext', arguments: [cursor, 10] })) as Changes).events);
    }
    expect(events.map((each) => each['fullDocument'])).toEqual([
      { _id: int(20), n: int(1) },
      { _id: int(21), n: int(2) },
    ]);
    expect(await openStreams()).toBe(1);
    expect(await client.send({ method: 'closeCursor', arguments: [cursor] })).toEqual({ closed: true });
    expect(await openStreams()).toBe(0);
    expect(await client.send({ method: 'closeCursor', arguments: [cursor] })).toEqual({ closed: false });
    const error = await client.failure({ method: 'changeStreamNext', arguments: [cursor] });
    expect(error?.message).toBe(`No change stream ${cursor} is open: it was closed, or never opened.`);
  });
});

describe('the MongoDB engine: change streams on a standalone server', () => {
  it('fail with the code and the message of the server', async () => {
    const standalone = await testClient(servers.mongoStandalone, database);
    try {
      const error = await standalone.failure({ collection: 'orders', method: 'watch', arguments: [[], {}] });
      expect(error?.['code']).toBe(40573);
      expect(error?.message).toMatch(/only supported on replica sets/);
    } finally {
      await standalone.close();
    }
  });
});
