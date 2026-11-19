/**
 * Records the replies of `explain.run` from the throwaway MongoDB replica set into `test/fixtures/replies/`, named
 * after the server version they came from (testing.md). It runs only when `DATARDO_RECORD_REPLIES=1`: the unit tests of
 * `explain.summary`, `explain.run` and `explain.raw` read the recorded files, and the files change only when they are
 * recorded again. A sharded cluster is not started here: the sharded shapes of the unit tests are written by hand.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { request } from '../../../src/features/explain/run';
import type { Json } from '../../../src/shared/engine-request';
import type { Context, ReadRequest } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const id = connectionId('record');
const database = 'explain-record';

function int(value: number): Json {
  return { $numberInt: String(value) };
}

function date(milliseconds: number): Json {
  return { $date: { $numberLong: String(milliseconds) } };
}

function contextOf(collection: string): Context {
  return {
    feature: featureId('explain.run'),
    now: 0,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'collection', connection: id, database, collection },
    state: initialState,
  };
}

/**
 * `orders`: 1,000 documents, 3 of them `paid`, without an index on `status`. `sorted`: 1,000 documents, 120 of them
 * `paid` and the oldest, with the indexes `status_1` and `createdAt_-1`, so that a sort on `createdAt` has two plans.
 * `either`: documents with `a`, `b` and `c`, with the indexes `a_1` and `c_1`, for a plan with two inputs.
 */
function orders(): readonly Json[] {
  return Array.from({ length: 1000 }, (_, index) => ({
    _id: int(index),
    status: index % 333 === 1 ? 'paid' : 'new',
    customer: `c${String(index % 4)}`,
    total: int(index),
  }));
}

function sorted(): readonly Json[] {
  return Array.from({ length: 1000 }, (_, index) => ({
    _id: int(index),
    status: index < 120 ? 'paid' : 'new',
    createdAt: date(Date.UTC(2024, 0, 1) + index * 60_000),
    customer: `c${String(index % 4)}`,
  }));
}

function either(): readonly Json[] {
  return Array.from({ length: 300 }, (_, index) => ({
    _id: int(index),
    a: int(index % 50),
    b: int(index),
    c: int(index % 30),
  }));
}

/** What each recorded reply is of: the collection and the arguments `explain.run` is started with. */
interface Recording {
  readonly name: string;
  readonly collection: string;
  readonly args: Json;
}

const recordings: readonly Recording[] = [
  { name: 'find-collscan', collection: 'orders', args: { mode: 'find', query: { filter: '{ status: "paid" }' } } },
  {
    name: 'find-ixscan-sort',
    collection: 'sorted',
    args: { mode: 'find', query: { filter: '{ status: "paid" }', sort: '{ createdAt: -1 }' } },
  },
  { name: 'find-ixscan', collection: 'sorted', args: { mode: 'find', query: { filter: '{ status: "paid" }' } } },
  { name: 'find-id', collection: 'orders', args: { mode: 'find', query: { filter: '{ _id: 7 }' } } },
  {
    name: 'find-or',
    collection: 'either',
    args: { mode: 'find', query: { filter: '{ $or: [{ a: 1 }, { c: 2 }] }', sort: '{ b: 1 }' } },
  },
  {
    name: 'aggregate-group',
    collection: 'sorted',
    args: {
      mode: 'aggregate',
      pipeline: {
        stages: [
          { name: '$match', body: '{ status: "paid" }', enabled: true },
          { name: '$group', body: '{ _id: "$customer", n: { $sum: 1 } }', enabled: true },
          { name: '$sort', body: '{ _id: 1 }', enabled: true },
        ],
      },
    },
  },
  {
    name: 'aggregate-cursor',
    collection: 'orders',
    args: {
      mode: 'aggregate',
      pipeline: {
        stages: [
          { name: '$match', body: '{ status: "paid" }', enabled: true },
          { name: '$addFields', body: '{ doubled: { $multiply: ["$total", 2] } }', enabled: true },
          { name: '$sort', body: '{ doubled: -1 }', enabled: true },
        ],
      },
    },
  },
];

async function send(engines: EngineService, method: string, collection: string | undefined, args: readonly Json[]) {
  return engines.send(
    {
      connection: id,
      request: {
        engine: 'mongodb',
        database,
        ...(collection === undefined ? {} : { collection }),
        method,
        arguments: args,
      },
    },
    AbortSignal.timeout(20_000),
  );
}

async function prepare(engines: EngineService): Promise<void> {
  await send(engines, 'runCommand', undefined, [{ dropDatabase: int(1) }]);
  await send(engines, 'insertMany', 'orders', [orders()]);
  await send(engines, 'insertMany', 'sorted', [sorted()]);
  await send(engines, 'insertMany', 'either', [either()]);
  const index = (collection: string, keys: Json, name: string): Json => ({
    createIndexes: collection,
    indexes: [{ key: keys, name }],
  });
  await send(engines, 'runCommand', undefined, [index('sorted', { status: int(1) }, 'status_1')]);
  await send(engines, 'runCommand', undefined, [index('sorted', { createdAt: int(-1) }, 'createdAt_-1')]);
  await send(engines, 'runCommand', undefined, [index('either', { a: int(1) }, 'a_1')]);
  await send(engines, 'runCommand', undefined, [index('either', { c: int(1) }, 'c_1')]);
}

/** The name of the machine the server ran on is not kept: `serverInfo.host` is written `recorder`. */
function withoutHost(key: string, value: unknown): unknown {
  return key === 'host' && typeof value === 'string' ? 'recorder' : value;
}

async function record(engines: EngineService, each: Recording): Promise<void> {
  const read = request(contextOf(each.collection), each.args) as ReadRequest;
  const [sent] = read.kind === 'engine' ? read.requests : [];
  if (sent?.request.engine !== 'mongodb') {
    throw new Error(`explain.run refused the recording ${each.name}.`);
  }
  const reply = await engines.send(sent, AbortSignal.timeout(20_000));
  await writeFile(join(folder, `mongodb-8.2-explain-${each.name}.json`), `${JSON.stringify(reply, withoutHost, 2)}\n`);
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)('records the explains of explain.run on MongoDB', async () => {
    const engines = createEngines();
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoReplicaSet, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    try {
      await mkdir(folder, { recursive: true });
      await prepare(engines);
      for (const each of recordings) {
        await record(engines, each);
      }
      await send(engines, 'runCommand', undefined, [{ dropDatabase: int(1) }]);
    } finally {
      await engines.disconnectAll();
    }
    expect(recording).toBe(true);
  });
});
