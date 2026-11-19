/**
 * Feature: chart.pipeline
 *
 * The aggregation stages that compute a chart, put after the filter or after the pipeline of the tab. They hold only
 * plain values, strings and numbers, so they are the same as BSON and as text.
 */
import type { Json } from '../../shared/engine-request';
import type { ChartOptions, JsonDocument } from './types';

/** The field as a path of the aggregation: `$status`. */
function path(field: string): string {
  return `$${field}`;
}

function categoryStages(options: ChartOptions): readonly JsonDocument[] {
  const field = path(options.first);
  const x: Json = options.unit === undefined ? field : { $dateTrunc: { date: field, unit: options.unit } };
  const value: Json = options.value === 'count' ? { $sum: 1 } : { [`$${options.value}`]: path(options.second ?? '') };
  const id: Json = options.series === undefined ? { x } : { x, s: path(options.series) };
  const stages: JsonDocument[] = [
    // An array counts once for each of its elements; a document without the field is kept, as no value.
    { $unwind: { path: field, preserveNullAndEmptyArrays: true } },
    { $group: { _id: id, v: value } },
    { $group: { _id: '$_id.x', total: { $sum: '$v' }, items: { $push: { s: '$_id.s', v: '$v' } } } },
    { $sort: options.type === 'line' ? { _id: 1 } : { total: -1, _id: 1 } },
    { $limit: options.limit },
  ];
  // A Bar of periods takes those with the largest totals, then puts them in order of time.
  return options.type === 'bar' && options.unit !== undefined ? [...stages, { $sort: { _id: 1 } }] : stages;
}

const numberOrDate: Json = { $type: ['number', 'date'] };

function scatterStages(options: ChartOptions): readonly JsonDocument[] {
  const y = options.second ?? '';
  return [
    { $match: { [options.first]: numberOrDate, [y]: numberOrDate } },
    { $sample: { size: options.limit } },
    {
      $project: {
        _id: 0,
        x: path(options.first),
        y: path(y),
        ...(options.series === undefined ? {} : { s: path(options.series) }),
      },
    },
  ];
}

function histogramStages(options: ChartOptions): readonly JsonDocument[] {
  const field = path(options.first);
  const bins = options.limit;
  const span: Json = { $max: [{ $subtract: ['$max', '$min'] }, 1e-300] };
  const bin: Json = { $floor: { $multiply: [{ $divide: [{ $subtract: ['$v', '$min'] }, span] }, bins] } };
  return [
    { $match: { [options.first]: numberOrDate } },
    // Dates as their milliseconds, so that numbers and dates share one scale.
    { $project: { _id: 0, v: { $toDouble: field }, d: { $eq: [{ $type: field }, 'date'] } } },
    { $setWindowFields: { output: { min: { $min: '$v' }, max: { $max: '$v' } } } },
    {
      $group: {
        // The largest value falls in the last range.
        _id: { $min: [bins - 1, bin] },
        count: { $sum: 1 },
        min: { $first: '$min' },
        max: { $first: '$max' },
        dates: { $max: '$d' },
      },
    },
    { $sort: { _id: 1 } },
  ];
}

/** Feature: chart.pipeline — the stages that compute the chart of these options. */
export function chartStages(options: ChartOptions): readonly JsonDocument[] {
  switch (options.type) {
    case 'bar':
    case 'line':
    case 'pie':
      return categoryStages(options);
    case 'scatter':
      return scatterStages(options);
    case 'histogram':
      return histogramStages(options);
  }
}
