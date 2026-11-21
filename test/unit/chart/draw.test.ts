import { describe, expect, it } from 'vitest';
import { chartTimeLimitMs, parse, request } from '../../../src/features/chart/draw';
import { chartStages } from '../../../src/features/chart/pipeline';
import type { ChartInput, ChartSource, EditorStage } from '../../../src/features/chart/types';
import type { MongoServerInfo } from '../../../src/shared/connection';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { Context, Outcome, ReadRequest } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { chartRows, date, int } from './replies';

function contextOn(version?: string): Context {
  const server: MongoServerInfo | undefined =
    version === undefined ? undefined : { engine: 'mongodb', version, topology: { kind: 'standalone' }, hosts: [] };
  const live = server === undefined ? {} : { 'c-local': { state: 'connected' as const, server } };
  return {
    feature: featureId('chart.draw'),
    now: 1_763_400_000_000,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'app' },
    state: { ...initialState, connections: { ...initialState.connections, live } },
  };
}

const bar: ChartInput = { type: 'bar', first: 'status', second: '', value: 'count', series: '', limit: 20 };
const totalAtLeast100: Json = { total: { $gte: int(100) } };

function args(input: ChartInput, source: ChartSource): Json {
  return { connection: 'c-local', database: 'shop', collection: 'orders', input, source } as unknown as Json;
}

function filterOf(filter: Json): ChartSource {
  return { kind: 'filter', filter: { kind: 'value', value: filter } };
}

function sent(outcome: ReadRequest | Outcome): MongoRequest {
  if (outcome.kind !== 'engine') {
    throw new Error(`Expected a request, got ${JSON.stringify(outcome)}`);
  }
  const first = outcome.requests[0]?.request;
  if (first?.engine !== 'mongodb') {
    throw new Error('Expected a request to MongoDB.');
  }
  return first;
}

function stage(name: string, enabled = true): EditorStage {
  return { name, body: { kind: 'value', value: name === '$limit' ? int(5) : {} }, enabled };
}

