/**
 * Feature: chart.show
 *
 * The Chart section of a collection tab: the type, its fields and options, **Draw**, the line of the chart and the
 * chart. `view` says what the section shows from its state; `plan` is what Go to starts: the active collection tab
 * shows its Chart section.
 */
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import type { Json } from '../../shared/engine-request';
import { featureId } from '../../shared/ids';
import { activeTabOf, type TabMemory } from '../../shared/state/tabs';
import { chartLine, typedKey, type ChartData } from './data';
import { isClickable } from './filter-from-mark';
import { chartOptions, firstInput } from './options';
import { text } from './text';
import {
  chartLimits,
  chartTypes,
  chartValues,
  dateUnits,
  type ChartControl,
  type ChartInput,
  type ChartOptions,
  type ChartType,
  type ChartValue,
  type DateUnit,
} from './types';

/** The section's tab name, as `tab.activate` takes it. */
export const chartSection = 'chart';

/** **Data**: the documents of the filter, or the output of the pipeline. */
export type ChartDataMode = 'filter' | 'pipeline';

/** A chart drawn: its options, what was drawn, how long it took, and **Data** when it was drawn. */
export interface DrawnChart {
  readonly options: ChartOptions;
  readonly data: ChartData;
  readonly milliseconds: number;
  readonly mode: ChartDataMode;
}

/** What the section is drawn from: what the tab keeps, the pipeline of the tab, and the last draw. */
export interface ChartSectionState {
  readonly input: ChartInput;
  readonly mode: ChartDataMode;
  /** The enabled stages of the pipeline, and the stage shown when it is not the last (1 for the first). */
  readonly pipeline: { readonly enabled: number; readonly upTo?: number };
  readonly drawn?: DrawnChart;
  /** Whether the aggregation runs now. */
  readonly running: boolean;
  /** The message of the server's error of the last draw. */
  readonly error?: string;
  /** Whether a draw was asked for with options that are wrong: the message is then shown and the control marked. */
  readonly checked: boolean;
}

/** A control of the second row. */
export interface ControlView {
  readonly control: ChartControl | 'unit' | 'value';
  readonly label: string;
  readonly kind: 'field' | 'choice' | 'number';
  readonly value: string;
  readonly choices?: readonly { readonly value: string; readonly label: string }[];
  readonly placeholder?: string;
  readonly hint?: string;
  readonly marked: boolean;
}

/** The chart as it is drawn. */
export interface ChartView {
  readonly data: ChartData;
  readonly type: ChartType;
  readonly role: 'img';
  readonly name: string;
  readonly categoryAxis: string;
  readonly valueAxis: string;
  readonly legend: 'none' | 'top' | 'right';
  readonly clickable: boolean;
  readonly clickHint?: string;
  readonly dimmed: boolean;
}

/** What the Chart section shows. */
export interface ChartSectionView {
  readonly types: readonly {
    readonly type: ChartType;
    readonly label: string;
    readonly hint: string;
    readonly chosen: boolean;
  }[];
  readonly data: {
    readonly label: string;
    readonly choices: readonly { readonly mode: ChartDataMode; readonly label: string; readonly chosen: boolean }[];
    readonly info?: string;
  };
  /** **Code**: the card of `codegen.show` names no place for it yet, so it carries no element. */
  readonly code: { readonly label: string };
  readonly savePicture: {
    readonly label: string;
    readonly hint: string;
    readonly enabled: boolean;
    readonly element: 'chart.save-picture@toolbar';
  };
  readonly controls: readonly ControlView[];
  readonly draw: { readonly label: string; readonly element: 'chart.draw@toolbar' };
  readonly message?: string;
  readonly line?: string;
  /** The text shown in place of the chart. */
  readonly state?: string;
  readonly chart?: ChartView;
}

/** **Data** as the section is shown: **Pipeline** coming from **Aggregate**, **Filter** coming from **Find**. */
export function modeOfQueryBar(queryMode: 'find' | 'aggregate'): ChartDataMode {
  return queryMode === 'aggregate' ? 'pipeline' : 'filter';
}

/** Whether a change draws again without **Draw**: the options are complete. */
export function isComplete(input: ChartInput): boolean {
  return chartOptions(input).kind === 'options';
}

function fieldControl(control: ChartControl, label: string, value: string, marked?: ChartControl): ControlView {
  return { control, label, kind: 'field', value, marked: marked === control };
}

