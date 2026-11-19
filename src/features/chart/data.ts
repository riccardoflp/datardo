/**
 * Feature: chart.data
 *
 * From the documents the aggregation of `chart.pipeline` returns, in canonical Extended JSON, to what is drawn: the
 * labels, the series and their values or points, the condition of each mark for `chart.filter-from-mark`, and the
 * line of the chart.
 */
import type { Json } from '../../shared/engine-request';
import { mongoshValue } from '../../shared/mongosh-value';
import { text } from './text';
import { isJsonDocument, type ChartOptions, type DateUnit, type JsonDocument } from './types';

/** At most this many series are drawn, the largest. */
export const mostSeries = 12;

/** One series of a Bar, Line or Pie: its name, its value for the filter, and a value per label. */
export interface ChartSeries {
  readonly name: string;
  /** The condition on the series field of a mark of this series; absent without a series field. */
  readonly condition?: Json;
  /** `null` where a Line has no point. */
  readonly values: readonly (number | null)[];
}

/** One series of a Scatter: its points, dates as their time. */
export interface ScatterSeries {
  readonly name: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
}

/** What is drawn. */
export interface ChartData {
  readonly kind: 'category' | 'scatter';
  /** The labels of the categories or of the ranges. */
  readonly labels: readonly string[];
  /** The condition on the first field of the mark of each label, in canonical Extended JSON. */
  readonly conditions: readonly Json[];
  readonly series: readonly ChartSeries[];
  readonly points: readonly ScatterSeries[];
  /** Whether an axis reads dates: the categories (or x) and y. */
  readonly xDates: boolean;
  readonly yDates: boolean;
  /** The line of the chart without its time: *3 categories*; empty when there is nothing to draw. */
  readonly summary: string;
  /** The text of the empty state, when there is nothing to draw. */
  readonly empty?: string;
}

const typedKeys = new Set([
  '$oid',
  '$date',
  '$numberLong',
  '$numberDecimal',
  '$numberInt',
  '$numberDouble',
  '$binary',
  '$uuid',
  '$regularExpression',
  '$timestamp',
  '$minKey',
  '$maxKey',
  '$symbol',
  '$code',
  '$undefined',
  '$dbPointer',
]);

/** The key of a value of a BSON type in Extended JSON (`$date`, `$oid`), or undefined for any other value. */
export function typedKey(value: Json | undefined): string | undefined {
  if (!isJsonDocument(value)) {
    return undefined;
  }
  const keys = Object.keys(value);
  const [first] = keys;
  return first !== undefined && typedKeys.has(first) && (keys.length === 1 || first === '$code') ? first : undefined;
}

/** A number from a value: numbers of every type, a date as its time; `NaN` for anything else. */
export function numberOf(value: Json | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  const key = typedKey(value);
  if (key === undefined || !isJsonDocument(value)) {
    return Number.NaN;
  }
  const inner = value[key];
  if (key === '$date') {
    return typeof inner === 'string' ? Date.parse(inner) : Number(isJsonDocument(inner) ? inner['$numberLong'] : inner);
  }
  const numeric = ['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal'].includes(key);
  return numeric ? Number(inner) : Number.NaN;
}

function isDate(value: Json | undefined): boolean {
  return typedKey(value) === '$date';
}

/** A date in canonical Extended JSON. */
export function dateValue(time: number): Json {
  return { $date: { $numberLong: String(time) } };
}

/** A date as a label: by its unit, or without one as the day at midnight UTC, else with the time. */
export function dateLabel(time: number, unit?: DateUnit): string {
  const iso = new Date(time).toISOString();
  switch (unit) {
    case 'year':
      return iso.slice(0, 4);
    case 'month':
      return iso.slice(0, 7);
    case 'week':
    case 'day':
      return iso.slice(0, 10);
    case 'hour':
      return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
    case undefined:
      return iso.endsWith('T00:00:00.000Z')
        ? iso.slice(0, 10)
        : iso
            .replace('T', ' ')
            .replace(/:00\.000Z$|\.000Z$/u, '')
            .replace(/Z$/u, '');
  }
}

