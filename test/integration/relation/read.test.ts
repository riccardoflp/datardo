/**
 * `relation.read` as the main process carries it out (`src/main/relation-read.ts`) against the throwaway MongoDB: the
 * collections listed, counted, their indexes read and sampled six at a time (`$sample` above the sample's size,
 * `find` with a limit otherwise), the values looked up once per target without duplicates, and the references of the
 * database worked out from it all.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { readReferences } from '../../../src/main/relation-read';
import type { ConnectionRequest, Json, MongoRequest } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import { testServers } from '../servers';

const id = connectionId('relation-read');
const database = 'relation_read_it';
let engines: EngineService;

function int(value: number): Json {
  return { $numberInt: String(value) };
}

function oid(index: number): Json {
  return { $oid: `65f1c0a2b3d4e5f6a7b8${index.toString(16).padStart(4, '0')}` };
}

async function send(method: string, collection: string | undefined, args: readonly Json[]): Promise<unknown> {
  const request = {
    engine: 'mongodb',
    database,
    ...(collection === undefined ? {} : { collection }),
    method,
    arguments: args,
  };
  return engines.send({ connection: id, request: request as MongoRequest }, AbortSignal.timeout(60_000));
}

/** What the read sent, and the most samples it took at once. */
interface Watched {
  readonly sent: MongoRequest[];
  sampling: number;
  most: number;
}

function watchedSend(watched: Watched) {
  return async (request: ConnectionRequest, signal: AbortSignal): Promise<unknown> => {
    const mongo = request.request as MongoRequest;
    watched.sent.push(mongo);
    const sample =
      mongo.method === 'aggregate' ||
      (mongo.method === 'find' && mongo.collection !== undefined && JSON.stringify(mongo.arguments) === '[{}]');
    if (sample) {
      watched.sampling += 1;
      watched.most = Math.max(watched.most, watched.sampling);
    }
    try {
      return await engines.send(request, signal);
    } finally {
      if (sample) {
        watched.sampling -= 1;
      }
    }
  };
}

beforeAll(async () => {
  engines = createEngines();
  await engines.connect(
    id,
    { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
    AbortSignal.timeout(30_000),
  );
  await send('runCommand', undefined, [{ dropDatabase: int(1) }]);
  await send('insertMany', 'customers', [
    Array.from({ length: 300 }, (_, index) => ({ _id: oid(index), name: `c${String(index)}` })),
  ]);
  // Two fields pointing to customers._id, 20 values each, 5 of them the same: 35 values to look up.
  const orders = Array.from({ length: 20 }, (_, index) => ({
    _id: int(index),
    customerId: oid(index),
    billedTo: oid(index < 5 ? index : 100 + index),
  }));
  await send('insertMany', 'orders', [orders]);
  for (let index = 0; index < 12; index += 1) {
    await send('insertMany', `other${String(index).padStart(2, '0')}`, [[{ _id: int(1), note: 'nothing' }]]);
  }
  await send('runCommand', undefined, [{ create: 'recent', viewOn: 'orders', pipeline: [] }]);
}, 120_000);

afterAll(async () => {
  await send('runCommand', undefined, [{ dropDatabase: int(1) }]);
  await engines.disconnectAll();
});

describe('relation.read', () => {
  it('finds the references of the database, sampling six collections at most at a time', async () => {
    const watched: Watched = { sent: [], sampling: 0, most: 0 };
    const progress: string[] = [];
    const graph = await readReferences(
      { send: watchedSend(watched), progress: (shown) => progress.push(shown) },
      { connection: id, database, size: 100 },
      new AbortController().signal,
    );
    expect(graph.relations.map((each) => `${each.from}.${each.field} → ${each.to}`)).toEqual(
      expect.arrayContaining(['orders.customerId → customers', 'orders.billedTo → customers']),
    );
    expect(graph.relations.some((each) => each.kind === 'view' && each.from === 'recent' && each.to === 'orders')).toBe(
      true,
    );
    expect(watched.most).toBeLessThanOrEqual(6);
    expect(progress[0]).toBe('Sampling 14 collections…');
    expect(progress).toContain('Sampled 14 of 14 collections…');
  }, 120_000);

  it('samples with $sample above the size of the sample, with find and a limit below it', async () => {
    const watched: Watched = { sent: [], sampling: 0, most: 0 };
    await readReferences(
      { send: watchedSend(watched), progress: () => undefined },
      { connection: id, database, size: 100 },
      new AbortController().signal,
    );
    const customers = watched.sent.filter((each) => each.collection === 'customers' && each.method === 'aggregate');
    expect(JSON.stringify(customers[0]?.arguments)).toContain('"$sample":{"size":');
    const orders = watched.sent.find(
      (each) => each.collection === 'orders' && each.method === 'find' && JSON.stringify(each.arguments) === '[{}]',
    );
    expect(orders?.limit).toBe(100);
  }, 120_000);

  it('looks up the values of two fields pointing to the same target in one find, without duplicates', async () => {
    const watched: Watched = { sent: [], sampling: 0, most: 0 };
    await readReferences(
      { send: watchedSend(watched), progress: () => undefined },
      { connection: id, database, size: 100 },
      new AbortController().signal,
    );
    const lookups = watched.sent.filter(
      (each) =>
        each.collection === 'customers' && each.method === 'find' && JSON.stringify(each.arguments).includes('$in'),
    );
    expect(lookups).toHaveLength(1);
    const filter = (lookups[0]?.arguments[0] ?? {}) as { readonly _id: { readonly $in: readonly Json[] } };
    expect(filter._id.$in).toHaveLength(35);
  }, 120_000);
});
