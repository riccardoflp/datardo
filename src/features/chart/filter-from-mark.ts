/**
 * Feature: chart.filter-from-mark
 *
 * A click on a bar, a point of a line, a slice or a range adds its category, and its series, to the filter of the
 * query bar and shows the documents. It writes nothing to a deployment.
 */
import type { Json } from '../../shared/engine-request';
import {
  noDanger,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
  type Plan,
} from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { mongoshValue } from '../../shared/mongosh-value';
import type { Target } from '../../shared/target';
import { startArgs } from '../nav/types';
import { typedKey } from './data';
import { text } from './text';
import { isJsonDocument, type ChartType, type JsonDocument } from './types';

/** The app action that puts a filter in the query bar of a collection tab, in **Find**, and makes the filter blink. */
export const setFilterAction = 'query.set-filter';

/** The mark clicked: the condition of its category (`chart.data`), and the value of its series when there is one. */
export interface Mark {
  readonly category: Json;
  /** Absent without a series field; `null` for *(none)*. */
  readonly series?: Json;
}

/** What a click on a mark is started with. */
export interface MarkArgs {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
  /** The chart as it was drawn: its type, its first field and its series field, and **Data** when it was drawn. */
  readonly chart: {
    readonly type: ChartType;
    readonly first: string;
    readonly series?: string;
    readonly data: 'filter' | 'pipeline';
  };
  /** The filter of the query bar, as `query.parse` gives it. */
  readonly filter:
    | { readonly kind: 'empty' }
    | { readonly kind: 'value'; readonly value: Json }
    | { readonly kind: 'invalid'; readonly message: string };
  readonly mark: Mark;
}

/** Whether the marks of a chart can be clicked: a Bar, a Line, a Pie or a Histogram of the filter's documents. */
export function isClickable(type: ChartType, data: 'filter' | 'pipeline'): boolean {
  return type !== 'scatter' && data === 'filter';
}

/** A document of operators only: `{ $gte: 100 }`, not a value of a BSON type such as a date. */
function isOperators(value: Json | undefined): value is JsonDocument {
  if (!isJsonDocument(value) || typedKey(value) !== undefined) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => key.startsWith('$'));
}

/**
 * A condition merged into a filter as the query bar merges a value dropped on it: operators on a field join the
 * operators already there, a value replaces what was there.
 */
export function mergedCondition(filter: JsonDocument, field: string, condition: Json): JsonDocument {
  const before = filter[field];
  const merged = isOperators(condition) && isOperators(before) ? { ...before, ...condition } : condition;
  return { ...filter, [field]: merged };
}

/** The filter after the click: the condition of the category, then that of the series. */
export function filterAfterMark(filter: JsonDocument, args: MarkArgs): JsonDocument {
  const withCategory = mergedCondition(filter, args.chart.first, args.mark.category);
  const { series } = args.chart;
  return series === undefined || !('series' in args.mark)
    ? withCategory
    : mergedCondition(withCategory, series, args.mark.series ?? null);
}

/** The conditions a click adds, as the step says them: `status: "paid", country: "IT"`. */
function conditionsText(args: MarkArgs): string {
  const added = filterAfterMark({}, args);
  return mongoshValue(added).replace(/^\{ /u, '').replace(/ \}$/u, '');
}

function emptyPlan(): Plan {
  return {
    title: text.mark.title,
    steps: [],
    danger: noDanger,
    undo: { cannot: text.nothingRecorded },
    publishes: false,
    after: [],
  };
}

/** Feature: chart.filter-from-mark — the plan of a click on a mark, from the mark and the filter of the query bar. */
export function planFor(args: MarkArgs): Outcome {
  if (!isClickable(args.chart.type, args.chart.data)) {
    return run(emptyPlan());
  }
  const { filter } = args;
  if (filter.kind === 'invalid') {
    return refuse('chart.filter-from-mark/invalid-filter', text.mark.fixFilter(filter.message));
  }
  const before = filter.kind === 'value' ? filter.value : {};
  if (!isJsonDocument(before)) {
    return refuse('chart.filter-from-mark/invalid-filter', text.mark.fixFilter('Filter must be an object'));
  }
  const after = filterAfterMark(before, args);
  const target: Target = {
    kind: 'collection',
    connection: connectionId(args.connection),
    database: args.database,
    collection: args.collection,
  };
  const step = text.mark.step(conditionsText(args), args.collection);
  return run({
    ...emptyPlan(),
    steps: [
      {
        kind: 'app',
        text: step,
        action: setFilterAction,
        args: { ...target, filter: mongoshValue(after), filterJson: after },
      },
    ],
    after: [{ kind: 'start', feature: featureId('query.run'), target }],
  });
}

/** Feature: chart.filter-from-mark — a click on a mark of the chart drawn. */
export function plan(_context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  if (!isJsonDocument(args['chart'] as Json) || !isJsonDocument(args['mark'] as Json)) {
    return run(emptyPlan());
  }
  return planFor(args as unknown as MarkArgs);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('chart.filter-from-mark'), plan };
