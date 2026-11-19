/**
 * Records the replies `schema.sample` gets from the throwaway MongoDB into `test/fixtures/replies/`, named after the
 * server version they came from (testing.md). It runs only when `DATARDO_RECORD_REPLIES=1`: the unit tests of
 * `schema.analyze` and `schema.sample` read the recorded files, and the files change only when they are recorded again.
 *
 * It does what the main process does with the work of `schema.sample`: it sends the count, then the documents request
 * the count chooses, and keeps both replies.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { countOfReply, documentsRequest, request, type SampleWork } from '../../../src/features/schema/sample';
import type { Json } from '../../../src/shared/engine-request';
import type { Context } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const id = connectionId('record');
const database = 'schema-record';

function int(value: number): Json {
  return { $numberInt: String(value) };
}

function oid(last: string): Json {
  return { $oid: `65f1c0de9a1b2c3d4e5f6a0${last}` };
}

/** The sample of the worked example of `schema.analyze`, with its types. */
const workedExample: readonly Json[] = [
  {
    _id: oid('1'),
    status: 'paid',
    total: { $numberDouble: '42.5' },
    qty: int(2),
    address: { city: 'Milano', zip: '20100' },
    items: [
      { sku: 'A1', qty: int(1) },
      { sku: 'B2', qty: int(3) },
    ],
    tags: ['a', 'b'],
  },
  {
    _id: oid('2'),
    status: 'new',
    total: int(12),
    qty: { $numberLong: '5' },
    address: { city: 'Roma' },
    items: [],
    tags: ['a'],
  },
  { _id: oid('3'), status: 'paid', total: null, address: 'unknown', items: [{ sku: 'A1', qty: int(2) }] },
  { _id: oid('4'), status: 'paid', total: { $numberDouble: '7.0' } },
];

/** One value of each BSON type the analysis tells apart, in a field `v`. */
const everyType: readonly Json[] = [
  { _id: int(1), v: 'text' },
  { _id: int(2), v: int(2) },
  { _id: int(3), v: { $numberDouble: '2.0' } },
  { _id: int(4), v: { $numberLong: '9007199254740993' } },
  { _id: int(5), v: { $numberDecimal: '12.50' } },
  { _id: int(6), v: true },
  { _id: int(7), v: { $date: { $numberLong: '1709251200000' } } },
  { _id: int(8), v: { $oid: '65f1c0de9a1b2c3d4e5f6a7b' } },
  { _id: int(9), v: null },
  { _id: int(10), v: { nested: int(1) } },
  { _id: int(11), v: [int(1)] },
  { _id: int(12), v: { $binary: { base64: 'AQID', subType: '00' } } },
  { _id: int(13), v: { $binary: { base64: 'EjRWeBI0VngSNFZ4EjRWeA==', subType: '04' } } },
  { _id: int(14), v: { $regularExpression: { pattern: '^ma', options: 'i' } } },
  { _id: int(15), v: { $timestamp: { t: 1700000000, i: 1 } } },
  { _id: int(16), v: { $code: 'function () { return 1; }' } },
  { _id: int(17), v: { $minKey: 1 } },
  { _id: int(18), v: { $maxKey: 1 } },
];

function contextOf(collection: string): Context {
  return {
    feature: featureId('schema.sample'),
    now: 0,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'collection', connection: id, database, collection },
    state: initialState,
  };
}

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

async function save(name: string, reply: unknown): Promise<void> {
  await writeFile(join(folder, `mongodb-8.2-schema-${name}.json`), `${JSON.stringify(reply, null, 2)}\n`);
}

/** Sends the work of `schema.sample` as the main process does, and saves the count and the documents. */
async function record(engines: EngineService, name: string, collection: string, args: Json): Promise<void> {
  const read = request(contextOf(collection), args);
  if (read.kind !== 'app') {
    throw new Error(`schema.sample did not give its work for ${name}.`);
  }
  const work = read.args as unknown as SampleWork;
  const count = await engines.send({ connection: id, request: work.count }, AbortSignal.timeout(20_000));
  const documents = await engines.send(
    { connection: id, request: documentsRequest(work, countOfReply(count)) },
    AbortSignal.timeout(20_000),
  );
  await save(`${name}-count`, count);
  await save(`${name}-documents`, documents);
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)('records the reads of schema.sample on MongoDB', async () => {
    const engines = createEngines();
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    try {
      await mkdir(folder, { recursive: true });
      await send(engines, 'runCommand', undefined, [{ dropDatabase: int(1) }]);
      await send(engines, 'insertMany', 'orders', [workedExample]);
      await send(engines, 'insertMany', 'types', [everyType]);
      await record(engines, 'worked-example', 'orders', {});
      await record(engines, 'paid', 'orders', { filter: '{ status: "paid" }' });
      await record(engines, 'every-type', 'types', {});
      await send(engines, 'runCommand', undefined, [{ dropDatabase: int(1) }]);
    } finally {
      await engines.disconnectAll();
    }
    expect(recording).toBe(true);
  });
});
