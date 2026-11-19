/**
 * Cursors and sessions kept by the MongoDB engine against real servers (testing.md): a cursor shaped as mongosh
 * shapes it and read a batch at a time; a transaction that another client sees only once committed, one aborted, one
 * left open when its session ends; the error labels of a write conflict; transactions refused by a standalone
 * server; and a password that never shows in an error.
 */
import { randomBytes } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testServers } from '../servers';
import { int, testClient, type TestClient } from './client';

const servers = testServers();
const database = 'engine_sessions';
let client: TestClient;

beforeAll(async () => {
  client = await testClient(servers.mongoReplicaSet, database);
  await client.send({ method: 'dropDatabase', arguments: [] });
  await client.send({
    collection: 'orders',
    method: 'insertMany',
    arguments: [[1, 2, 3, 4, 5].map((n) => ({ _id: int(n), total: { $numberDecimal: `${String(n)}.50` } }))],
  });
});

afterAll(async () => {
  await client.send({ method: 'dropDatabase', arguments: [] });
  await client.close();
});

type Read = { readonly documents: readonly unknown[]; readonly exhausted: boolean };

async function opened(of: string, args: unknown[], shape: unknown[] = []): Promise<string> {
  const reply = (await client.send({
    collection: 'orders',
    method: 'openCursor',
    arguments: [of, args, shape] as never,
  })) as Record<string, string>;
  return reply['cursor'] ?? '';
}

describe('the MongoDB engine: cursors kept', () => {
  it('a find shaped by sort, skip, limit and project, read a batch at a time', async () => {
    const shape = [
      { method: 'sort', arguments: [{ _id: int(-1) }] },
      { method: 'skip', arguments: [int(1)] },
      { method: 'limit', arguments: [int(3)] },
      { method: 'project', arguments: [{ total: int(1) }] },
      { method: 'pretty', arguments: [] },
    ];
    const cursor = await opened('find', [{}, {}], shape);
    expect(cursor).toMatch(/^cursor-\d+$/);
    const first = (await client.send({ method: 'cursorNext', arguments: [cursor, 2] })) as Read;
    expect(first).toEqual({
      documents: [
        { _id: int(4), total: { $numberDecimal: '4.50' } },
        { _id: int(3), total: { $numberDecimal: '3.50' } },
      ],
      exhausted: false,
    });
    expect(await client.send({ method: 'cursorHasNext', arguments: [cursor] })).toEqual({ hasNext: true });
    const rest = (await client.send({ method: 'cursorNext', arguments: [cursor, 10] })) as Read;
    expect(rest).toEqual({ documents: [{ _id: int(2), total: { $numberDecimal: '2.50' } }], exhausted: true });
    expect(await client.send({ method: 'cursorHasNext', arguments: [cursor] })).toEqual({ hasNext: false });
    expect(await client.send({ method: 'closeCursor', arguments: [cursor] })).toEqual({ closed: true });
    const error = await client.failure({ method: 'cursorNext', arguments: [cursor, 1] });
    expect(error?.message).toBe(`No cursor ${cursor} is open: it was closed, or never opened.`);
  });

  it('an aggregation, its explain, and a shape it does not have', async () => {
    const cursor = await opened(
      'aggregate',
      [[{ $match: { _id: { $gte: int(4) } } }], {}],
      [{ method: 'sort', arguments: [{ _id: int(1) }] }],
    );
    const explain = (await client.send({ method: 'cursorExplain', arguments: [cursor] })) as Record<string, unknown>;
    expect(JSON.stringify(explain)).toContain('queryPlanner');
    const read = (await client.send({ method: 'cursorNext', arguments: [cursor, 10] })) as Read;
    expect(read.documents).toHaveLength(2);
    await client.send({ method: 'closeCursor', arguments: [cursor] });
    const error = await client.failure({
      collection: 'orders',
      method: 'openCursor',
      arguments: ['aggregate', [[], {}], [{ method: 'hint', arguments: [{ _id: int(1) }] }]],
    });
    expect(error?.message).toBe('cursor.hint() is not available on this cursor');
  });
});

async function count(): Promise<unknown> {
  return client.send({ collection: 'orders', method: 'countDocuments', arguments: [{ _id: { $gte: int(10) } }] });
}

async function started(): Promise<string> {
  const reply = (await client.send({ method: 'startSession', arguments: [{}] })) as Record<string, unknown>;
  expect(reply['id']).toMatchObject({ id: { $binary: { subType: '04' } } });
  return String(reply['session']);
}

