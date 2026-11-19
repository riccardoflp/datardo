/**
 * Records the replies `aggregate.run` reads from a throwaway MongoDB into `test/fixtures/replies/`, named after the
 * server version they came from (testing.md): a page and its count, an empty count, a `$group` whose sums are
 * `NumberLong`, and what a `$out` returns. It runs only when `DATARDO_RECORD_REPLIES=1`: the unit tests of
 * `aggregate.run`'s `parse` read the recorded files, and the files change only when they are recorded again.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService as Engines } from '../../../src/engines';
import { builtPipeline } from '../../../src/features/aggregate/build';
import { aggregateRequest, pageTimeLimitMs, runRequests } from '../../../src/features/aggregate/run';
import type { PipelinePlace, Stage } from '../../../src/features/aggregate/types';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const id = connectionId('record');

const place: PipelinePlace = {
  connection: id,
  connectionName: 'Record',
  readOnly: false,
  database: 'datardo_aggregate',
  collection: 'orders',
  view: false,
};

/** Six orders of three customers, with the types a pipeline must keep. */
const orders: Json[] = [1, 2, 3, 4, 5, 6].map((n) => ({
  _id: { $oid: `65f1c0de9a1b2c3d4e5f6a7${String(n)}` },
  customer: { $oid: `65f1c0de9a1b2c3d4e5f6b0${String(n % 3)}` },
  status: n % 2 === 0 ? 'paid' : 'open',
  total: { $numberDouble: `${String(n * 10)}.5` },
  quantity: { $numberLong: String(n) },
  placed: { $date: { $numberLong: String(Date.UTC(2026, 0, n)) } },
  items: [{ sku: `A-${String(n)}`, price: { $numberDecimal: `${String(n)}.99` } }],
}));

function pipeline(stages: readonly Stage[]): readonly Json[] {
  const built = builtPipeline(stages, stages.length - 1);
  if (!built.ok) {
    throw new Error(built.message);
  }
  return built.pipeline;
}

async function send(engines: Engines, request: MongoRequest): Promise<unknown> {
  return engines.send({ connection: id, request }, AbortSignal.timeout(20_000));
}

async function record(name: string, reply: unknown): Promise<void> {
  await writeFile(join(folder, `mongodb-8.2-aggregate-${name}.json`), `${JSON.stringify(reply, null, 2)}\n`);
}

async function seed(engines: Engines): Promise<void> {
  const where = { engine: 'mongodb', database: place.database, collection: place.collection } as const;
  await send(engines, { ...where, method: 'deleteMany', arguments: [{}] });
  await send(engines, { ...where, method: 'insertMany', arguments: [orders] });
}

async function recordAll(engines: Engines): Promise<void> {
  const paid = pipeline([{ name: '$match', body: '{ status: "paid" }', enabled: true }]);
  const [page, count] = runRequests(place, paid, 1, 50);
  await record('page', await send(engines, page as MongoRequest));
  await record('count', await send(engines, count as MongoRequest));
  const none = pipeline([{ name: '$match', body: '{ status: "none" }', enabled: true }]);
  await record('count-empty', await send(engines, runRequests(place, none, 1, 50)[1] as MongoRequest));
  const grouped = pipeline([
    {
      name: '$group',
      body: '{ _id: "$customer", quantity: { $sum: "$quantity" }, orders: { $sum: 1 } }',
      enabled: true,
    },
    { name: '$sort', body: '{ _id: 1 }', enabled: true },
  ]);
  await record('group', await send(engines, runRequests(place, grouped, 1, 50)[0] as MongoRequest));
  const out = pipeline([
    { name: '$match', body: '{ status: "paid" }', enabled: true },
    { name: '$out', body: '"paid_orders"', enabled: true },
  ]);
  await record('out', await send(engines, aggregateRequest(place, out, pageTimeLimitMs)));
}

describe('the recorded replies of aggregate.run', () => {
  it.runIf(recording)('records a page, its count, an empty count, a $group and a $out of MongoDB', async () => {
    const servers = testServers();
    await mkdir(folder, { recursive: true });
    const engines = createEngines();
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: servers.mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    try {
      await seed(engines);
      await recordAll(engines);
    } finally {
      await engines.disconnectAll();
    }
    expect(recording).toBe(true);
  });
});