/** A category or a series value as a label: *(none)*, *(empty)*, a string, a date by the unit, or mongosh syntax. */
export function valueLabel(value: Json | undefined, unit?: DateUnit): string {
  if (value === null || value === undefined) {
    return text.labels.none;
  }
  if (typeof value === 'string') {
    return value === '' ? text.labels.empty : value;
  }
  const time = numberOf(value);
  return isDate(value) && Number.isFinite(time) ? dateLabel(time, unit) : mongoshValue(value);
}

/** The start of the next period, for a period of a unit that starts at `time` (UTC, weeks from Sunday). */
export function nextPeriod(time: number, unit: DateUnit): number {
  const date = new Date(time);
  switch (unit) {
    case 'year':
      return Date.UTC(date.getUTCFullYear() + 1, 0, 1);
    case 'month':
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    case 'week':
      return time + 7 * 86_400_000;
    case 'day':
      return time + 86_400_000;
    case 'hour':
      return time + 3_600_000;
  }
}

/** The condition of a category: its value, `null` for *(none)*, or with a unit its period. */
function categoryCondition(value: Json | undefined, unit?: DateUnit): Json {
  const time = numberOf(value);
  if (unit === undefined || !isDate(value) || !Number.isFinite(time)) {
    return value ?? null;
  }
  return { $gte: dateValue(time), $lt: dateValue(nextPeriod(time, unit)) };
}

/** A number of a range of a histogram: four significant digits, or as `1.23e+9` from a billion and below a thousandth. */
export function rangeNumber(value: number): string {
  const size = Math.abs(value);
  if (size !== 0 && (size >= 1e9 || size < 1e-3)) {
    return value.toExponential(2);
  }
  return value.toLocaleString('en-US', { maximumSignificantDigits: 4 });
}

function documentsOf(rows: readonly Json[]): readonly JsonDocument[] {
  return rows.filter(isJsonDocument);
}

/** Feature: chart.data — what is drawn for these options from the rows of the aggregation. */
export function chartData(options: ChartOptions, rows: readonly Json[]): ChartData {
  const documents = documentsOf(rows);
  switch (options.type) {
    case 'histogram':
      return histogramData(options, documents);
    case 'scatter':
      return scatterData(options, documents);
    case 'bar':
    case 'line':
    case 'pie':
      return categoryData(options, documents);
  }
}

const nothing: ChartData = {
  kind: 'category',
  labels: [],
  conditions: [],
  series: [],
  points: [],
  xDates: false,
  yDates: false,
  summary: '',
};

function histogramData(options: ChartOptions, rows: readonly JsonDocument[]): ChartData {
  const [first] = rows;
  if (first === undefined) {
    return { ...nothing, empty: text.states.noHistogram(options.first) };
  }
  const min = numberOf(first['min']);
  const max = numberOf(first['max']);
  const bins = options.limit;
  const width = (max - min) / bins;
  const counts = Array.from({ length: bins }, () => 0);
  for (const row of rows) {
    const bin = numberOf(row['_id']);
    if (bin >= 0 && bin < bins) {
      counts[bin] = numberOf(row['count']);
    }
  }
  const dates = first['dates'] === true;
  const label = (value: number): string =>
    dates ? dateLabel(value, width >= 86_400_000 ? 'day' : 'hour') : rangeNumber(value);
  const bound = (value: number): Json => (dates ? dateValue(value) : value);
  const documents = counts.reduce((sum, each) => sum + each, 0);
  const base = { ...nothing, xDates: dates };
  if (width === 0) {
    const series = [{ name: text.documents, values: [documents] }];
    return { ...base, labels: [label(min)], conditions: [bound(min)], series, summary: text.line.bins(documents, 1) };
  }
  const start = (index: number): number => min + index * width;
  const last = bins - 1;
  return {
    ...base,
    labels: counts.map((_, index) => `${label(start(index))} – ${label(index === last ? max : start(index + 1))}`),
    conditions: counts.map((_, index) =>
      index === last
        ? { $gte: bound(start(index)), $lte: bound(max) }
        : { $gte: bound(start(index)), $lt: bound(start(index + 1)) },
    ),
    series: [{ name: text.documents, values: counts }],
    summary: text.line.bins(documents, bins),
  };
}

