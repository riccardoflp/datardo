/**
 * The Schema section's reads against the throwaway replica set (M23): `schema.sample` carried out by the runner with
 * the app action `schema.read-sample` of the main process, a random sample when more documents match than the size
 * and all of them otherwise, the tab's sample kept in the state whatever started it, a filter that is not valid, a
 * read cancelled while the server counts; `schema.filter-from-value`, whose filter reaches the state and whose sample
 * reads again; and the analysis on the worker thread of the built bundle, the same as in the main process.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SampleResult } from '../../../src/features/schema/sample';
import { readSample, setFilter } from '../../../src/main/schema';
import { Cancelled } from '../../../src/runner/cancel';
import { analyzeSample } from '../../../src/runner/workers/analysis';
import { start } from '../../../src/runner/start';
import type { IntentResult } from '../../../src/shared/bridge';
import type { Json } from '../../../src/shared/engine-request';
import { featureId } from '../../../src/shared/ids';
import type { Target } from '../../../src/shared/target';
import { live, localId, type Live } from '../undo/live';

const database = 'schema_it';
const target = (collection: string): Target => ({ kind: 'collection', connection: localId, database, collection });
const workerBundle = join(import.meta.dirname, '..', '..', '..', 'out', 'main', 'workers.js');
let runner: Live;

function int(value: number): Json {
  return { $numberInt: String(value) };
}

async function send(collection: string | null, method: string, args: readonly Json[]): Promise<unknown> {
  return runner.engines.send(
    {
      connection: localId,
      request: {
        engine: 'mongodb',
        database,
        ...(collection === null ? {} : { collection }),
        method,
        arguments: args,
      },
    },
    AbortSignal.timeout(60_000),
  );
}

/** Opens a collection tab as `tab.open` does: its id. */
function openTab(collection: string): string {
  const shows = { kind: 'collection', connection: localId, database, collection } as const;
  const before = new Set(runner.state().tabs.tabs.map((tab) => tab.id));
  runner.ports.state.dispatch({
    slice: 'tabs',
    type: 'opened',
    seed: { shows },
    key: JSON.stringify(shows),
    background: false,
    at: Date.now(),
  });
  return runner.state().tabs.tabs.find((each) => !before.has(each.id))?.id ?? '';
}

function sampleOf(tab: string) {
  return runner.state().schema.samples[tab];
}

function resultOf(tab: string): SampleResult | undefined {
  return sampleOf(tab)?.result as SampleResult | undefined;
}

function startOn(collection: string, feature: string, args: Json, signal?: AbortSignal): Promise<IntentResult> {
  return start(
    runner.ports,
    { feature: featureId(feature), target: target(collection), args },
    signal === undefined ? {} : { signal },
  );
}

beforeAll(async () => {
  runner = await live();
  const actions = runner.ports.appActions as Map<string, (args: Json, signal: AbortSignal) => Promise<unknown>>;
  const ports = { engines: () => runner.engines, state: runner.ports.state, analysis: {}, now: () => Date.now() };
  actions.set('schema.read-sample', (args, signal) => readSample(ports, args, signal));
  actions.set('query.set-filter', (args) => setFilter(runner.ports.state, args));
  await send(null, 'dropDatabase', []);
  await send('orders', 'insertMany', [
    [
      { _id: int(1), status: 'paid', total: { $numberDouble: '42.5' }, qty: int(2) },
      { _id: int(2), status: 'new', total: int(12), qty: { $numberLong: '5' } },
      { _id: int(3), status: 'paid', total: null },
      { _id: int(4), status: 'paid', total: { $numberDouble: '7' } },
    ],
  ]);
  await send('big', 'insertMany', [
    Array.from({ length: 1200 }, (_, index) => ({ _id: int(index), n: int(index), even: index % 2 === 0 })),
  ]);
  await send('slow', 'insertMany', [Array.from({ length: 40 }, (_, index) => ({ _id: int(index) }))]);
}, 120_000);

afterAll(async () => {
  await send(null, 'dropDatabase', []).catch(() => undefined);
  await runner.close();
});

