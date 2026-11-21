/**
 * The document history against the throwaway servers (M27's exit criteria): the read the page makes through the main
 * process (`history.read`: `history.oplog-window`, the windows of `history.read-writes`, `document.read` and the undo
 * history for `history.own-writes`), the versions it rebuilds (`history.versions`), and restoring one
 * (`document.restore-version`), which is recorded in the undo history. Every other value is written through the
 * engine, as another client would.
 */
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { HistoryRead } from '../../../src/features/history/read-writes';
import { readHistory } from '../../../src/main/history-reads';
import { ownWrites } from '../../../src/features/history/own-writes';
import { view as showView } from '../../../src/features/history/show';
import { documentHistory } from '../../../src/features/history/versions';
import type { DocumentWrite } from '../../../src/features/history/types';
import type { AppAction } from '../../../src/runner/ports';
import type { Json } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import type { Target } from '../../../src/shared/target';
import { testServers } from '../servers';
import { ownReplicaSet, type OwnReplicaSet } from '../watch/own-replica-set';
import { live, localId, type Live } from '../undo/live';

const database = 'history_it';
const collection = 'orders';
const target: Target = { kind: 'collection', connection: localId, database, collection };
const where = { connection: localId, database, collection };
const soloId = connectionId('c-solo');
let runner: Live;
let replicaSet: OwnReplicaSet;

async function send(method: string, args: readonly Json[], more: Record<string, Json> = {}): Promise<unknown> {
  return runner.engines.send(
    { connection: localId, request: { engine: 'mongodb', database, collection, method, arguments: args, ...more } },
    AbortSignal.timeout(60_000),
  );
}

function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** One read of the page, as `history.read-writes` starts it from the page. */
async function readPage(id: Json, readBackTo?: { t: number; i: number }): Promise<HistoryRead> {
  const result = await runner.start('history.read-writes', target, {
    ...where,
    id,
    ...(readBackTo === undefined ? {} : { readBackTo }),
  });
  if (result.kind !== 'read') {
    throw new Error(`The read did not answer: ${JSON.stringify(result)}`);
  }
  return result.result as HistoryRead;
}

function readOf(read: HistoryRead): Extract<HistoryRead, { kind: 'read' }> {
  if (read.kind !== 'read') {
    throw new Error(`The read was ${read.kind}: ${read.message}`);
  }
  return read;
}

