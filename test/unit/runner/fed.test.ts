import { describe, expect, it } from 'vitest';
import type { FedTotals } from '../../../src/features/backup/types';
import { fedStep } from '../../../src/features/transfer/types';
import { cancelLatest } from '../../../src/runner/cancel';
import { batchRequest, fedGroup } from '../../../src/runner/fed';
import type { Feeds, RunnerPorts } from '../../../src/runner/ports';
import { start } from '../../../src/runner/start';
import type { Json } from '../../../src/shared/engine-request';
import { run, type OperationFeature, type Plan } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import type { Target } from '../../../src/shared/target';
import { harness, planOf, type HarnessOptions } from './harness';

const local = connectionId('local');
const target: Target = { kind: 'collection', connection: local, database: 'shop', collection: 'orders' };
const on = { connection: local, database: 'shop', collection: 'orders' };

function documents(count: number, from = 1): Json[] {
  return Array.from({ length: count }, (_, at) => ({ _id: { $numberInt: String(from + at) } }));
}

function insertStep(count: number, total?: number) {
  return fedStep(
    on,
    {
      method: 'insertMany',
      options: { ordered: false },
      from: 'documents',
      feed: { kind: 'documents', documents: documents(count) },
    },
    target,
    { title: 'Importing into shop.orders', ...(total === undefined ? {} : { total, unit: 'documents' }) },
  );
}

/** The feeds of the tests: the documents a feed holds, cut into batches of the step's size. */
const feeds: Feeds = {
  read: async function* (fed, batches) {
    for (const [feed, each] of fed.entries()) {
      const all = each.kind === 'documents' ? each.documents : [];
      for (let at = 0; at < all.length; at += batches.documents) {
        await Promise.resolve();
        yield { feed, documents: all.slice(at, at + batches.documents) };
      }
    }
  },
};

async function running(plan: Plan, options: HarnessOptions & { holder?: { ports?: RunnerPorts } } = {}) {
  const totals: FedTotals[] = [];
  const feature: OperationFeature = { kind: 'operation', id: featureId('transfer.import'), plan: () => run(plan) };
  const test = harness({ features: [feature], server: () => Promise.resolve({ insertedCount: 1 }), ...options });
  const ports: RunnerPorts = {
    ...test.ports,
    feeds,
    fedSummary: (_context, _plan, counted) => {
      totals.push(counted);
      return [{ kind: 'notify', level: 'success', text: `Imported ${String(counted.steps[0]?.inserted ?? 0)}.` }];
    },
  };
  if (options.holder !== undefined) {
    options.holder.ports = ports;
  }
  const result = await start(ports, { feature: feature.id, target });
  return { ...test, ports, result, totals };
}

function sentDocuments(request: { readonly request: unknown }): number {
  const inner = request.request as { readonly arguments: readonly Json[] };
  const [first] = inner.arguments;
  return Array.isArray(first) ? first.length : 0;
}

describe('runner.run', () => {
  it('sends the documents of a fed step in batches, and ends with the message of its card', async () => {
    const test = await running(planOf('Import', [insertStep(2500)]));
    expect(test.result).toEqual({ kind: 'done' });
    expect(test.sent.map(sentDocuments)).toEqual([1000, 1000, 500]);
    expect(test.totals[0]).toMatchObject({
      ended: 'done',
      steps: [{ database: 'shop', collection: 'orders', read: 2500, inserted: 2500, duplicates: 0, failed: 0 }],
    });
    const texts = test.state().runner.notifications.map((each) => each.text);
    expect(texts).toEqual(['Imported 2500.']);
  });

  it('counts documents refused for their _id as duplicates and the others as failed, and goes on', async () => {
    const refused = Object.assign(new Error('E11000 duplicate key error'), {
      failedOperations: [0, 1, 2],
      failedCodes: [11000, 11000, 121],
    });
    let calls = 0;
    const test = await running(planOf('Import', [insertStep(1500)]), {
      server: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(refused) : Promise.resolve({});
      },
    });
    expect(test.result).toEqual({ kind: 'done' });
    expect(test.totals[0]?.steps[0]).toMatchObject({
      read: 1500,
      inserted: 1497,
      duplicates: 2,
      failed: 1,
      firstError: 'E11000 duplicate key error',
      firstOtherError: 'E11000 duplicate key error',
    });
  });

  it('stops between two batches when Cancel is pressed, never in the middle of one', async () => {
    const holder: { ports?: RunnerPorts } = {};
    const test = await running(planOf('Import', [insertStep(3000, 3000)]), {
      server: () => {
        if (holder.ports !== undefined) {
          cancelLatest(holder.ports);
        }
        return Promise.resolve({});
      },
      holder,
    });
    expect(test.result).toEqual({ kind: 'cancelled' });
    expect(test.sent.map(sentDocuments)).toEqual([1000]);
    expect(test.totals[0]).toMatchObject({ ended: 'cancelled', steps: [{ read: 1000, inserted: 1000 }] });
  });

  it('stops the plan at a batch that fails whole, with what was counted before it', async () => {
    let calls = 0;
    const test = await running(planOf('Import', [insertStep(2500)]), {
      server: () => {
        calls += 1;
        return calls === 2 ? Promise.reject(new Error('not primary')) : Promise.resolve({});
      },
    });
    expect(test.result).toMatchObject({ kind: 'failed' });
    expect(test.totals[0]).toMatchObject({ ended: 'failed', error: 'not primary', steps: [{ read: 1000 }] });
  });

  it('runs the fed steps of one archive together, and a step of another feed alone', () => {
    const archive = (collection: string, path = 'D:\\b\\shop.agz') =>
      fedStep(
        { ...on, collection },
        {
          method: 'insertMany',
          options: {},
          from: 'archive',
          feed: { kind: 'archive', path, database: 'shop', collection },
        },
        target,
      );
    const steps = [archive('orders'), archive('users'), archive('logs', 'D:\\b\\other.agz'), insertStep(10)];
    expect(fedGroup(steps, 0)).toEqual([0, 1]);
    expect(fedGroup(steps, 2)).toEqual([2]);
    expect(fedGroup(steps, 3)).toEqual([3]);
  });

  it('writes a batch of a bulkWrite as replaceOne with upsert by _id, insertOne without one', () => {
    const step = fedStep(
      on,
      {
        method: 'bulkWrite',
        options: { ordered: false },
        from: 'documents',
        feed: { kind: 'documents', documents: [] },
      },
      target,
    );
    const request = batchRequest(step, [{ _id: 1, a: 1 }, { a: 2 }]);
    expect(request.arguments).toEqual([
      [
        { replaceOne: { filter: { _id: 1 }, replacement: { _id: 1, a: 1 }, upsert: true } },
        { insertOne: { document: { a: 2 } } },
      ],
      { ordered: false },
    ]);
  });
});
