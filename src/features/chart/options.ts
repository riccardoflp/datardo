/**
 * Feature: chart.options
 *
 * What a chart is made from, what each type uses of it, and what is wrong with it: the fields without the spaces
 * around them, what the type does not use dropped, and the first thing wrong with the control it marks.
 */
import { text } from './text';
import {
  chartLimits,
  isCategoryType,
  type ChartControl,
  type ChartInput,
  type ChartOptions,
  type ChartType,
} from './types';

/** The options of a chart, or the first thing wrong with them and the control it marks. */
export type ChartOptionsResult =
  | { readonly kind: 'options'; readonly options: ChartOptions }
  | { readonly kind: 'wrong'; readonly message: string; readonly control: ChartControl };

/** A field is valid when it has no space in it and does not start with `$`: `address.city` is, `first name` is not. */
export function isValidField(field: string): boolean {
  return /^[^$\s]\S*$/u.test(field.trim());
}

/** The limit as typed, as a number: `NaN` when the field is empty or holds no number. */
function limitNumber(limit: number | string): number {
  if (typeof limit === 'number') {
    return limit;
  }
  return limit.trim() === '' ? Number.NaN : Number(limit.trim());
}

function firstFieldMessage(type: ChartType): string {
  switch (type) {
    case 'histogram':
      return text.wrong.measured;
    case 'scatter':
      return text.wrong.x;
    case 'bar':
    case 'line':
    case 'pie':
      return text.wrong.category;
  }
}

function wrongWith(input: ChartInput): ChartOptionsResult | undefined {
  const { type, value } = input;
  if (!isValidField(input.first)) {
    return { kind: 'wrong', message: firstFieldMessage(type), control: 'first' };
  }
  if (type === 'scatter' && !isValidField(input.second)) {
    return { kind: 'wrong', message: text.wrong.y, control: 'second' };
  }
  if (isCategoryType(type) && value !== 'count' && !isValidField(input.second)) {
    return { kind: 'wrong', message: text.wrong.valueField[value], control: 'second' };
  }
  const usesSeries = type !== 'pie' && type !== 'histogram';
  if (usesSeries && input.series.trim() !== '' && !isValidField(input.series)) {
    return { kind: 'wrong', message: text.wrong.series, control: 'series' };
  }
  const limit = limitNumber(input.limit);
  const { name, most } = chartLimits[type];
  if (!Number.isInteger(limit) || limit < 1 || limit > most) {
    return { kind: 'wrong', message: text.wrong.limit(name, most), control: 'limit' };
  }
  return undefined;
}

/** Feature: chart.options — the options the type uses, or the first thing wrong with them. */
export function chartOptions(input: ChartInput): ChartOptionsResult {
  const wrong = wrongWith(input);
  if (wrong !== undefined) {
    return wrong;
  }
  const { type } = input;
  const category = isCategoryType(type);
  const value = category ? input.value : 'count';
  const series = type === 'pie' || type === 'histogram' ? '' : input.series.trim();
  const usesSecond = type === 'scatter' || (category && value !== 'count');
  const usesUnit = type === 'bar' || type === 'line';
  return {
    kind: 'options',
    options: {
      type,
      first: input.first.trim(),
      ...(usesSecond ? { second: input.second.trim() } : {}),
      value,
      ...(series === '' ? {} : { series }),
      ...(usesUnit && input.unit !== undefined ? { unit: input.unit } : {}),
      limit: limitNumber(input.limit),
    },
  };
}

/**
 * The limit after the type changes: the limit typed stays, unless it was the old type's first value, was empty, or is
 * above the new type's most; then it is the new type's first value.
 */
export function limitForType(limit: number | string, from: ChartType, to: ChartType): number | string {
  const typed = limitNumber(limit);
  const empty = typeof limit === 'string' && limit.trim() === '';
  if (empty || typed === chartLimits[from].first || typed > chartLimits[to].most) {
    return chartLimits[to].first;
  }
  return limit;
}

/** The input of a chart the section shows at first: a Bar, **Value** at *count*, **Top** at 20. */
export const firstInput: ChartInput = {
  type: 'bar',
  first: '',
  second: '',
  value: 'count',
  series: '',
  limit: chartLimits.bar.first,
};

/** The input after the type is chosen: the same fields, the limit as {@link limitForType} keeps it. */
export function withType(input: ChartInput, type: ChartType): ChartInput {
  return { ...input, type, limit: limitForType(input.limit, input.type, type) };
}
