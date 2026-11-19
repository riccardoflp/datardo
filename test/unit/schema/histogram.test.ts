import { describe, expect, it } from 'vitest';
import {
  boundValue,
  ranges,
  rangeWidth,
  roundedBound,
  type HistogramType,
} from '../../../src/features/schema/histogram';

const day = 24 * 60 * 60 * 1000;

/** `count` values spread evenly from `from` to `to`, both included. */
function spread(from: number, to: number, count: number, whole = false): readonly number[] {
  return Array.from({ length: count }, (_, index) => {
    const value = from + ((to - from) * index) / (count - 1);
    return whole ? Math.round(value) : value;
  });
}

function bounds(values: readonly number[], type: HistogramType): readonly string[] {
  return ranges(values, type).map((range) => `${String(range.from)} – ${String(range.to)}`);
}

function dateBounds(values: readonly number[]): readonly string[] {
  const iso = (value: number): string => new Date(value).toISOString().slice(0, 10);
  return ranges(values, 'date').map((range) => `${iso(range.from)} – ${iso(range.to)}`);
}

function total(values: readonly number[], type: HistogramType): number {
  return ranges(values, type).reduce((sum, range) => sum + range.count, 0);
}

describe('schema.histogram', () => {
  it('gives 100 int values from 18 to 77 a width of 5 and 13 ranges, 15 – 20 to 75 – 80', () => {
    const values = spread(18, 77, 100, true);
    expect(rangeWidth((77 - 18) / 12, 'int')).toBe(5);
    const found = bounds(values, 'int');
    expect(found).toHaveLength(13);
    expect([found[0], found.at(-1)]).toEqual(['15 – 20', '75 – 80']);
  });

  it('gives 100 double values from 1 to 37.63 a width of 5 and 8 ranges, 0 – 5 to 35 – 40', () => {
    const found = bounds(spread(1, 37.63, 100), 'double');
    expect(rangeWidth((37.63 - 1) / 12, 'double')).toBe(5);
    expect(found).toHaveLength(8);
    expect([found[0], found.at(-1)]).toEqual(['0 – 5', '35 – 40']);
  });

  it('gives int values from 1000 to 1300 a width of 50, and the same as double a width of 25', () => {
    const values = spread(1000, 1300, 31, true);
    const asInt = bounds(values, 'int');
    expect(asInt).toHaveLength(7);
    expect([asInt[0], asInt.at(-1)]).toEqual(['1000 – 1050', '1300 – 1350']);
    const asDouble = bounds(values, 'double');
    expect(asDouble).toHaveLength(13);
    expect([asDouble[0], asDouble.at(-1)]).toEqual(['1000 – 1025', '1300 – 1325']);
  });

  it('gives double values from 0.02 to 0.98 a width of 0.1 and 10 ranges, 0 – 0.1 to 0.9 – 1', () => {
    const found = bounds(spread(0.02, 0.98, 49), 'double');
    expect(found).toHaveLength(10);
    expect([found[0], found.at(-1)]).toEqual(['0 – 0.1', '0.9 – 1']);
    expect(found).toContain('0.2 – 0.3');
    expect(found).toContain('0.6 – 0.7');
  });

  it('gives 100 dates from 2024-01-01 to 2024-10-24 a width of 30 days and 11 ranges', () => {
    const values = spread(Date.UTC(2024, 0, 1), Date.UTC(2024, 9, 24), 100);
    const found = ranges(values, 'date');
    expect(found[0] === undefined ? 0 : found[0].to - found[0].from).toBe(30 * day);
    const written = dateBounds(values);
    expect(written).toHaveLength(11);
    expect([written[0], written.at(-1)]).toEqual(['2023-12-19 – 2024-01-18', '2024-10-14 – 2024-11-13']);
  });

  it('gives dates from 10:00:00 to 10:09:00 of one day 10 ranges of one minute', () => {
    const start = Date.UTC(2024, 2, 1, 10);
    const values = spread(start, start + 9 * 60_000, 10);
    const found = ranges(values, 'date');
    expect(found).toHaveLength(10);
    expect(
      found.every((range, index) => range.from === start + index * 60_000 && range.to - range.from === 60_000),
    ).toBe(true);
    expect(found.every((range) => range.count === 1)).toBe(true);
  });

  it('counts every value in exactly one range', () => {
    const cases: readonly (readonly [readonly number[], HistogramType])[] = [
      [spread(18, 77, 100, true), 'int'],
      [spread(1, 37.63, 100), 'double'],
      [spread(0.02, 0.98, 49), 'double'],
      [spread(Date.UTC(2024, 0, 1), Date.UTC(2024, 9, 24), 100), 'date'],
      [[0.1, 0.2, 0.30000000000000004, 0.4, 1.7, -3.2, 8.8], 'double'],
    ];
    for (const [values, type] of cases) {
      expect(total(values, type)).toBe(values.length);
    }
  });

  it('counts a value equal to a bound in the range that starts with it', () => {
    const found = ranges([18, 20, 25, 77], 'int');
    expect(found.find((range) => range.from === 20)?.count).toBe(1);
    expect(found.find((range) => range.from === 15)?.count).toBe(1);
    expect(found.find((range) => range.from === 25)?.count).toBe(1);
  });

  it('keeps a range without values, with the count 0', () => {
    const found = ranges([0, 100], 'int');
    expect(found.filter((range) => range.count === 0).length).toBeGreaterThan(0);
    expect(total([0, 100], 'int')).toBe(2);
  });

  it('gives int values from 1 to 15 the width 2, never 1.25 or 2.5', () => {
    const found = ranges(spread(1, 15, 15, true), 'int');
    expect(found.every((range) => range.to - range.from === 2)).toBe(true);
    expect(rangeWidth(14 / 12, 'double')).toBe(2);
    expect(rangeWidth(0.1, 'int')).toBe(1);
    expect(rangeWidth(2.2, 'int')).toBe(5);
    expect(rangeWidth(2.2, 'double')).toBe(2.5);
  });

  it('writes bounds such as 0.30000000000000004 as 0.3', () => {
    expect(roundedBound(0.1 + 0.2)).toBe(0.3);
    const found = ranges(spread(0.02, 0.98, 49), 'double');
    expect(found.map((range) => range.from)).toContain(0.3);
    expect(found.every((range) => String(range.from).length <= 4)).toBe(true);
  });

  it('gives dates 30 years apart ranges of 1,095 days', () => {
    const found = ranges([Date.UTC(1990, 0, 1), Date.UTC(2020, 0, 1)], 'date');
    expect(found[0] === undefined ? 0 : (found[0].to - found[0].from) / day).toBe(1095);
  });

  it('gives no ranges when the smallest value is not below the largest', () => {
    expect(ranges([5, 5, 5], 'int')).toEqual([]);
    expect(ranges([], 'double')).toEqual([]);
  });

  it('gives a bound as a value of its type', () => {
    expect(boundValue(15, 'int')).toEqual({ $numberInt: '15' });
    expect(boundValue(0.3, 'double')).toEqual({ $numberDouble: '0.3' });
    expect(boundValue(5_000_000_000, 'long')).toEqual({ $numberLong: '5000000000' });
    expect(boundValue(Date.UTC(2024, 0, 18), 'date')).toEqual({ $date: { $numberLong: '1705536000000' } });
  });
});
