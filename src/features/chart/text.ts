/**
 * The text of the interface of the chart area, word for word as its cards write it (R10.1).
 */
import { groupThousands } from '../../shared/text-units';
import type { ChartType, ChartValue, DateUnit } from './types';

function count(value: number, one: string, many: string): string {
  return `${groupThousands(value)} ${value === 1 ? one : many}`;
}

/** The text of the chart area. */
export const text = {
  section: 'Chart',
  chartName: 'Chart',
  /** The names of the groups of the section for assistive technology. */
  typesLabel: 'Chart type',
  optionsLabel: 'Fields and options',
  types: {
    bar: { label: 'Bar', hint: 'Count or measure per category' },
    line: { label: 'Line', hint: 'Count or measure along a field, usually a date' },
    pie: { label: 'Pie', hint: 'Share of each category' },
    scatter: { label: 'Scatter', hint: 'Two number or date fields of a random sample of documents' },
    histogram: { label: 'Histogram', hint: 'Distribution of a number or date field' },
  } satisfies Record<ChartType, { label: string; hint: string }>,
  /** The type as a title of the Code section and a name of a picture says it: *bar chart*. */
  typeWord: { bar: 'bar', line: 'line', pie: 'pie', scatter: 'scatter', histogram: 'histogram' } satisfies Record<
    ChartType,
    string
  >,
  data: { label: 'Data', filter: 'Filter', pipeline: 'Pipeline' },
  pipelineInfo: (stages: number, upTo?: number) =>
    stages === 0
      ? 'Aggregate: no stages'
      : `Aggregate: ${count(stages, 'stage', 'stages')}${upTo === undefined ? '' : ` (up to ${String(upTo)})`}`,
  code: 'Code',
  savePicture: 'Save picture…',
  savePictureHint: 'Save the chart as a PNG image',
  draw: 'Draw',
  controls: {
    category: 'Category',
    x: 'X',
    y: 'Y',
    field: 'Field',
    value: 'Value',
    valueField: 'Field of the value',
    unit: 'Unit of the dates',
    series: 'Series',
    seriesNone: 'none',
  },
  units: {
    exact: 'exact values',
    hour: 'by hour',
    day: 'by day',
    week: 'by week',
    month: 'by month',
    year: 'by year',
  } satisfies Record<DateUnit | 'exact', string>,
  values: {
    count: 'count',
    sum: 'sum of',
    avg: 'average of',
    min: 'minimum of',
    max: 'maximum of',
  } satisfies Record<ChartValue, string>,
  wrong: {
    category: 'Choose the field of the categories',
    x: 'Choose the field of the x axis',
    measured: 'Choose the field to measure',
    y: 'Choose the field of the y axis',
    valueField: {
      sum: 'Choose the field to sum',
      avg: 'Choose the field to average',
      min: 'Choose the field to min',
      max: 'Choose the field to max',
    },
    series: 'The series field is not valid',
    limit: (name: string, most: number) => `${name} must be from 1 to ${String(most)}`,
  },
  states: {
    choose: 'Choose the fields of the chart, then Draw.',
    noDocuments: 'No documents to chart.',
    noScatter: (x: string, y: string) => `No documents have numbers or dates in both ${x} and ${y}.`,
    noHistogram: (field: string) => `No documents have a number or a date in ${field}.`,
  },
  labels: { none: '(none)', empty: '(empty)' },
  documents: 'documents',
  measure: (value: Exclude<ChartValue, 'count'>, field: string) => `${value} of ${field}`,
  axis: (field: string, unit?: DateUnit) => (unit === undefined ? field : `${field} (${unit})`),
  clickHint: 'Click to show the documents',
  tips: {
    /** What a slice of a pie says: its value and its share with one decimal, *700 (69.7%)*. */
    slice: (value: string, share: number) => `${value} (${share.toFixed(1)}%)`,
    /** What a point of a scatter chart says, *qty 2, total 42.5*, with its series before it when there are several. */
    point: (x: string, y: string, series?: string) => `${series === undefined ? '' : `${series}: `}${x}, ${y}`,
  },
  line: {
    categories: (shown: number, limit: number) =>
      `${count(shown, 'category', 'categories')}${shown >= limit ? ` (the top ${groupThousands(limit)})` : ''}`,
    points: (shown: number, limit: number) =>
      `${count(shown, 'point', 'points')}${shown >= limit ? ` (the first ${groupThousands(limit)})` : ''}`,
    sampled: (shown: number, limit: number) =>
      shown >= limit ? `${groupThousands(shown)} sampled documents` : count(shown, 'document', 'documents'),
    bins: (documents: number, bins: number) =>
      `${count(documents, 'document', 'documents')} in ${count(bins, 'bin', 'bins')}`,
    moreSeries: (more: number, most: number) =>
      `${groupThousands(more)} more series not shown (the ${String(most)} largest are).`,
    time: (ms: number) => `${groupThousands(ms)} ms`,
  },
  refusals: {
    invalidFilter: 'Invalid query syntax — check the highlighted field.',
    writes: (stage: string) => `A pipeline ending with ${stage} can't be charted: select an earlier stage.`,
    histogramVersion: (version: string) => `Histograms need MongoDB 5.0 or later: this deployment runs ${version}.`,
    unitVersion: (unit: DateUnit, version: string) =>
      `Grouping dates by ${unit} needs MongoDB 5.0 or later: this deployment runs ${version}.`,
  },
  mark: {
    title: 'Show the documents',
    fixFilter: (reason: string) => `Fix the filter first: ${reason}`,
    step: (conditions: string, collection: string) => `add ${conditions} to the filter of ${collection}`,
  },
  picture: {
    title: 'Save chart',
    commandTitle: 'Save chart as picture…',
    kind: 'PNG image',
    button: 'Save',
    plan: 'Save the chart as a picture',
    cannotUndo: 'The file is written, and deleting it is up to the user.',
    saved: (path: string) => `Saved the chart to ${path}.`,
    couldNotSave: (reason: string) => `Could not save the chart: ${reason}`,
  },
  show: {
    plan: (collection: string) => `Show the Chart section of ${collection}`,
    step: (collection: string) => `show the Chart section of ${collection}`,
  },
  nothingRecorded: 'Nothing is written to a deployment, so nothing is recorded.',
  commands: { show: 'Chart', draw: 'Draw', savePicture: 'Save chart as picture…' },
};
