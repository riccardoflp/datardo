/**
 * Records the replies of the phases of `relation.read` from the throwaway MongoDB into `test/fixtures/replies/`, named
 * after the server version they came from (testing.md). It runs only when `DATARDO_RECORD_REPLIES=1`: the unit tests
 * of `relation.read` read the recorded files, and the files change only when they are recorded again.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { candidatesOf, lookupsOf, sampledCollection } from '../../../src/features/relation/model/graph';
import { parse, request } from '../../../src/features/relation/read';
import type { SampledCollection } from '../../../src/features/relation/types';
import type { Json } from '../../../src/shared/engine-request';
import type { Context } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const id = connectionId('record');
const database = 'relation-record';

const context: Context = {
  feature: featureId('relation.read'),
  now: 0,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'app' },
  state: initialState,
};

function int(value: number): Json {
  return { $numberInt: String(value) };
}

function oid(end: string): Json {
  return { $oid: `65f1c0a2b3d4e5f6a7b8${end.padStart(4, '0')}` };
}

const customers: readonly Json[] = [1, 2, 3].map((at) => ({
  _id: oid(`c${String(at)}`),
  name: `Customer ${String(at)}`,
  email: `c${String(at)}@example.com`,
}));

const orders: readonly Json[] = [1, 2, 3, 4].map((at) => ({
  _id: oid(`a${String(at)}`),
  customerId: oid(`c${String(((at - 1) % 3) + 1)}`),
  customerEmail: `c${String(((at - 1) % 3) + 1)}@example.com`,
  items: [{ productId: `P-${String(at)}`, qty: int(at) }],
  total: { $numberDouble: String(at * 10.5) },
}));

const products: readonly Json[] = [1, 2, 3, 4].map((at) => ({ _id: `P-${String(at)}`, name: `Product ${String(at)}` }));

async function send(
  engines: EngineService,
  method: string,
  collection: string | undefined,
  args: readonly Json[],
): Promise<unknown> {
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
  await send(engines, 'insertMany', 'customers', [customers]);
  await send(engines, 'insertMany', 'orders', [orders]);
  await send(engines, 'insertMany', 'products', [products]);
  await send(engines, 'runCommand', undefined, [
    { createIndexes: 'customers', indexes: [{ key: { email: int(1) }, name: 'email_1', unique: true }] },
  ]);
  await send(engines, 'runCommand', undefined, [{ create: 'recent', viewOn: 'orders', pipeline: [] }]);
}

/** Sends the requests of a phase and writes its replies, one file per phase. */
async function record(engines: EngineService, name: string, args: Json): Promise<readonly unknown[]> {
  const read = request(context, args);
  if (read.kind !== 'engine') {
    throw new Error(`relation.read gave no request for ${name}.`);
  }
  const replies: unknown[] = [];
  for (const each of read.requests) {
    replies.push(await engines.send({ ...each, connection: id }, AbortSignal.timeout(20_000)));
  }
  const path = join(folder, `mongodb-8.2-relation-${name}.json`);
  const options = (await resolveConfig(path)) ?? {};
  await writeFile(path, await format(JSON.stringify(replies), { ...options, filepath: path }));
  return replies;
}

/** Samples the collections, then records one lookup per target field of their candidates. */
async function recordSamples(engines: EngineService, place: { connection: string; database: string }): Promise<void> {
  const sampledOnes: SampledCollection[] = [];
  for (const collection of ['customers', 'orders', 'products']) {
    const replies = await record(engines, `sample-${collection}`, { ...place, phase: 'sample', collection, size: 100 });
    const documents = parse(replies, { phase: 'sample' }) as readonly Json[];
    const unique = collection === 'customers' ? ['email'] : [];
    sampledOnes.push(sampledCollection({ name: collection, view: false }, { unique, sample: { documents } }));
  }
  for (const lookup of lookupsOf(candidatesOf(sampledOnes))) {
    await record(engines, `lookup-${lookup.collection}-${lookup.field}`, { ...place, phase: 'lookup', ...lookup });
  }
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)('records the phases of relation.read on MongoDB', async () => {
    const engines = createEngines();
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    const place = { connection: id, database };
    try {
      await mkdir(folder, { recursive: true });
      await setUp(engines);
      await record(engines, 'collections', { ...place, phase: 'collections' });
      await record(engines, 'count', { ...place, phase: 'count', collection: 'orders' });
      await record(engines, 'indexes', { ...place, phase: 'indexes', collection: 'customers' });
      await recordSamples(engines, place);
      await send(engines, 'runCommand', undefined, [{ dropDatabase: int(1) }]);
    } finally {
      await engines.disconnectAll();
    }
    expect(recording).toBe(true);
  });
});
