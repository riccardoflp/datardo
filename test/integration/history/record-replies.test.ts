/**
 * Records, from the throwaway replica set, the replies the document history and the Watch changes page read, into
 * `test/fixtures/replies/` named after the server version (testing.md): the oplog window (`history.oplog-window`),
 * the oplog entries of one document written in every way (`history.read-writes`), and the change events of a
 * collection that records pre-images (`watch.stream`). It runs only when `DATARDO_RECORD_REPLIES=1`. The reads go
 * through the engines with the features' own requests; the writes and the change stream through the driver, since
 * the engine cannot keep a stream open yet.
 */
import { BSON, MongoClient, ObjectId, type Document } from 'mongodb';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { oplogWindowRequests } from '../../../src/features/history/oplog-window';
import { windowRequest, type WindowArgs } from '../../../src/features/history/read-writes';
import type { Json } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const id = connectionId('record');
const database = 'history-record';

function canonical(value: unknown): Json {
  return (BSON.EJSON.serialize({ value }, { relaxed: false }) as { value: Json }).value;
}

async function save(name: string, value: unknown): Promise<void> {
  await writeFile(join(folder, `mongodb-8.2-${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

/** Writes one document in every way: insert, updates, a replacement, a transaction, a delete. */
async function writeDocument(client: MongoClient, documentId: ObjectId): Promise<void> {
  const orders = client.db(database).collection('orders');
  await orders.insertOne({
    _id: documentId,
    status: 'new',
    qty: new BSON.Int32(1),
    note: 'gift',
    items: [{ sku: 'a', qty: new BSON.Int32(1) }, { sku: 'b', qty: new BSON.Int32(2) }, { sku: 'c' }],
    total: BSON.Long.fromNumber(250),
  });
  await orders.updateOne({ _id: documentId }, { $set: { status: 'paid' }, $unset: { note: '' } });
  await orders.updateOne({ _id: documentId }, { $set: { 'items.1.qty': new BSON.Int32(5), 'address.city': 'Rome' } });
  await orders.updateOne({ _id: documentId }, [{ $set: { items: { $slice: ['$items', 2] } } }]);
  await orders.replaceOne({ _id: documentId }, { status: 'replaced', qty: new BSON.Double(1) });
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await orders.updateOne({ _id: documentId }, { $set: { status: 'shipped' } }, { session });
      await orders.insertOne({ _id: new ObjectId(), status: 'other' }, { session });
    });
  } finally {
    await session.endSession();
  }
  await orders.deleteOne({ _id: documentId });
}

async function send(
  engines: EngineService,
  request: Parameters<EngineService['send']>[0]['request'],
): Promise<unknown> {
  return engines.send({ connection: id, request }, AbortSignal.timeout(20_000));
}

async function recordHistory(engines: EngineService, client: MongoClient): Promise<void> {
  const documentId = new ObjectId('65f1c0de9a7b4e00012f3a2c');
  await client.db(database).dropDatabase();
  await client.db(database).createCollection('orders');
  await writeDocument(client, documentId);
  const place = { connection: id, database, collection: 'orders' };
  const [hello, infos, first, last] = await Promise.all(oplogWindowRequests(place).map((each) => send(engines, each)));
  await save('history-oplog-window', { hello, infos, first, last });
  const newest = (last as readonly { readonly ts: { readonly $timestamp: { readonly t: number } } }[])[0];
  const window: WindowArgs = {
    connection: id,
    database,
    collection: 'orders',
    id: canonical(documentId),
    from: (newest?.ts.$timestamp.t ?? 0) - 3600,
    to: { t: (newest?.ts.$timestamp.t ?? 0) + 1, i: 0 },
    span: 3600,
    oplogStart: 0,
    needed: 100,
    startedAt: 0,
    first: true,
  };
  await save('history-read-writes', await send(engines, windowRequest(window, 0)));
}

async function recordChangeEvents(client: MongoClient): Promise<void> {
  const db = client.db(database);
  await db.dropDatabase();
  await db.createCollection('orders', { changeStreamPreAndPostImages: { enabled: true } });
  const orders = db.collection<{ _id: unknown; [field: string]: unknown }>('orders');
  const stream = orders.watch([], { fullDocument: 'updateLookup', fullDocumentBeforeChange: 'whenAvailable' });
  const events: Document[] = [];
  const reading = (async () => {
    for await (const event of stream) {
      events.push(event);
      if (event.operationType === 'invalidate') {
        break;
      }
    }
  })();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await orders.insertOne({
    _id: new BSON.Int32(7),
    status: 'new',
    note: 'gift',
    when: new Date(Date.UTC(2026, 10, 18)),
  });
  await orders.updateOne(
    { _id: new BSON.Int32(7) },
    { $set: { status: 'paid', total: BSON.Long.fromNumber(5) }, $unset: { note: '' } },
  );
  await orders.replaceOne({ _id: new BSON.Int32(7) }, { status: 'replaced', tags: ['a', 'b'] });
  await orders.deleteOne({ _id: new BSON.Int32(7) });
  await orders.rename('orders_old');
  await reading;
  await stream.close();
  await save('watch-change-events', canonical(events));
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)(
    'records the oplog and the change events of a document on MongoDB',
    async () => {
      const url = testServers().mongoReplicaSet;
      const engines = createEngines();
      const client = new MongoClient(url, { promoteValues: false, promoteLongs: false });
      await engines.connect(
        id,
        { engine: 'mongodb', connectionString: url, connectTimeoutMs: 10_000 },
        AbortSignal.timeout(20_000),
      );
      try {
        await mkdir(folder, { recursive: true });
        await recordHistory(engines, client);
        await recordChangeEvents(client);
        await client.db(database).dropDatabase();
      } finally {
        await engines.disconnectAll();
        await client.close();
      }
      expect(recording).toBe(true);
    },
    60_000,
  );
});
