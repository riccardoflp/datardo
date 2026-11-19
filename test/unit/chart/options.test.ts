import { describe, expect, it } from 'vitest';
import { chartOptions, firstInput, isValidField, limitForType, withType } from '../../../src/features/chart/options';
import type { ChartInput } from '../../../src/features/chart/types';

function input(overrides: Partial<ChartInput>): ChartInput {
  return { ...firstInput, ...overrides };
}

describe('chart.options', () => {
  it('drops a second field left from before on a Bar of count', () => {
    expect(chartOptions(input({ first: 'status', second: 'total' }))).toEqual({
      kind: 'options',
      options: { type: 'bar', first: 'status', value: 'count', limit: 20 },
    });
  });

  it('drops the series and the unit of a Pie', () => {
    expect(chartOptions(input({ type: 'pie', first: 'status', series: 'country', unit: 'day', limit: 10 }))).toEqual({
      kind: 'options',
      options: { type: 'pie', first: 'status', value: 'count', limit: 10 },
    });
  });

  it('takes the fields without the spaces around them', () => {
    expect(chartOptions(input({ first: ' status ' }))).toMatchObject({ options: { first: 'status' } });
  });

  it('refuses a field that starts with $', () => {
    expect(chartOptions(input({ first: '$status' }))).toEqual({
      kind: 'wrong',
      message: 'Choose the field of the categories',
      control: 'first',
    });
  });

  it('asks for the field to average', () => {
    expect(chartOptions(input({ first: 'status', value: 'avg' }))).toEqual({
      kind: 'wrong',
      message: 'Choose the field to average',
      control: 'second',
    });
  });

  it('says the limit of a Pie is from 1 to 50', () => {
    expect(chartOptions(input({ type: 'pie', first: 'status', limit: 51 }))).toEqual({
      kind: 'wrong',
      message: 'Top must be from 1 to 50',
      control: 'limit',
    });
  });

  it('keeps or replaces the limit when the type changes', () => {
    expect(withType(input({ limit: 20 }), 'pie').limit).toBe(10);
    expect(withType(input({ limit: 30 }), 'pie').limit).toBe(30);
    expect(withType(input({ limit: 300 }), 'pie').limit).toBe(10);
    expect(limitForType('', 'bar', 'line')).toBe(500);
  });

  it('gives each message of the table for its case, marking its control', () => {
    const cases: readonly (readonly [Partial<ChartInput>, string, string])[] = [
      [{ type: 'line' }, 'Choose the field of the categories', 'first'],
      [{ type: 'pie' }, 'Choose the field of the categories', 'first'],
      [{ type: 'scatter', limit: 1000 }, 'Choose the field of the x axis', 'first'],
      [{ type: 'histogram' }, 'Choose the field to measure', 'first'],
      [{ type: 'scatter', first: 'qty', limit: 1000 }, 'Choose the field of the y axis', 'second'],
      [{ first: 'status', value: 'sum' }, 'Choose the field to sum', 'second'],
      [{ first: 'status', value: 'min' }, 'Choose the field to min', 'second'],
      [{ first: 'status', value: 'max' }, 'Choose the field to max', 'second'],
      [{ first: 'status', series: '$country' }, 'The series field is not valid', 'series'],
      [{ first: 'status', limit: 501 }, 'Top must be from 1 to 500', 'limit'],
      [{ type: 'line', first: 'at', limit: 5001 }, 'Points must be from 1 to 5000', 'limit'],
      [{ type: 'scatter', first: 'qty', second: 'total', limit: 20001 }, 'Sample must be from 1 to 20000', 'limit'],
      [{ type: 'histogram', first: 'total', limit: 201 }, 'Bins must be from 1 to 200', 'limit'],
    ];
    for (const [overrides, message, control] of cases) {
      expect(chartOptions(input(overrides)), message).toEqual({ kind: 'wrong', message, control });
    }
  });

  it('refuses a limit of 0, of 2.5, or left empty', () => {
    for (const limit of [0, 2.5, '', '  ']) {
      expect(chartOptions(input({ first: 'status', limit }))).toMatchObject({ kind: 'wrong', control: 'limit' });
    }
    expect(chartOptions(input({ first: 'status', limit: '30' }))).toMatchObject({ options: { limit: 30 } });
  });

  it('takes address.city as a field and not first name', () => {
    expect(isValidField('address.city')).toBe(true);
    expect(isValidField('first name')).toBe(false);
    expect(chartOptions(input({ first: 'first name' }))).toMatchObject({ kind: 'wrong', control: 'first' });
  });

  it('never gives a Histogram a series', () => {
    const histogram = withType(input({ first: 'total', series: 'country' }), 'histogram');
    expect(chartOptions(histogram)).toEqual({
      kind: 'options',
      options: { type: 'histogram', first: 'total', value: 'count', limit: 20 },
    });
    expect(chartOptions({ ...histogram, series: '$not valid' })).toMatchObject({ kind: 'options' });
  });
});
