/**
 * Records the replies of `search.collections` and `search.scan` from the throwaway MongoDB into
 * `test/fixtures/replies/`, named after the server version they came from (testing.md). It runs only when
 * `DATARDO_RECORD_REPLIES=1`: the unit tests of the search area read the recorded files, and the files change only when
 * they are recorded again.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { nextRequests, request as collectionsRequest } from '../../../src/features/search/collections';
import { request as scanRequest, scanArgs } from '../../../src/features/search/scan';
import type { ConnectionRequest, Json } from '../../../src/shared/engine-request';
import type { Context, ReadRequest } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const id = connectionId('record');
const database = 'search-record';

const context: Context = {
  feature: featureId('search.collections'),
  now: 0,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'app' },
  state: initialState,
};

function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** Documents of every type `search.match` reads. */
const orders: readonly Json[] = [
  {
    _id: { $oid: '65f1c0a2b3d4e5f6a7b8c9d0' },
    name: 'Mario Rossi',
    qty: int(42),
    price: { $numberDecimal: '42.0' },
    total: { $numberLong: '420' },
    ratio: { $numberDouble: '1.5' },
    active: true,
    at: { $date: { $numberLong: String(Date.parse('2024-03-15T10:30:00Z')) } },
    customerId: { $oid: '65f1c0a2b3d4e5f6a7b8c9aa' },
    token: { $binary: { base64: 'PyuMHl1KTnucbxorPE1ebw==', subType: '04' } },
    pattern: { $regularExpression: { pattern: '^ma', options: 'i' } },
    code: { $code: 'function () { return 42; }' },
    deletedAt: null,
    items: [{ sku: 'A-17' }, { sku: 'B-02' }],
  },
  { _id: 'A-17', note: 'true story' },
  { _id: { $numberLong: '42' }, status: 'paid' },
  { _id: { a: int(1), b: int(2) }, total: int(1250) },
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

async function setUp(engines: EngineService): Promise<void> {
  await send(engines, 'runCommand', undefined, [{ dropDatabase: int(1) }]);
  await send(engines, 'insertMany', 'orders', [orders]);
  await send(engines, 'insertMany', 'fs.files', [[{ filename: 'a.txt', length: int(1) }]]);
  await send(engines, 'insertMany', 'fs.chunks', [
    [{ n: int(0), data: { $binary: { base64: 'YQ==', subType: '00' } } }],
  ]);
  await send(engines, 'runCommand', undefined, [{ create: 'recent', viewOn: 'orders', pipeline: [] }]);
}

async function save(name: string, replies: unknown): Promise<void> {
  const path = join(folder, `mongodb-8.2-search-${name}.json`);
  const options = (await resolveConfig(path)) ?? {};
  await writeFile(path, await format(JSON.stringify(replies), { ...options, filepath: path }));
}

async function sendAll(engines: EngineService, requests: readonly ConnectionRequest[]): Promise<unknown[]> {
  return Promise.all(
    requests.map(async (each) =>
      engines.send(each, AbortSignal.timeout(20_000)).catch((error: unknown) => ({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      })),
    ),
  );
}

/** Every reply of a whole `search.collections` read, in the order its requests were sent. */
async function readCollections(engines: EngineService, args: Json): Promise<unknown[]> {
  const first = collectionsRequest(context, args) as Extract<ReadRequest, { kind: 'engine' }>;
  const replies = await sendAll(engines, first.requests);
  for (let next = nextRequests(args, replies); next.length > 0; next = nextRequests(args, replies)) {
    replies.push(...(await sendAll(engines, next)));
  }
  return replies;
}

async function record(engines: EngineService): Promise<void> {
  const connection = id as string;
  await save('listDatabases', await readCollections(engines, { connection, views: false, fallback: 'test' }));
  await save('collections', await readCollections(engines, { connection, database, collections: [], views: true }));
  const collection = { database, collection: 'orders', view: false };
  const args = scanArgs({
    connection,
    collection,
    read: 0,
    text: '',
    mode: 'contains',
    matchCase: false,
    fieldNames: false,
  });
  const scan = scanRequest(context, args) as Extract<ReadRequest, { kind: 'engine' }>;
  await save('find-orders', await sendAll(engines, scan.requests));
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)('records the reads of search.collections and search.scan on MongoDB', async () => {
    const engines = createEngines();
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    try {
      await mkdir(folder, { recursive: true });
      await setUp(engines);
      await record(engines);
      await send(engines, 'runCommand', undefined, [{ dropDatabase: int(1) }]);
    } finally {
      await engines.disconnectAll();
    }
    expect(recording).toBe(true);
  });
});
