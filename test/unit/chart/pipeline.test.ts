import { describe, expect, it } from 'vitest';
import { chartStages } from '../../../src/features/chart/pipeline';
import type { ChartOptions } from '../../../src/features/chart/types';
import { mongoshValue } from '../../../src/shared/mongosh-value';
import { chartData } from '../../../src/features/chart/data';
import { chartRows } from './replies';

/** The stages as the card writes them: one line of mongosh syntax each. */
function written(options: ChartOptions): readonly string[] {
  return chartStages(options).map((stage) => mongoshValue(stage));
}

const barStages = [
  '{ $unwind: { path: "$status", preserveNullAndEmptyArrays: true } }',
  '{ $group: { _id: { x: "$status" }, v: { $sum: 1 } } }',
  '{ $group: { _id: "$_id.x", total: { $sum: "$v" }, items: { $push: { s: "$_id.s", v: "$v" } } } }',
  '{ $sort: { total: -1, _id: 1 } }',
  '{ $limit: 20 }',
];

describe('chart.pipeline', () => {
  it('gives the stages of a Bar of status, count, top 20', () => {
    expect(written({ type: 'bar', first: 'status', value: 'count', limit: 20 })).toEqual(barStages);
  });

  it('groups by category and series with the sum of the field', () => {
    const stages = written({
      type: 'bar',
      first: 'status',
      second: 'total',
      value: 'sum',
      series: 'country',
      limit: 20,
    });
    expect(stages[1]).toBe('{ $group: { _id: { x: "$status", s: "$country" }, v: { $sum: "$total" } } }');
    expect(stages).toHaveLength(5);
  });

  it('truncates dates by month, and puts the periods of a Bar in order of time after the limit', () => {
    const stages = written({ type: 'bar', first: 'createdAt', value: 'count', unit: 'month', limit: 20 });
    expect(stages[1]).toBe(
      '{ $group: { _id: { x: { $dateTrunc: { date: "$createdAt", unit: "month" } } }, v: { $sum: 1 } } }',
    );
    expect(stages[5]).toBe('{ $sort: { _id: 1 } }');
  });

  it('orders a Line by category and takes its first points, with no sixth stage', () => {
    const stages = written({
      type: 'line',
      first: 'createdAt',
      second: 'total',
      value: 'avg',
      unit: 'day',
      limit: 500,
    });
    expect(stages[1]).toContain('v: { $avg: "$total" }');
    expect(stages[3]).toBe('{ $sort: { _id: 1 } }');
    expect(stages[4]).toBe('{ $limit: 500 }');
    expect(stages).toHaveLength(5);
  });

  it('gives a Pie of status the stages of the Bar with { $limit: 10 }', () => {
    expect(written({ type: 'pie', first: 'status', value: 'count', limit: 10 })).toEqual([
      ...barStages.slice(0, 4),
      '{ $limit: 10 }',
    ]);
  });

  it('samples the documents of a Scatter whose fields are numbers or dates', () => {
    expect(
      written({ type: 'scatter', first: 'qty', second: 'total', value: 'count', series: 'status', limit: 1000 }),
    ).toEqual([
      '{ $match: { qty: { $type: ["number", "date"] }, total: { $type: ["number", "date"] } } }',
      '{ $sample: { size: 1000 } }',
      '{ $project: { _id: 0, x: "$qty", y: "$total", s: "$status" } }',
    ]);
  });

  it('counts the documents of each range of a Histogram', () => {
    expect(written({ type: 'histogram', first: 'total', value: 'count', limit: 20 })).toEqual([
      '{ $match: { total: { $type: ["number", "date"] } } }',
      '{ $project: { _id: 0, v: { $toDouble: "$total" }, d: { $eq: [{ $type: "$total" }, "date"] } } }',
      '{ $setWindowFields: { output: { min: { $min: "$v" }, max: { $max: "$v" } } } }',
      '{ $group: { _id: { $min: [19, { $floor: { $multiply: [{ $divide: [{ $subtract: ["$v", "$min"] }, { $max: [{ $subtract: ["$max", "$min"] }, 1e-300] }] }, 20] } }] }, count: { $sum: 1 }, min: { $first: "$min" }, max: { $first: "$max" }, dates: { $max: "$d" } } }',
      '{ $sort: { _id: 1 } }',
    ]);
  });

  it('has no s in the $project of a Scatter without a series', () => {
    const [, , project] = chartStages({ type: 'scatter', first: 'qty', second: 'total', value: 'count', limit: 1000 });
    expect(project).toEqual({ $project: { _id: 0, x: '$qty', y: '$total' } });
  });

  it('counts a 2, b 1 and no value 1 for tags ["a", "b"], ["a"] and missing (recorded from MongoDB 8.2)', () => {
    const data = chartData({ type: 'bar', first: 'tags', value: 'count', limit: 20 }, chartRows('bar-tags'));
    expect(data.labels).toEqual(['a', '(none)', 'b']);
    expect(data.series[0]?.values).toEqual([2, 1, 1]);
  });

  it('counts 2, 0, 1 and 1 in 4 bins over 0, 10, 60 and 100: 100 is in the last range', () => {
    const data = chartData(
      { type: 'histogram', first: 'total', value: 'count', limit: 4 },
      chartRows('histogram-4-bins'),
    );
    expect(data.series[0]?.values).toEqual([2, 0, 1, 1]);
  });

  it('gives one range holding every document when the field has one value', () => {
    const data = chartData(
      { type: 'histogram', first: 'total', value: 'count', limit: 4 },
      chartRows('histogram-one-value'),
    );
    expect(data.labels).toEqual(['5']);
    expect(data.series[0]?.values).toEqual([3]);
  });

  it('gives the bars of a Bar by month in order of time, whatever their totals', () => {
    const data = chartData(
      { type: 'bar', first: 'createdAt', value: 'count', unit: 'month', limit: 20 },
      chartRows('bar-months'),
    );
    expect(data.labels).toEqual(['2024-01', '2024-02', '2024-03']);
    expect(data.series[0]?.values).toEqual([1, 3, 2]);
  });

  it('gives one category with two entries in items for two series of the same category', () => {
    const [paid] = chartRows('bar-series');
    expect(paid).toMatchObject({ _id: 'paid', items: [{ s: 'FR' }, { s: 'IT' }] });
  });

  it('holds only plain values: strings, numbers, booleans, arrays and documents', () => {
    const plain = (value: unknown): boolean =>
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      (Array.isArray(value) && value.every(plain)) ||
      (typeof value === 'object' && value !== null && Object.values(value).every(plain));
    expect(plain(chartStages({ type: 'histogram', first: 'total', value: 'count', limit: 20 }))).toBe(true);
  });
});