beforeAll(async () => {
  runner = await live();
  replicaSet = await ownReplicaSet(runner.engines);
  const action: AppAction = (args, signal) =>
    readHistory(
      {
        engines: () => runner.engines,
        state: runner.ports.state,
        dataFolder: runner.folder,
        now: Date.now,
        platform: 'windows',
      },
      args,
      signal,
    );
  (runner.ports.appActions as Map<string, AppAction>).set('history.read', action);
  await runner.engines.connect(
    soloId,
    { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
    AbortSignal.timeout(30_000),
  );
  Object.assign(runner.ports.dialogs, { confirm: () => Promise.resolve(true) });
});

afterAll(async () => {
  await send('drop', []).catch(() => undefined);
  await runner.close();
  await replicaSet.stop();
});

beforeEach(async () => {
  await send('deleteMany', [{}]);
});

describe('history.show', () => {
  it('lists the writes of a document inserted and updated twice, newest first, the newest current and selected', async () => {
    await send('insertMany', [[{ _id: int(1), status: 'new', note: 'gift' }]]);
    await send('updateOne', [{ _id: int(1) }, { $set: { status: 'paid' }, $unset: { note: '' } }]);
    await send('updateOne', [{ _id: int(1) }, { $set: { qty: int(2) } }]);
    const read = readOf(await readPage(int(1)));
    const history = documentHistory(read.writes, read.current ?? undefined);
    const page = showView({
      connectionName: 'Local',
      readOnly: false,
      database,
      collection,
      idText: '1',
      offsetMinutes: 0,
      status: { kind: 'loaded' },
      oplog: read.oplog,
      read: { stop: read.stop, writes: read.writes.length, durationMs: read.durationMs },
      history,
      exists: read.current !== null,
      own: {},
    });
    const rows = page.body.kind === 'list' ? page.body.rows : [];
    expect(rows.map((row) => row.write)).toEqual(['Update', 'Update', 'Insert']);
    expect(rows[0]?.version?.text).toBe('current');
    expect(rows[0]?.selected).toBe(true);
    expect(rows[1]?.changes).toBe('set status · unset note');
  });

  it('says transaction under by for a write made inside a transaction', async () => {
    const client = await MongoClient.connect(replicaSet.uri);
    try {
      const orders = client.db(database).collection<{ _id: number; n?: number }>(collection);
      const session = client.startSession();
      await session.withTransaction(async () => {
        await orders.insertOne({ _id: 2, n: 1 }, { session });
        await orders.insertOne({ _id: 3, n: 1 }, { session });
      });
      await session.endSession();
    } finally {
      await client.close();
    }
    const read = readOf(await readPage(int(2)));
    expect(read.writes).toHaveLength(1);
    expect(read.writes[0]?.group).toBe('transaction');
    expect(read.writes[0]?.session).toBeDefined();
  });

  it('says Datardo under by for a write made from Datardo, with its title in the undo history', async () => {
    await send('insertMany', [[{ _id: int(4), qty: int(1) }]]);
    const args = { ...where, id: int(4), path: 'qty', value: int(1), text: '5' };
    expect(await runner.start('document.inline-edit', target, args, 'table')).toEqual({ kind: 'done' });
    const read = readOf(await readPage(int(4)));
    const versions = documentHistory(read.writes, read.current ?? undefined).versions;
    const own = ownWrites(versions, read.recorded);
    const newest = versions[versions.length - 1];
    expect(own.get(newest?.key ?? '')).toBe(runner.state().undo.entries[0]?.title);
  });

  it('shows on a standalone server that there is no oplog, and no list', async () => {
    const result = await runner.start(
      'history.read-writes',
      { ...target, connection: soloId },
      {
        ...where,
        connection: soloId,
        id: int(1),
      },
    );
    expect(result.kind === 'read' ? result.result : result).toEqual({
      kind: 'refused',
      code: 'history.oplog-window/standalone',
      message:
        'A standalone server has no oplog, so there is no history of the writes: it needs a replica set. A single-node one is enough (mongod --replSet rs0, then rs.initiate()).',
    });
  });
});

describe('history.oplog-window', () => {
  it('gives the times of the oldest and of the newest oplog entry, and refuses a view', async () => {
    await send('insertMany', [[{ _id: int(5) }]]);
    const read = readOf(await readPage(int(5)));
    expect(read.oplog.first?.time).toBeLessThanOrEqual(read.oplog.last?.time ?? 0);
    expect(read.oplog.last?.time).toBeGreaterThan(Date.now() - 60_000);
    await runner.engines
      .send(
        {
          connection: localId,
          request: {
            engine: 'mongodb',
            database,
            method: 'runCommand',
            arguments: [{ create: 'orders_view', viewOn: collection, pipeline: [] }],
          },
        },
        AbortSignal.timeout(10_000),
      )
      .catch(() => undefined);
    const result = await runner.start(
      'history.read-writes',
      { ...target, collection: 'orders_view' },
      {
        ...where,
        collection: 'orders_view',
        id: int(5),
      },
    );
    expect(result.kind === 'read' ? result.result : result).toMatchObject({
      kind: 'refused',
      code: 'history.oplog-window/view',
    });
  });
});

describe('history.read-writes', () => {
  it('reads 250 writes a hundred at a time, back to where each read stopped', async () => {
    await send('insertMany', [[{ _id: int(6), n: int(0) }]]);
    for (let n = 1; n < 250; n += 1) {
      await send('updateOne', [{ _id: int(6) }, { $set: { n: int(n) } }]);
    }
    const first = readOf(await readPage(int(6)));
    expect(first.writes).toHaveLength(100);
    expect(first.stop.complete).toBe(false);
    const second = readOf(await readPage(int(6), first.stop.readBackTo));
    expect(second.writes).toHaveLength(100);
    const third = readOf(await readPage(int(6), second.stop.readBackTo));
    expect(third.writes).toHaveLength(50);
    const all: DocumentWrite[] = [...first.writes, ...second.writes, ...third.writes];
    expect(new Set(all.map((write) => `${String(write.t)}.${String(write.i)}`)).size).toBe(250);
    expect(third.writes.at(-1)?.op).toBe('i');
  });

  it('finds the writes logged with 7 as an Int32 or a Double of a document whose _id is a Long', async () => {
    const long = { $numberLong: '7' };
    await send('insertMany', [[{ _id: long, n: int(0) }]]);
    await send('updateOne', [{ _id: int(7) }, { $set: { n: int(1) } }]);
    await send('updateOne', [{ _id: { $numberDouble: '7.0' } }, { $set: { n: int(2) } }]);
    const read = readOf(await readPage(long));
    expect(read.writes).toHaveLength(3);
  });
});

describe('M27 exit criteria', () => {
  it('shows four writes of a document inserted, updated twice and deleted; restoring the second version puts it back and is recorded', async () => {
    await send('insertMany', [[{ _id: int(9), status: 'new', qty: int(1) }]]);
    await send('updateOne', [{ _id: int(9) }, { $set: { status: 'paid' } }]);
    await send('updateOne', [{ _id: int(9) }, { $set: { qty: int(3) } }]);
    await send('deleteOne', [{ _id: int(9) }]);
    const read = readOf(await readPage(int(9)));
    const history = documentHistory(read.writes, read.current ?? undefined);
    expect(history.versions.map((version) => version.kind)).toEqual(['insert', 'update', 'update', 'delete']);
    const second = history.versions[1];
    expect(second?.state).toBe('exact');
    const before = runner.state().undo.entries.length;
    const result = await runner.start('document.restore-version', target, {
      ...where,
      id: int(9),
      version: second?.document ?? null,
      at: 'then',
      exact: true,
    });
    expect(result).toEqual({ kind: 'done' });
    const now = (await send('find', [{ _id: int(9) }])) as readonly unknown[];
    expect(now[0]).toEqual({ _id: int(9), status: 'paid', qty: int(1) });
    expect(runner.state().undo.entries.length).toBe(before + 1);
  });
});

// Last: the drop is in the oplog of the collection, and so in the history of every document of it read after.
describe('history.read-writes', () => {
  it('adds a write Removed when the collection is dropped, and reads the whole oplog with no Load older', async () => {
    await send('insertMany', [[{ _id: int(8) }]]);
    await send('drop', []);
    const read = readOf(await readPage(int(8)));
    const versions = documentHistory(read.writes, read.current ?? undefined).versions;
    expect(versions.at(-1)?.kind).toBe('drop');
    const again = readOf(await readPage(int(8), read.stop.readBackTo));
    expect(again.stop.complete || read.stop.complete).toBe(true);
  });
});