describe('schema.sample', () => {
  it('reads all 4 documents of a small collection, with their types, and keeps the result for the tab', async () => {
    const tab = openTab('orders');
    const result = await startOn('orders', 'schema.sample', { tab, filter: '', size: 1000 });
    expect(result.kind).toBe('read');
    const shown = resultOf(tab);
    expect(sampleOf(tab)?.running).toBe(false);
    expect(shown?.outOf).toBe(4);
    expect(shown?.summary.analyzed).toBe(4);
    const total = shown?.summary.fields.find((field) => field.path === 'total');
    expect(total?.types.map((type) => [type.type, type.count])).toEqual([
      ['double', 2],
      ['int', 1],
      ['null', 1],
    ]);
    const qty = shown?.summary.fields.find((field) => field.path === 'qty');
    expect(qty?.types.map((type) => type.type)).toEqual(['int', 'long']);
  });

  it('reads a random sample of 1,000 out of 1,200, then of 100 when Sample is 100', async () => {
    const tab = openTab('big');
    await startOn('big', 'schema.sample', { tab, filter: '', size: 1000 });
    expect(resultOf(tab)?.outOf).toBe(1200);
    expect(resultOf(tab)?.summary.analyzed).toBe(1000);
    await startOn('big', 'schema.sample', { tab, filter: '', size: 100 });
    expect(resultOf(tab)?.summary.analyzed).toBe(100);
  });

  it('counts with the filter: { even: true } matches 600, all of them read at Sample 1,000', async () => {
    const tab = openTab('big');
    await startOn('big', 'schema.sample', { tab, filter: '{ even: true }', size: 1000 });
    expect(resultOf(tab)?.outOf).toBe(600);
    expect(resultOf(tab)?.summary.analyzed).toBe(600);
  });

  it('sends nothing for a filter that is not valid', async () => {
    const tab = openTab('orders');
    const result = await startOn('orders', 'schema.sample', { tab, filter: '{ status: ', size: 1000 });
    expect(result).toMatchObject({ kind: 'refused', code: 'schema.sample/invalid-filter' });
    expect(sampleOf(tab)).toBeUndefined();
  });

  it('is cancelled while the server counts, and the tab shows Cancelled', async () => {
    const tab = openTab('slow');
    const controller = new AbortController();
    const running = startOn(
      'slow',
      'schema.sample',
      { tab, filter: '{ $where: "sleep(100) || true" }', size: 1000 },
      controller.signal,
    );
    await expect.poll(() => sampleOf(tab)?.running).toBe(true);
    controller.abort();
    expect((await running).kind).toBe('cancelled');
    // The runner answers at once; the read ends when the server has stopped the command, and then the tab says so.
    await expect.poll(() => sampleOf(tab)?.ended?.kind, { timeout: 10_000 }).toBe('cancelled');
    expect(sampleOf(tab)?.running).toBe(false);
  });
});

describe('schema.filter-from-value', () => {
  it('a click on "paid" puts { status: "paid" } in the state and analyzes the 3 documents with that status', async () => {
    const tab = openTab('orders');
    const click = { kind: 'value', value: 'paid' };
    const result = await startOn('orders', 'schema.filter-from-value', {
      tab,
      filter: '',
      size: 1000,
      path: 'status',
      click,
    });
    expect(result.kind).toBe('done');
    expect(runner.state().schema.filters[tab]?.filter).toBe('{ status: "paid" }');
    await expect.poll(() => resultOf(tab)?.outOf).toBe(3);
  });
});

describe('schema.analyze', () => {
  it.skipIf(!existsSync(workerBundle))(
    'gives on the worker thread of the bundle what it gives in the main process',
    async () => {
      const documents = (await send('big', 'find', [{}])) as readonly Json[];
      const here = await analyzeSample(documents, AbortSignal.timeout(30_000), {});
      const onWorker = await analyzeSample(documents, AbortSignal.timeout(30_000), { worker: workerBundle });
      expect(onWorker).toEqual(here);
      expect(onWorker.analyzed).toBe(documents.length);
    },
  );

  it.skipIf(!existsSync(workerBundle))('stops on the worker thread when cancelled', async () => {
    const documents = Array.from({ length: 200_000 }, (_, index): Json => ({ n: int(index), s: `v${String(index)}` }));
    const controller = new AbortController();
    let batches = 0;
    const analysis = analyzeSample(documents, controller.signal, {
      worker: workerBundle,
      progress: () => {
        batches += 1;
        if (batches === 2) {
          controller.abort();
        }
      },
    });
    await expect(analysis).rejects.toBeInstanceOf(Cancelled);
    expect(batches).toBeLessThan(400);
  });
});
