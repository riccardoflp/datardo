/**
 * What the chart area decides from and gives: the types of chart, what a chart is made from (`chart.options`), the
 * documents it reads (**Data**), and the texts of the query bar and of the pipeline as `query.parse` gives them.
 */
import type { Json } from '../../shared/engine-request';

/** The types of chart, in the order of the toolbar. */
export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'histogram';

/** Every type of chart, in the order of the toolbar. */
export const chartTypes: readonly ChartType[] = ['bar', 'line', 'pie', 'scatter', 'histogram'];

/** The value of each category: how many documents, or a measure of a field. */
export type ChartValue = 'count' | 'sum' | 'avg' | 'min' | 'max';

/** Every value, in the order of **Value**. */
export const chartValues: readonly ChartValue[] = ['count', 'sum', 'avg', 'min', 'max'];

/** The unit dates of the category are grouped by (`$dateTrunc`): UTC, weeks from Sunday. */
export type DateUnit = 'hour' | 'day' | 'week' | 'month' | 'year';

/** Every unit, in the order of the control; *exact values* is no unit. */
export const dateUnits: readonly DateUnit[] = ['hour', 'day', 'week', 'month', 'year'];

/** What the controls of the section hold, as typed: the input of `chart.options`. */
export interface ChartInput {
  readonly type: ChartType;
  /** The category (Bar, Line, Pie), the x axis (Scatter) or the field measured (Histogram). */
  readonly first: string;
  /** The field of the value (Bar, Line, Pie), or the y axis (Scatter). */
  readonly second: string;
  readonly value: ChartValue;
  readonly series: string;
  /** Absent for *exact values*. */
  readonly unit?: DateUnit;
  /** **Top**, **Points**, **Sample** or **Bins**, as typed: a number, or the text of the field. */
  readonly limit: number | string;
}

/** The options a type uses, every field valid (`chart.options`). */
export interface ChartOptions {
  readonly type: ChartType;
  readonly first: string;
  /** Only for Scatter, and for a value other than `count`. */
  readonly second?: string;
  /** `count` for Scatter and Histogram. */
  readonly value: ChartValue;
  /** Never for Pie and Histogram. */
  readonly series?: string;
  /** Only for Bar and Line. */
  readonly unit?: DateUnit;
  readonly limit: number;
}

/** The limit of a type: its name, its first value, its most, and what it limits. */
export interface ChartLimit {
  readonly name: string;
  readonly first: number;
  readonly most: number;
  readonly hint: string;
}

/** The limits by type (`chart.options`). */
export const chartLimits: Readonly<Record<ChartType, ChartLimit>> = {
  bar: { name: 'Top', first: 20, most: 500, hint: 'The categories with the largest values' },
  pie: { name: 'Top', first: 10, most: 50, hint: 'The categories with the largest values' },
  line: { name: 'Points', first: 500, most: 5000, hint: 'The first points along the category' },
  scatter: { name: 'Sample', first: 1000, most: 20000, hint: 'Documents in the random sample' },
  histogram: { name: 'Bins', first: 20, most: 200, hint: 'Number of bins' },
};

/** Whether a type groups documents by a category: Bar, Line and Pie. */
export function isCategoryType(type: ChartType): boolean {
  return type === 'bar' || type === 'line' || type === 'pie';
}

/**
 * A text of the query bar or the body of a stage, as `query.parse` gives it: nothing typed, a value in canonical
 * Extended JSON, or the parser's message.
 */
export type ParsedText =
  | { readonly kind: 'empty' }
  | { readonly kind: 'value'; readonly value: Json }
  | { readonly kind: 'invalid'; readonly message: string };

/** A stage of the pipeline editor: its name (`$match`), its body as parsed, and whether it is enabled. */
export interface EditorStage {
  readonly name: string;
  readonly body: ParsedText;
  readonly enabled: boolean;
}

/**
 * The documents a chart reads (**Data**): those of the filter of the query bar, or the output of the pipeline of the
 * tab up to the stage shown (an index of `stages`, disabled stages included).
 */
export type ChartSource =
  | { readonly kind: 'filter'; readonly filter: ParsedText }
  | { readonly kind: 'pipeline'; readonly stages: readonly EditorStage[]; readonly shown: number };

/** The control of the section a message of `chart.options` marks. */
export type ChartControl = 'first' | 'second' | 'series' | 'limit';

/** A document of Extended JSON. */
export type JsonDocument = { readonly [key: string]: Json };

/** Whether a value is a document of Extended JSON (not an array, not null). */
export function isJsonDocument(value: Json | undefined): value is JsonDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
