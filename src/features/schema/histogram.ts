/**
 * Feature: schema.histogram
 *
 * Divides the numbers or the dates of one type of a field into about twelve ranges with round bounds: a width of 1,
 * 2, 2.5, 5 or 10 times a power of ten for numbers (never 2.5 and never below 1 for whole numbers), and a width of the
 * clock or the calendar for dates, counted from 1970-01-01 UTC.
 */
import type { Json } from '../../shared/engine-request';

/** The types a histogram is drawn of. */
export type HistogramType = 'int' | 'long' | 'double' | 'decimal' | 'date';

/** One range: `from` included, `to` excluded, as numbers (dates as milliseconds), and how many values are in it. */
export interface HistogramRange {
  readonly from: number;
  readonly to: number;
  readonly count: number;
}

/** About this many ranges: the raw width is the span divided by it. */
export const rangesWanted = 12;

const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

/** The widths of a date histogram, in order; beyond the last, a whole number of times 365 days. */
export const dateWidths: readonly number[] = [
  second,
  5 * second,
  15 * second,
  30 * second,
  minute,
  5 * minute,
  15 * minute,
  30 * minute,
  hour,
  3 * hour,
  6 * hour,
  12 * hour,
  day,
  2 * day,
  7 * day,
  14 * day,
  30 * day,
  91 * day,
  182 * day,
  365 * day,
];

/** A number rounded to 12 significant digits, so that `0.30000000000000004` is `0.3`. */
export function roundedBound(value: number): number {
  return Number(value.toPrecision(12));
}

function isWhole(type: HistogramType): boolean {
  return type === 'int' || type === 'long';
}

/** The width of the ranges for a raw width. */
export function rangeWidth(raw: number, type: HistogramType): number {
  if (type === 'date') {
    return dateWidths.find((width) => width >= raw) ?? Math.ceil(raw / (365 * day)) * 365 * day;
  }
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / magnitude;
  const whole = isWhole(type);
  const factor = [1, 2, 2.5, 5, 10].find((each) => scaled <= each && (each !== 2.5 || !whole)) ?? 10;
  const width = roundedBound(factor * magnitude);
  return whole ? Math.max(1, Math.ceil(width)) : width;
}

/** The index of the range of a value: the one whose bounds hold it, a value equal to a bound in the one it starts. */
function rangeIndex(value: number, bounds: readonly number[]): number {
  const last = bounds.length - 2;
  let index = Math.max(
    0,
    Math.min(last, Math.floor((value - (bounds[0] ?? 0)) / ((bounds[1] ?? 1) - (bounds[0] ?? 0)))),
  );
  while (index < last && value >= (bounds[index + 1] ?? Number.POSITIVE_INFINITY)) {
    index += 1;
  }
  while (index > 0 && value < (bounds[index] ?? Number.NEGATIVE_INFINITY)) {
    index -= 1;
  }
  return index;
}

/**
 * Feature: schema.histogram — the ranges of the values of one type of one field, as numbers (dates as milliseconds).
 * The values must have their smallest below their largest; otherwise there are no ranges.
 */
export function ranges(values: readonly number[], type: HistogramType): readonly HistogramRange[] {
  let smallest = Number.POSITIVE_INFINITY;
  let largest = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    smallest = Math.min(smallest, value);
    largest = Math.max(largest, value);
  }
  if (!(smallest < largest) || !Number.isFinite(largest - smallest)) {
    return [];
  }
  const width = rangeWidth((largest - smallest) / rangesWanted, type);
  const start = Math.floor(smallest / width) * width;
  const length = Math.floor((largest - start) / width) + 1;
  const bounds = Array.from({ length: length + 1 }, (_, index) =>
    type === 'date' ? start + index * width : roundedBound(start + index * width),
  );
  const counts = Array.from({ length }, () => 0);
  for (const value of values) {
    const index = rangeIndex(value, bounds);
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts.map((count, index) => ({ from: bounds[index] ?? 0, to: bounds[index + 1] ?? 0, count }));
}

/**
 * A bound as a value of the field's type, for a condition and for the Schema section: a date as a date, a whole number
 * as an `Int32` (or an `Int64` beyond it), any other number as a `Double`.
 */
export function boundValue(bound: number, type: HistogramType): Json {
  if (type === 'date') {
    return { $date: { $numberLong: String(bound) } };
  }
  if (!Number.isInteger(bound)) {
    return { $numberDouble: String(bound) };
  }
  if (Math.abs(bound) <= 2147483647) {
    return { $numberInt: String(bound) };
  }
  return Number.isSafeInteger(bound) ? { $numberLong: String(bound) } : { $numberDouble: String(bound) };
}
