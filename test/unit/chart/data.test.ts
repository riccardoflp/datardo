import { describe, expect, it } from 'vitest';
import { chartData, chartLine, dateValue, nextPeriod, rangeNumber, valueLabel } from '../../../src/features/chart/data';
import type { ChartOptions } from '../../../src/features/chart/types';
import type { Json } from '../../../src/shared/engine-request';
import { mongoshValue } from '../../../src/shared/mongosh-value';
import { chartRows, date, int } from './replies';

const barOfStatus: ChartOptions = { type: 'bar', first: 'status', value: 'count', limit: 20 };

function row(id: Json, total: number, items: readonly Json[]): Json {
  return { _id: id, total: int(total), items: items as Json };
}

function conditions(options: ChartOptions, rows: readonly Json[]): readonly string[] {
  return chartData(options, rows).conditions.map((each) => mongoshValue(each));
}

describe('chart.data', () => {
  it('draws a Bar of status: labels, one series of documents, conditions and the line', () => {
    const rows = [
      row('paid', 700, [{ v: int(700) }]),
      row('new', 300, [{ v: int(300) }]),
      row(null, 4, [{ v: int(4) }]),
    ];
    const data = chartData(barOfStatus, rows);
    expect(data.labels).toEqual(['paid', 'new', '(none)']);
    expect(data.series).toEqual([{ name: 'documents', values: [700, 300, 4] }]);
    expect(data.conditions).toEqual(['paid', 'new', null]);
    expect(data.summary).toBe('3 categories');
  });

  it('labels a month and gives its period as the condition', () => {
    const options: ChartOptions = { ...barOfStatus, first: 'createdAt', unit: 'month' };
    const rows = [row(date('2024-01-01T00:00:00.000Z'), 12, [{ v: int(12) }])];
    expect(chartData(options, rows).labels).toEqual(['2024-01']);
    expect(conditions(options, rows)).toEqual([
      '{ $gte: ISODate("2024-01-01T00:00:00.000Z"), $lt: ISODate("2024-02-01T00:00:00.000Z") }',
    ]);
  });

  it('gives one series per value of the series field, the largest first', () => {
    const options: ChartOptions = { ...barOfStatus, value: 'sum', second: 'total', series: 'country' };
    const rows = [
      row('paid', 90, [
        { s: 'IT', v: int(60) },
        { s: 'FR', v: int(30) },
      ]),
      row('new', 5, [{ s: 'FR', v: int(5) }]),
    ];
    const data = chartData(options, rows);
    expect(data.labels).toEqual(['paid', 'new']);
    expect(data.series).toEqual([
      { name: 'IT', condition: 'IT', values: [60, 0] },
      { name: 'FR', condition: 'FR', values: [30, 5] },
    ]);
  });

  it('labels the 4 ranges of a histogram over 0 to 100, with their conditions', () => {
    const options: ChartOptions = { type: 'histogram', first: 'total', value: 'count', limit: 4 };
    const bounds = { min: int(0), max: int(100), dates: false };
    const rows = [
      { _id: int(0), count: int(5), ...bounds },
      { _id: int(3), count: int(2), ...bounds },
    ];
    const data = chartData(options, rows);
    expect(data.labels).toEqual(['0 – 25', '25 – 50', '50 – 75', '75 – 100']);
    expect(data.series[0]?.values).toEqual([5, 0, 0, 2]);
    expect(conditions(options, rows)).toEqual([
      '{ $gte: 0, $lt: 25 }',
      '{ $gte: 25, $lt: 50 }',
      '{ $gte: 50, $lt: 75 }',
      '{ $gte: 75, $lte: 100 }',
    ]);
    expect(data.summary).toBe('7 documents in 4 bins');
  });

  it('draws one bar labelled with the value when the smallest and the largest are equal', () => {
    const options: ChartOptions = { type: 'histogram', first: 'total', value: 'count', limit: 4 };
    const data = chartData(options, [{ _id: int(0), count: int(7), min: int(5), max: int(5), dates: false }]);
    expect(data.labels).toEqual(['5']);
    expect(data.series[0]?.values).toEqual([7]);
    expect(data.conditions).toEqual([5]);
    expect(data.summary).toBe('7 documents in 1 bin');
  });

  it('ends the period of an hour an hour later, and that of December on the first of January', () => {
    const hour = Date.parse('2024-03-10T13:00:00.000Z');
    expect(new Date(nextPeriod(hour, 'hour')).toISOString()).toBe('2024-03-10T14:00:00.000Z');
    const december = Date.parse('2024-12-01T00:00:00.000Z');
    expect(new Date(nextPeriod(december, 'month')).toISOString()).toBe('2025-01-01T00:00:00.000Z');
    const week = Date.parse('2024-03-10T00:00:00.000Z');
    expect(new Date(nextPeriod(week, 'week')).toISOString()).toBe('2024-03-17T00:00:00.000Z');
  });

  it('draws the 12 largest of 14 series and says so in the line', () => {
    const options: ChartOptions = { ...barOfStatus, series: 'country' };
    const items = Array.from({ length: 14 }, (_, index) => ({ s: `c${String(index)}`, v: int(index + 1) }));
    const data = chartData(options, [row('paid', 105, items)]);
    expect(data.series).toHaveLength(12);
    expect(data.series[0]?.name).toBe('c13');
    expect(chartLine(data, 31)).toBe('1 category · 2 more series not shown (the 12 largest are). · 31 ms');
  });

  it('leaves no point of a Line where a series has no value, and a bar of 0 for a Bar', () => {
    const line: ChartOptions = {
      type: 'line',
      first: 'day',
      value: 'sum',
      second: 'total',
      series: 'country',
      limit: 500,
    };
    const rows = chartRows('line-series');
    expect(chartData(line, rows).series.find((each) => each.name === 'IT')?.values).toEqual([10, null, 12]);
    expect(chartData({ ...line, type: 'bar' }, rows).series.find((each) => each.name === 'IT')?.values).toEqual([
      10, 0, 12,
    ]);
  });

  it('leaves out a row of a Scatter whose y is a string, and reads dates on an axis at their time', () => {
    const options: ChartOptions = { type: 'scatter', first: 'qty', second: 'total', value: 'count', limit: 1000 };
    const rows = [...chartRows('scatter'), { x: int(4), y: 'not a number' }];
    const data = chartData(options, rows);
    expect(data.points).toEqual([
      {
        name: 'total',
        points: [
          { x: 3, y: 30 },
          { x: Date.parse('2024-01-01T00:00:00Z'), y: 5 },
          { x: 2, y: 42.5 },
        ],
      },
    ]);
    expect(data.xDates).toBe(true);
    expect(data.yDates).toBe(false);
    expect(data.summary).toBe('4 documents');
  });

  it('names the series of a Scatter by the series field, the largest first', () => {
    const options: ChartOptions = {
      type: 'scatter',
      first: 'qty',
      second: 'total',
      value: 'count',
      series: 'status',
      limit: 3,
    };
    const data = chartData(options, chartRows('scatter'));
    expect(data.points.map((each) => each.name)).toEqual(['paid', 'new']);
    expect(data.summary).toBe('3 sampled documents');
  });

  it('gives a Long, a Decimal128 and a Double of the same amount the same height', () => {
    const options: ChartOptions = { ...barOfStatus, first: 'kind', value: 'sum', second: 'amount' };
    const data = chartData(options, chartRows('bar-amounts'));
    expect(data.labels).toEqual(['decimal', 'double', 'long']);
    expect(data.series).toEqual([{ name: 'sum of amount', values: [5, 5, 5] }]);
  });

  it('reads 20 rows of the limit 20 as the top 20, and 19 rows as 19 categories', () => {
    const rows = (count: number): readonly Json[] =>
      Array.from({ length: count }, (_, index) => row(`s${String(index)}`, 1, [{ v: int(1) }]));
    expect(chartData(barOfStatus, rows(20)).summary).toBe('20 categories (the top 20)');
    expect(chartData(barOfStatus, rows(19)).summary).toBe('19 categories');
    expect(chartLine(chartData(barOfStatus, rows(20)), 31)).toBe('20 categories (the top 20) · 31 ms');
  });

  it('gives no labels and the text of the empty state for no rows', () => {
    expect(chartData(barOfStatus, [])).toMatchObject({ labels: [], empty: 'No documents to chart.' });
    expect(chartLine(chartData(barOfStatus, []), 12)).toBe('12 ms');
    expect(chartData({ type: 'scatter', first: 'qty', second: 'total', value: 'count', limit: 10 }, []).empty).toBe(
      'No documents have numbers or dates in both qty and total.',
    );
    expect(chartData({ type: 'histogram', first: 'total', value: 'count', limit: 10 }, []).empty).toBe(
      'No documents have a number or a date in total.',
    );
  });

  it('labels values of every kind (recorded from MongoDB 8.2)', () => {
    expect(chartData(barOfStatus, chartRows('bar-status')).labels).toEqual([
      'paid',
      '(none)',
      '(empty)',
      'new',
      'ObjectId("65f1c0de9a1b2c3d4e5f6a7b")',
      'true',
    ]);
    expect(valueLabel(int(42))).toBe('42');
    expect(valueLabel({})).toBe('{}');
    expect(valueLabel(date('2024-03-10T00:00:00Z'))).toBe('2024-03-10');
    expect(valueLabel(date('2024-03-10T13:05:00Z'))).toBe('2024-03-10 13:05');
    expect(valueLabel(date('2024-03-10T13:00:00Z'), 'hour')).toBe('2024-03-10 13:00');
    expect(valueLabel(date('2024-03-10T00:00:00Z'), 'year')).toBe('2024');
  });

  it('writes the numbers of ranges with four significant digits, or as 1.23e+9', () => {
    expect(rangeNumber(1234.5)).toBe('1,235');
    expect(rangeNumber(1_234_567_890)).toBe('1.23e+9');
    expect(rangeNumber(0.0001)).toBe('1.00e-4');
    expect(rangeNumber(0)).toBe('0');
  });

  it('labels ranges of dates as days when a range is a day or more (recorded from MongoDB 8.2)', () => {
    const data = chartData({ type: 'histogram', first: 'at', value: 'count', limit: 2 }, chartRows('histogram-dates'));
    expect(data.labels).toEqual(['2024-01-01 – 2024-01-05', '2024-01-05 – 2024-01-09']);
    expect(data.xDates).toBe(true);
    expect(data.conditions[1]).toEqual({
      $gte: dateValue(Date.parse('2024-01-05T00:00:00Z')),
      $lte: dateValue(Date.parse('2024-01-09T00:00:00Z')),
    });
  });
});
