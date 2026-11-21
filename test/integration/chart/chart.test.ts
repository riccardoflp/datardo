/**
 * The Chart section's reads against the throwaway replica set (M24): `chart.draw` with the filter of the bar as typed
 * and with the pipeline of the editor up to the stage shown, the error of the server in its words, a cancel while the
 * server runs the aggregation; `chart.filter-from-mark`, whose filter matches as many documents as the bar clicked
 * counts; and the writer of `chart.save-picture`, which writes the PNG it is given or says why it could not.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { editorJson, type Stage } from '../../../src/features/aggregate/types';
import type { ChartData } from '../../../src/features/chart/data';
import { plan as markPlan } from '../../../src/features/chart/filter-from-mark';
import type { ChartInput } from '../../../src/features/chart/types';
import { start } from '../../../src/runner/start';
import type { IntentResult } from '../../../src/shared/bridge';
import type { Json } from '../../../src/shared/engine-request';
import type { Context } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import type { Target } from '../../../src/shared/target';
import { live, localId, type Live } from '../undo/live';

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, dialog: {} }));

const database = 'chart_it';
const collection = 'orders';
const target: Target = { kind: 'collection', connection: localId, database, collection };
const bar: ChartInput = { type: 'bar', first: 'status', second: '', value: 'count', series: '', limit: 20 };
let runner: Live;

function int(value: number): Json {
  return { $numberInt: String(value) };
}

async function send(method: string, args: readonly Json[], on: string | null = collection): Promise<unknown> {
  return runner.engines.send(
    {
      connection: localId,
      request: { engine: 'mongodb', database, ...(on === null ? {} : { collection: on }), method, arguments: args },
    },
    AbortSignal.timeout(60_000),
  );
}

function draw(more: Json, signal?: AbortSignal): Promise<IntentResult> {
  const args = { connection: localId, database, collection, input: bar, ...(more as object) } as unknown as Json;
  return start(
    runner.ports,
    { feature: featureId('chart.draw'), target, args },
    signal === undefined ? {} : { signal },
  );
}

async function drawn(more: Json): Promise<ChartData> {
  const result = await draw(more);
  if (result.kind !== 'read') {
    throw new Error(`Expected a read, got ${JSON.stringify(result)}`);
  }
  return result.result as ChartData;
}

beforeAll(async () => {
  runner = await live();
});

afterAll(async () => {
  await send('dropDatabase', [], null).catch(() => undefined);
  await runner.close();
});

beforeEach(async () => {
  await send('dropDatabase', [], null);
  await send('insertMany', [
    Array.from({ length: 300 }, (_, index) => ({
      _id: int(index),
      status: index % 3 === 0 ? 'paid' : index % 3 === 1 ? 'new' : 'sent',
      total: int(index),
    })),
  ]);
}, 60_000);

describe('chart.draw', () => {
  it('draws a Bar of status of the documents of the filter typed in the bar, the largest first', async () => {
    const data = await drawn({ data: 'filter', filter: '{ total: { $gte: 100 } }' });
    expect(data.kind).toBe('category');
    expect([...data.labels].sort()).toEqual(['new', 'paid', 'sent']);
    expect(data.labels[2]).toBe('paid');
    expect(data.series[0]?.values).toEqual([67, 67, 66]);
  });

  it('draws the output of the pipeline up to the stage shown, without its disabled stages', async () => {
    const stages: Stage[] = [
      { name: '$match', body: '{ status: "paid" }', enabled: true },
      { name: '$limit', body: '5', enabled: false },
      { name: '$set', body: '{ status: "changed" }', enabled: true },
    ];
    const data = await drawn({ data: 'pipeline', pipeline: editorJson({ stages, shown: 1 }) });
    expect(data.labels).toEqual(['paid']);
    expect(data.series[0]?.values).toEqual([100]);
  });

  it('shows the error of the server in its words', async () => {
    await send('insertOne', [{ _id: 'text', createdAt: 'not a date' }]);
    const result = await draw({ data: 'filter', filter: '', input: { ...bar, first: 'createdAt', unit: 'month' } });
    expect(result.kind).toBe('failed');
    expect(result.kind === 'failed' && result.message).toMatch(/date/iu);
  });

  // Q124: as for explain.run, the command is not ended on the server; it ends at its time limit.
  it('is cancelled while the server runs the aggregation', async () => {
    const controller = new AbortController();
    const slow = '{ $expr: { $function: { body: "function() { sleep(20); return true; }", args: [], lang: "js" } } }';
    const running = draw({ data: 'filter', filter: slow }, controller.signal);
    const charting = async (): Promise<number> => {
      const reply = (await runner.engines.send(
        {
          connection: localId,
          request: {
            engine: 'mongodb',
            database: 'admin',
            method: 'aggregate',
            arguments: [[{ $currentOp: {} }, { $match: { 'command.aggregate': collection } }]],
          },
        },
        AbortSignal.timeout(10_000),
      )) as readonly unknown[];
      return reply.length;
    };
    await expect.poll(charting, { timeout: 10_000 }).toBe(1);
    controller.abort();
    expect((await running).kind).toBe('cancelled');
  });
});

describe('chart.filter-from-mark', () => {
  it('gives a filter that matches as many documents as the bar clicked counts', async () => {
    const data = await drawn({ data: 'filter', filter: '{ total: { $gte: 100 } }' });
    const context = { now: Date.now(), state: runner.state() } as Context;
    for (const [index, category] of data.conditions.entries()) {
      const args = {
        connection: localId,
        database,
        collection,
        chart: { type: 'bar', first: 'status', data: 'filter' },
        filter: '{ total: { $gte: 100 } }',
        mark: { category },
      };
      const outcome = markPlan(context, { args });
      const step = outcome.kind === 'run' ? outcome.plan.steps[0] : undefined;
      const filter = step?.kind === 'app' ? (step.args as { readonly filterJson: Json }).filterJson : undefined;
      expect(filter).toBeDefined();
      const count = await send('countDocuments', [filter ?? {}]);
      expect(count).toEqual(int(data.series[0]?.values[index] ?? -1));
    }
  });
});

describe('chart.save-picture', () => {
  it('writes the PNG it is given, and says why when the folder cannot be written', async () => {
    const { writePicture } = await import('../../../src/main/chart');
    const folder = await mkdtemp(join(tmpdir(), 'datardo-chart-'));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    try {
      const path = join(folder, 'orders-bar.png');
      await writePicture(path, { picture: png.toString('base64') });
      expect(await readFile(path)).toEqual(png);
      const missing = join(folder, 'missing', 'orders-bar.png');
      await expect(writePicture(missing, { picture: png.toString('base64') })).rejects.toThrow(
        /^Could not save the chart: .+/u,
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