function unitControl(input: ChartInput): ControlView {
  const choices = [
    { value: '', label: text.units.exact },
    ...dateUnits.map((unit) => ({ value: unit, label: text.units[unit] })),
  ];
  return {
    control: 'unit',
    label: text.controls.unit,
    kind: 'choice',
    value: input.unit ?? '',
    choices,
    marked: false,
  };
}

function valueControls(input: ChartInput, marked?: ChartControl): readonly ControlView[] {
  const choices = chartValues.map((value) => ({ value, label: text.values[value] }));
  const value: ControlView = {
    control: 'value',
    label: text.controls.value,
    kind: 'choice',
    value: input.value,
    choices,
    marked: false,
  };
  return input.value === 'count'
    ? [value]
    : [value, fieldControl('second', text.controls.valueField, input.second, marked)];
}

function seriesControl(input: ChartInput, marked?: ChartControl): ControlView {
  return {
    ...fieldControl('series', text.controls.series, input.series, marked),
    placeholder: text.controls.seriesNone,
  };
}

function limitControl(input: ChartInput, marked?: ChartControl): ControlView {
  const limit = chartLimits[input.type];
  return {
    control: 'limit',
    label: limit.name,
    kind: 'number',
    value: String(input.limit),
    hint: limit.hint,
    marked: marked === 'limit',
  };
}

/** The controls of the second row, in the order of the type. */
export function controlsOf(input: ChartInput, marked?: ChartControl): readonly ControlView[] {
  switch (input.type) {
    case 'bar':
    case 'line':
      return [
        fieldControl('first', text.controls.category, input.first, marked),
        unitControl(input),
        ...valueControls(input, marked),
        seriesControl(input, marked),
        limitControl(input, marked),
      ];
    case 'pie':
      return [
        fieldControl('first', text.controls.category, input.first, marked),
        ...valueControls(input, marked),
        limitControl(input, marked),
      ];
    case 'scatter':
      return [
        fieldControl('first', text.controls.x, input.first, marked),
        fieldControl('second', text.controls.y, input.second, marked),
        seriesControl(input, marked),
        limitControl(input, marked),
      ];
    case 'histogram':
      return [fieldControl('first', text.controls.field, input.first, marked), limitControl(input, marked)];
  }
}

function legendOf(drawn: DrawnChart): ChartView['legend'] {
  if (drawn.options.type === 'pie') {
    return 'right';
  }
  const count = drawn.data.kind === 'scatter' ? drawn.data.points.length : drawn.data.series.length;
  return count > 1 ? 'top' : 'none';
}

function chartView(drawn: DrawnChart, dimmed: boolean): ChartView {
  const { options } = drawn;
  const clickable = isClickable(options.type, drawn.mode);
  const measure = options.value === 'count' ? text.documents : text.measure(options.value, options.second ?? '');
  return {
    data: drawn.data,
    type: options.type,
    role: 'img',
    name: text.chartName,
    categoryAxis: text.axis(options.first, options.unit),
    valueAxis: options.type === 'scatter' ? (options.second ?? '') : measure,
    legend: legendOf(drawn),
    clickable,
    ...(clickable ? { clickHint: text.clickHint } : {}),
    dimmed,
  };
}

function pipelineInfo(state: ChartSectionState): string | undefined {
  if (state.mode !== 'pipeline') {
    return undefined;
  }
  return text.pipelineInfo(state.pipeline.enabled, state.pipeline.upTo);
}

/** What is shown under the controls: the message of the options, the line, and the text or the chart. */
function drawnPart(state: ChartSectionState): Pick<ChartSectionView, 'message' | 'line' | 'state' | 'chart'> {
  const options = chartOptions(state.input);
  const message = state.checked && options.kind === 'wrong' ? options.message : undefined;
  const { drawn } = state;
  if (drawn === undefined) {
    return {
      ...(message === undefined ? {} : { message }),
      ...(state.running ? {} : { state: state.error ?? text.states.choose }),
    };
  }
  const dimmed = state.running || state.error !== undefined;
  return {
    ...(message === undefined ? {} : { message }),
    line: chartLine(drawn.data, drawn.milliseconds),
    ...(state.error === undefined ? {} : { state: state.error }),
    ...(drawn.data.empty === undefined
      ? { chart: chartView(drawn, dimmed) }
      : state.error === undefined
        ? { state: drawn.data.empty }
        : {}),
  };
}

