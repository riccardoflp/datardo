/**
 * Records the replies of `chart.draw` from the throwaway MongoDB into `test/fixtures/replies/`, named after the server
 * version they came from (testing.md). It runs only when `DATARDO_RECORD_REPLIES=1`: the unit tests of `chart.data`
 * and `chart.pipeline` read the recorded files, and the files change only when they are recorded again.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { request } from '../../../src/features/chart/draw';
import type { ChartInput } from '../../../src/features/chart/types';
import type { Json } from '../../../src/shared/engine-request';
import type { Context, ReadRequest } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const id = connectionId('record');
const database = 'chart-record';

const context: Context = {
  feature: featureId('chart.draw'),
  now: 0,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'app' },
  state: initialState,
};

function int(value: number): Json {
  return { $numberInt: String(value) };
}

function date(iso: string): Json {
  return { $date: { $numberLong: String(Date.parse(iso)) } };
}

/** What each recorded reply is of: the documents of its collection and the chart drawn of them. */
interface Recording {
  readonly name: string;
  readonly documents: readonly Json[];
  readonly input: Partial<ChartInput> & Pick<ChartInput, 'type' | 'first'>;
}

const recordings: readonly Recording[] = [
  {
    name: 'bar-tags',
    documents: [{ tags: ['a', 'b'] }, { tags: ['a'] }, {}],
    input: { type: 'bar', first: 'tags' },
  },
  {
    name: 'histogram-4-bins',
    documents: [{ total: int(0) }, { total: int(10) }, { total: int(60) }, { total: int(100) }],
    input: { type: 'histogram', first: 'total', limit: 4 },
  },
  {
    name: 'histogram-one-value',
    documents: [{ total: int(5) }, { total: int(5) }, { total: int(5) }],
    input: { type: 'histogram', first: 'total', limit: 4 },
  },
  {
    name: 'histogram-dates',
    documents: [
      { at: date('2024-01-01T00:00:00Z') },
      { at: date('2024-01-05T00:00:00Z') },
      { at: date('2024-01-09T00:00:00Z') },
    ],
    input: { type: 'histogram', first: 'at', limit: 2 },
  },
  {
    name: 'bar-months',
    documents: [
      { createdAt: date('2024-01-03T10:00:00Z') },
      { createdAt: date('2024-02-10T10:00:00Z') },
      { createdAt: date('2024-02-11T10:00:00Z') },
      { createdAt: date('2024-02-12T10:00:00Z') },
      { createdAt: date('2024-03-20T10:00:00Z') },
      { createdAt: date('2024-03-21T10:00:00Z') },
    ],
    input: { type: 'bar', first: 'createdAt', unit: 'month' },
  },
  {
    name: 'bar-series',
    documents: [
      { status: 'paid', country: 'IT', total: int(60) },
      { status: 'paid', country: 'FR', total: int(30) },
      { status: 'new', country: 'FR', total: int(5) },
    ],
    input: { type: 'bar', first: 'status', value: 'sum', second: 'total', series: 'country' },
  },
  {
    name: 'line-series',
    documents: [
      { day: 1, country: 'IT', total: int(10) },
      { day: 1, country: 'FR', total: int(4) },
      { day: 2, country: 'FR', total: int(6) },
      { day: 3, country: 'IT', total: int(12) },
      { day: 3, country: 'FR', total: int(2) },
    ],
    input: { type: 'line', first: 'day', value: 'sum', second: 'total', series: 'country' },
  },
  {
    name: 'bar-amounts',
    documents: [
      { kind: 'long', amount: { $numberLong: '5' } },
      { kind: 'decimal', amount: { $numberDecimal: '5' } },
      { kind: 'double', amount: { $numberDouble: '5.0' } },
    ],
    input: { type: 'bar', first: 'kind', value: 'sum', second: 'amount' },
  },
  {
    name: 'bar-status',
    documents: [
      { status: 'paid', total: int(100) },
      { status: 'paid', total: int(200) },
      { status: 'new', total: int(50) },
      { status: '', total: int(1) },
      { total: int(4) },
      { status: true, total: int(7) },
      { status: { $oid: '65f1c0de9a1b2c3d4e5f6a7b' }, total: int(3) },
    ],
    input: { type: 'bar', first: 'status' },
  },
  {
    name: 'scatter',
    documents: [
      { qty: int(2), total: { $numberDouble: '42.5' }, status: 'paid' },
      { qty: int(3), total: int(30), status: 'new' },
      { qty: int(4), total: 'not a number', status: 'paid' },
      { qty: date('2024-01-01T00:00:00Z'), total: int(5), status: 'paid' },
    ],
    input: { type: 'scatter', first: 'qty', second: 'total', series: 'status', limit: 1000 },
  },
];

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

async function record(engines: EngineService, each: Recording): Promise<void> {
  await send(engines, 'insertMany', each.name, [each.documents]);
  const input: ChartInput = { second: '', value: 'count', series: '', limit: 20, ...each.input };
  const args = {
    connection: id,
    database,
    collection: each.name,
    input: input as unknown as Json,
    source: { kind: 'filter', filter: { kind: 'empty' } },
  };
  const read = request(context, args) as ReadRequest;
  if (read.kind !== 'engine' || read.requests[0] === undefined) {
    throw new Error(`chart.draw refused the recording ${each.name}.`);
  }
  const reply = await engines.send(read.requests[0], AbortSignal.timeout(20_000));
  await writeFile(join(folder, `mongodb-8.2-chart-${each.name}.json`), `${JSON.stringify(reply, null, 2)}\n`);
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)('records the aggregations of chart.draw on MongoDB', async () => {
    const engines = createEngines();
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    try {
      await mkdir(folder, { recursive: true });
      await send(engines, 'runCommand', undefined, [{ dropDatabase: int(1) }]);
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