describe('chart.draw', () => {
  it('sends the $match of the filter followed by the five stages of the chart', () => {
    const request_ = sent(request(contextOn('8.2.5'), args(bar, filterOf(totalAtLeast100))));
    expect(request_).toMatchObject({ database: 'shop', collection: 'orders', method: 'aggregate' });
    const [pipeline, options] = request_.arguments;
    const stages = chartStages({ type: 'bar', first: 'status', value: 'count', limit: 20 });
    expect(pipeline).toEqual([{ $match: totalAtLeast100 }, ...stages]);
    expect(options).toEqual({ allowDiskUse: true, maxTimeMS: 120_000 });
    expect(request_.timeLimitMs).toBe(chartTimeLimitMs);
    expect(request_.limit).toBe(20);
  });

  it('sends the $unwind first with an empty filter', () => {
    for (const source of [filterOf({}), { kind: 'filter', filter: { kind: 'empty' } } as const]) {
      const [pipeline] = sent(request(contextOn(), args(bar, source))).arguments;
      expect((pipeline as readonly Json[])[0]).toEqual({
        $unwind: { path: '$status', preserveNullAndEmptyArrays: true },
      });
    }
  });

  it('starts with the enabled stages of the pipeline up to the stage shown', () => {
    const stages = [stage('$match'), stage('$sort', false), stage('$limit'), stage('$project')];
    const [pipeline] = sent(request(contextOn(), args(bar, { kind: 'pipeline', stages, shown: 2 }))).arguments;
    expect((pipeline as readonly Json[]).slice(0, 3)).toEqual([
      { $match: {} },
      { $limit: int(5) },
      { $unwind: { path: '$status', preserveNullAndEmptyArrays: true } },
    ]);
  });

  it('sends nothing for a pipeline shown up to a $out or a $merge stage', () => {
    const source = (name: string): ChartSource => ({
      kind: 'pipeline',
      stages: [stage('$match'), stage(name)],
      shown: 1,
    });
    expect(request(contextOn(), args(bar, source('$out')))).toEqual({
      kind: 'refuse',
      code: 'chart.draw/writes',
      message: "A pipeline ending with $out can't be charted: select an earlier stage.",
    });
    expect(request(contextOn(), args(bar, source('$merge')))).toMatchObject({ code: 'chart.draw/writes' });
  });

  it('sends nothing for a filter that does not parse, or a stage that does not', () => {
    const invalid: ChartSource = { kind: 'filter', filter: { kind: 'invalid', message: 'Unexpected end of input' } };
    expect(request(contextOn(), args(bar, invalid))).toEqual({
      kind: 'refuse',
      code: 'chart.draw/invalid-filter',
      message: 'Invalid query syntax — check the highlighted field.',
    });
    const badStage: EditorStage = {
      name: '$match',
      body: { kind: 'invalid', message: 'Unexpected token' },
      enabled: true,
    };
    expect(request(contextOn(), args(bar, { kind: 'pipeline', stages: [badStage], shown: 0 }))).toMatchObject({
      code: 'chart.draw/invalid-stage',
    });
  });

  it('sends nothing for options that are missing or wrong', () => {
    expect(request(contextOn(), args({ ...bar, first: '' }, filterOf({})))).toEqual({
      kind: 'refuse',
      code: 'chart.draw/options',
      message: 'Choose the field of the categories',
    });
  });

  it('refuses a histogram and dates by a unit on MongoDB 4.4, and draws a Bar of status', () => {
    const histogram: ChartInput = { ...bar, type: 'histogram', first: 'total' };
    expect(request(contextOn('4.4.29'), args(histogram, filterOf({})))).toEqual({
      kind: 'refuse',
      code: 'chart.draw/unsupported',
      message: 'Histograms need MongoDB 5.0 or later: this deployment runs 4.4.',
    });
    expect(request(contextOn('4.4.29'), args({ ...bar, first: 'createdAt', unit: 'month' }, filterOf({})))).toEqual({
      kind: 'refuse',
      code: 'chart.draw/unsupported',
      message: 'Grouping dates by month needs MongoDB 5.0 or later: this deployment runs 4.4.',
    });
    expect(request(contextOn('4.4.29'), args(bar, filterOf({}))).kind).toBe('engine');
    expect(request(contextOn('5.0.0'), args(histogram, filterOf({}))).kind).toBe('engine');
  });

  it('gives what is drawn from the documents of the reply (recorded from MongoDB 8.2)', () => {
    const months: ChartInput = { ...bar, first: 'createdAt', unit: 'month' };
    const data = parse([chartRows('bar-months')], args(months, filterOf({})));
    expect(data.labels).toEqual(['2024-01', '2024-02', '2024-03']);
    expect(data.conditions[0]).toEqual({
      $gte: date('2024-01-01T00:00:00.000Z'),
      $lt: date('2024-02-01T00:00:00.000Z'),
    });
  });

  it('reads the filter of the bar and the pipeline of the editor as they are typed', () => {
    const typed = { connection: 'c-local', database: 'shop', collection: 'orders', input: bar } as const;
    const filter = { ...typed, data: 'filter', filter: '{ total: { $gte: 100 } }' } as unknown as Json;
    const [fromFilter] = sent(request(contextOn(), filter)).arguments;
    expect((fromFilter as readonly Json[])[0]).toEqual({ $match: totalAtLeast100 });
    const editor = {
      stages: [
        { name: '$match', body: '{ total: { $gte: 100 } }', enabled: true },
        { name: '$limit', body: '5', enabled: true },
        { name: '$project', body: '{ x: 1 }', enabled: true },
      ],
      shown: 1,
    };
    const pipeline = { ...typed, data: 'pipeline', pipeline: editor } as unknown as Json;
    const [fromPipeline] = sent(request(contextOn(), pipeline)).arguments;
    expect((fromPipeline as readonly Json[]).slice(0, 3)).toEqual([
      { $match: totalAtLeast100 },
      { $limit: int(5) },
      { $unwind: { path: '$status', preserveNullAndEmptyArrays: true } },
    ]);
    const wrong = { ...typed, data: 'filter', filter: '{ status: ' } as unknown as Json;
    expect(request(contextOn(), wrong)).toMatchObject({ kind: 'refuse', code: 'chart.draw/invalid-filter' });
  });
});