/** Feature: chart.show — what the Chart section shows. */
export function view(state: ChartSectionState): ChartSectionView {
  const options = chartOptions(state.input);
  const marked = state.checked && options.kind === 'wrong' ? options.control : undefined;
  const info = pipelineInfo(state);
  return {
    types: chartTypes.map((type) => ({ type, ...text.types[type], chosen: type === state.input.type })),
    data: {
      label: text.data.label,
      choices: [
        { mode: 'filter', label: text.data.filter, chosen: state.mode === 'filter' },
        { mode: 'pipeline', label: text.data.pipeline, chosen: state.mode === 'pipeline' },
      ],
      ...(info === undefined ? {} : { info }),
    },
    code: { label: text.code },
    savePicture: {
      label: text.savePicture,
      hint: text.savePictureHint,
      enabled: state.drawn !== undefined && state.drawn.data.empty === undefined,
      element: 'chart.save-picture@toolbar',
    },
    controls: controlsOf(state.input, marked),
    draw: { label: text.draw, element: 'chart.draw@toolbar' },
    ...drawnPart(state),
  };
}

/** The choices of the section as the tab keeps them (`TabMemory.choices`), by name. */
export function chartChoices(input: ChartInput): Readonly<Record<string, string>> {
  return {
    chartType: input.type,
    chartFirst: input.first,
    chartSecond: input.second,
    chartValue: input.value,
    chartSeries: input.series,
    chartUnit: input.unit ?? '',
    chartLimit: String(input.limit),
  };
}

/** What the tab keeps once a chart is drawn: its other memory, with the choices of the section. */
export function keptChartMemory(memory: TabMemory | undefined, input: ChartInput): TabMemory {
  return { ...memory, choices: { ...memory?.choices, ...chartChoices(input) } };
}

/** The input the tab kept, each choice that is missing or not valid as the section shows it at first. */
export function inputOfChoices(choices: Readonly<Record<string, string>> | undefined): ChartInput {
  if (choices?.['chartType'] === undefined) {
    return firstInput;
  }
  const type = chartTypes.find((each) => each === choices['chartType']) ?? firstInput.type;
  const value: ChartValue = chartValues.find((each) => each === choices['chartValue']) ?? 'count';
  const unit: DateUnit | undefined = dateUnits.find((each) => each === choices['chartUnit']);
  return {
    type,
    first: choices['chartFirst'] ?? '',
    second: choices['chartSecond'] ?? '',
    value,
    series: choices['chartSeries'] ?? '',
    ...(unit === undefined ? {} : { unit }),
    limit: choices['chartLimit'] ?? chartLimits[type].first,
  };
}

function pathsOf(value: Json, prefix: string, seen: Map<string, boolean>, depth: number): void {
  if (depth > 4 || typeof value !== 'object' || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    (value as readonly Json[]).forEach((each) => {
      pathsOf(each, prefix, seen, depth + 1);
    });
    return;
  }
  for (const [key, inner] of Object.entries(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    const document = isPlainDocument(inner);
    seen.set(path, (seen.get(path) ?? true) && document);
    if (document || Array.isArray(inner)) {
      pathsOf(inner, path, seen, depth + 1);
    }
  }
}

function isPlainDocument(value: Json): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typedKey(value) === undefined;
}

/**
 * The fields suggested in the section: with **Filter** those of the collection (`query.field-hints`), with
 * **Pipeline** those of the documents the stage shown puts out; never a field that holds only objects.
 */
export function suggestedFields(
  mode: ChartDataMode,
  hints: readonly { readonly path: string; readonly types: readonly string[] }[],
  documents: readonly Json[],
): readonly string[] {
  if (mode === 'filter') {
    return hints.filter((hint) => hint.types.some((type) => type !== 'object')).map((hint) => hint.path);
  }
  const seen = new Map<string, boolean>();
  documents.forEach((document) => {
    pathsOf(document, '', seen, 0);
  });
  return [...seen].filter(([, onlyObjects]) => !onlyObjects).map(([path]) => path);
}

/** Feature: chart.show — Go to's **Chart**: the active collection tab shows its Chart section. */
export function plan(context: Context, _answers: Answers): Outcome {
  const tab = activeTabOf(context.state.tabs);
  const empty = { danger: noDanger, undo: { cannot: text.nothingRecorded }, publishes: false, after: [] };
  if (tab?.shows.kind !== 'collection') {
    return run({ title: text.section, steps: [], ...empty });
  }
  const { collection } = tab.shows;
  return run({
    title: text.show.plan(collection),
    steps: [
      {
        kind: 'app',
        text: text.show.step(collection),
        action: 'tab.activate',
        args: { tab: tab.id, section: chartSection },
      },
    ],
    ...empty,
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('chart.show'), plan };