function seriesNote(count: number): string | undefined {
  return count > mostSeries ? text.line.moreSeries(count - mostSeries, mostSeries) : undefined;
}

function joined(...parts: readonly (string | undefined)[]): string {
  return parts.filter((part): part is string => part !== undefined && part !== '').join(' · ');
}

function scatterData(options: ChartOptions, rows: readonly JsonDocument[]): ChartData {
  const y = options.second ?? '';
  const groups = new Map<string, { x: number; y: number }[]>();
  let xDates = false;
  let yDates = false;
  for (const row of rows) {
    const point = { x: numberOf(row['x']), y: numberOf(row['y']) };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      continue;
    }
    xDates ||= isDate(row['x']);
    yDates ||= isDate(row['y']);
    const name = options.series === undefined ? y : valueLabel(row['s']);
    groups.set(name, [...(groups.get(name) ?? []), point]);
  }
  if (groups.size === 0) {
    return { ...nothing, kind: 'scatter', empty: text.states.noScatter(options.first, y) };
  }
  const all = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const summary = joined(text.line.sampled(rows.length, options.limit), seriesNote(all.length));
  const points = all.slice(0, mostSeries).map(([name, each]) => ({ name, points: each }));
  return { ...nothing, kind: 'scatter', points, xDates, yDates, summary };
}

interface SeriesTotal {
  readonly condition: Json;
  total: number;
}

function categoryData(options: ChartOptions, rows: readonly JsonDocument[]): ChartData {
  if (rows.length === 0) {
    return { ...nothing, empty: text.states.noDocuments };
  }
  const totals = new Map<string, SeriesTotal>();
  const byCategory = rows.map((row) => categoryValues(options, row, totals));
  const names = [...totals.entries()].sort((a, b) => b[1].total - a[1].total);
  const shown = names.slice(0, mostSeries);
  const measure = options.value === 'count' ? text.documents : text.measure(options.value, options.second ?? '');
  const missing = options.type === 'line' ? null : 0;
  const series: ChartSeries[] =
    options.series === undefined
      ? [{ name: measure, values: byCategory.map((values) => values.get('') ?? missing) }]
      : shown.map(([name, { condition }]) => ({
          name,
          condition,
          values: byCategory.map((values) => values.get(name) ?? missing),
        }));
  const count =
    options.type === 'line'
      ? text.line.points(rows.length, options.limit)
      : text.line.categories(rows.length, options.limit);
  return {
    ...nothing,
    labels: rows.map((row) => valueLabel(row['_id'], options.unit)),
    conditions: rows.map((row) => categoryCondition(row['_id'], options.unit)),
    series,
    xDates: rows.some((row) => isDate(row['_id'])),
    summary: joined(count, options.series === undefined ? undefined : seriesNote(names.length)),
  };
}

/** The values of one category by series name (`''` without a series field), adding to the totals of the series. */
function categoryValues(
  options: ChartOptions,
  row: JsonDocument,
  totals: Map<string, SeriesTotal>,
): ReadonlyMap<string, number> {
  const values = new Map<string, number>();
  const items = row['items'];
  for (const item of Array.isArray(items) ? (items as readonly Json[]) : []) {
    const value = isJsonDocument(item) ? numberOf(item['v']) : Number.NaN;
    if (!isJsonDocument(item) || !Number.isFinite(value)) {
      continue;
    }
    const name = options.series === undefined ? '' : valueLabel(item['s']);
    values.set(name, value);
    const total = totals.get(name) ?? { condition: item['s'] ?? null, total: 0 };
    total.total += Math.abs(value);
    totals.set(name, total);
  }
  return values;
}

/** The line of the chart: what was drawn, the note about series, and the time, joined by ` · `. */
export function chartLine(data: ChartData, milliseconds: number): string {
  return joined(data.summary, text.line.time(milliseconds));
}
