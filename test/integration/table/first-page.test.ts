/**
 * A collection tab opens on a large collection without counting every document (QA6): `query.run` and `query.count`
 * run by the runner against a real MongoDB send one `find` with the page's limit and one `estimatedDocumentCount`.
 * The time of the first rows on 10 million documents is measured only when `DATARDO_TEST_PERFORMANCE=1` (the
 * performance scenario of quality.md), since filling the collection takes minutes.
 */
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEngines } from '../../../src/engines';
import { features } from '../../../src/features/query';
import type { RunResult } from '../../../src/features/query/run';
import { emptyTexts } from '../../../src/features/query/types';
import type { MongoRequest } from '../../../src/shared/engine-request';
import { connectionId, featureId } from '../../../src/shared/ids';
import { start } from '../../../src/runner/start';
import { mongoConnection, stateWith } from '../../unit/connection/context';
import { harness } from '../../unit/runner/harness';
import { testServers } from '../servers';

const servers = testServers();
const id = connectionId('c-local');
const database = 'table_first_page';
const state = stateWith([mongoConnection({ id })], { [id]: 'connected' });
const measuring = process.env['DATARDO_TEST_PERFORMANCE'] === '1';
const target = (collection: string) => ({ kind: 'collection', connection: id, database, collection }) as const;

async function fill(collection: string, count: number): Promise<void> {
  const client = new MongoClient(servers.mongoStandalone);
  try {
    const into = client.db(database).collection(collection);
    await into.drop().catch(() => false);
    const batch = 100_000;
    for (let first = 0; first < count; first += batch) {
      const size = Math.min(batch, count - first);
      await into.insertMany(
        Array.from({ length: size }, (_, n) => ({ n: first + n, name: `document ${String(first + n)}` })),
        { ordered: false },
      );
    }
  } finally {
    await client.close();
  }
}

describe('table.show opens a large collection with one find and one estimated count', () => {
  const engines = createEngines();
  const test = () => harness({ features, state, server: (request, aborted) => engines.send(request, aborted) });

  async function open(collection: string) {
    const run = test();
    const args = { connection: id, database, collection };
    const began = performance.now();
    const [page, count] = await Promise.all([
      start(run.ports, {
        feature: featureId('query.run'),
        target: target(collection),
        args: { ...args, texts: emptyTexts, page: 1, pageSize: 50 },
      }),
      start(run.ports, {
        feature: featureId('query.count'),
        target: target(collection),
        args: { ...args, filter: '', kind: 'collection', exact: false },
      }),
    ]);
    const methods = run.sent.map((each) => (each.request as MongoRequest).method);
    const limits = run.sent.map((each) => (each.request as MongoRequest).limit);
    return { page, count, methods, limits, took: performance.now() - began };
  }

  beforeAll(async () => {
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: servers.mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
  });

  afterAll(async () => {
    await engines.disconnectAll();
  });

  it('sends one find with the limit of the page and one estimatedDocumentCount', async () => {
    await fill('orders', 10_000);
    const opened = await open('orders');
    expect(opened.methods.sort()).toEqual(['estimatedDocumentCount', 'find']);
    expect(opened.limits).toContain(50);
    const read = (opened.page.kind === 'read' ? opened.page.result : { documents: [] }) as RunResult;
    expect(read.documents).toHaveLength(50);
    expect(opened.count).toEqual({ kind: 'read', result: { count: 10_000, estimated: true } });
  });

  it.runIf(measuring)(
    'shows the first rows of 10 million documents in under 1 second',
    async () => {
      await fill('ten_million', 10_000_000);
      const opened = await open('ten_million');
      expect(opened.methods.sort()).toEqual(['estimatedDocumentCount', 'find']);
      expect(opened.took).toBeLessThan(1000);
    },
    1_800_000,
  );
});