describe('the MongoDB engine: sessions and transactions', () => {
  it('a transaction is seen only once committed; an aborted one leaves nothing', async () => {
    const session = await started();
    await client.send({ method: 'startTransaction', arguments: [session, { writeConcern: { w: 'majority' } }] });
    await client.send({ collection: 'orders', method: 'insertOne', arguments: [{ _id: int(10) }], session });
    await client.send({ collection: 'orders', method: 'insertOne', arguments: [{ _id: int(11) }], session });
    expect(await count()).toEqual(int(0));
    const inside = await client.send({
      collection: 'orders',
      method: 'countDocuments',
      arguments: [{ _id: { $gte: int(10) } }],
      session,
    });
    expect(inside).toEqual(int(2));
    const info = (await client.send({ method: 'sessionInfo', arguments: [session] })) as Record<string, unknown>;
    expect(info).toMatchObject({ inTransaction: true, hasEnded: false });
    expect(await client.send({ method: 'commitTransaction', arguments: [session] })).toEqual({ ok: int(1) });
    expect(await count()).toEqual(int(2));
    await client.send({ method: 'startTransaction', arguments: [session] });
    await client.send({ collection: 'orders', method: 'deleteMany', arguments: [{ _id: { $gte: int(10) } }], session });
    expect(await client.send({ method: 'abortTransaction', arguments: [session] })).toEqual({ ok: int(1) });
    expect(await count()).toEqual(int(2));
    expect(await client.send({ method: 'endSession', arguments: [session] })).toEqual({ ok: int(1) });
    const error = await client.failure({ collection: 'orders', method: 'findOne', arguments: [{}], session });
    expect(error?.message).toBe(`No session ${session} is open: it was closed, or never opened.`);
  });

  it('a session ended with its transaction open aborts it', async () => {
    const session = await started();
    await client.send({ method: 'startTransaction', arguments: [session] });
    await client.send({ collection: 'orders', method: 'insertOne', arguments: [{ _id: int(12) }], session });
    await client.send({ method: 'endSession', arguments: [session] });
    expect(await client.send({ collection: 'orders', method: 'findOne', arguments: [{ _id: int(12) }] })).toBeNull();
  });

  it('a write conflict fails with the label TransientTransactionError', async () => {
    const [one, two] = [await started(), await started()];
    for (const session of [one, two]) {
      await client.send({ method: 'startTransaction', arguments: [session] });
    }
    const write = (session: string) => ({
      collection: 'orders',
      method: 'updateOne',
      arguments: [{ _id: int(1) }, { $set: { by: session } }],
      session,
    });
    await client.send(write(one));
    const error = await client.failure(write(two));
    expect(error?.['codeName']).toBe('WriteConflict');
    expect(error?.['labels']).toContain('TransientTransactionError');
    await client.send({ method: 'endSession', arguments: [one] });
    await client.send({ method: 'endSession', arguments: [two] });
  });

  it('a standalone server refuses a transaction with its own message', async () => {
    const standalone = await testClient(servers.mongoStandalone, database);
    try {
      const reply = (await standalone.send({ method: 'startSession', arguments: [{}] })) as Record<string, unknown>;
      const session = String(reply['session']);
      await standalone.send({ method: 'startTransaction', arguments: [session] });
      const error = await standalone.failure({ collection: 'orders', method: 'insertOne', arguments: [{}], session });
      expect(error?.message).toMatch(/Transaction numbers are only allowed on a replica set member or mongos/);
    } finally {
      await standalone.close();
    }
  });
});

describe('the MongoDB engine: errors and secrets', () => {
  it('a failed method gives the server reason, and never the password', async () => {
    const password = randomBytes(12).toString('hex');
    const binary = process.env['MONGOMS_SYSTEM_BINARY'];
    const server = await MongoMemoryServer.create({
      auth: { enable: true, customRootName: 'datardo', customRootPwd: password },
      ...(binary === undefined || binary === '' ? {} : { binary: { systemBinary: binary } }),
    });
    const host = /\/\/(?:[^@/]*@)?([^/?]+)/.exec(server.getUri())?.[1] ?? '';
    const authorized = await testClient(`mongodb://datardo:${password}@${host}/?authSource=admin`, database);
    try {
      for (const asked of [
        { collection: 'orders', method: 'dropIndex', arguments: ['nope'] },
        { collection: 'orders', method: 'renameCollection', arguments: [''] },
        { method: 'changeStreamNext', arguments: ['change-stream-1'] },
        { collection: 'orders', method: 'watch', arguments: [[], {}] },
      ]) {
        const error = await authorized.failure(asked);
        expect(error?.message, asked.method).toMatch(/\w/);
        expect(error?.message, asked.method).not.toContain(password);
        expect(error?.stack ?? '', asked.method).not.toContain(password);
      }
    } finally {
      await authorized.close();
      await server.stop();
    }
  });
});
