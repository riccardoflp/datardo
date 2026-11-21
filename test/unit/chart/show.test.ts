import { describe, expect, it } from 'vitest';
import { chartData } from '../../../src/features/chart/data';
import { firstInput } from '../../../src/features/chart/options';
import {
  chartChoices,
  controlsOf,
  inputOfChoices,
  isComplete,
  keptChartMemory,
  modeOfQueryBar,
  plan,
  suggestedFields,
  view,
  type ChartSectionState,
} from '../../../src/features/chart/show';
import type { ChartInput, ChartOptions } from '../../../src/features/chart/types';
import type { Context } from '../../../src/shared/feature';
import { connectionId, featureId, tabId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { int } from './replies';

const first: ChartSectionState = {
  input: firstInput,
  mode: 'filter',
  pipeline: { enabled: 0 },
  running: false,
  checked: false,
};

const statusInput: ChartInput = { ...firstInput, first: 'status' };
const statusOptions: ChartOptions = { type: 'bar', first: 'status', value: 'count', limit: 20 };

function drawnState(mode: 'filter' | 'pipeline' = 'filter'): ChartSectionState {
  const data = chartData(statusOptions, [{ _id: 'paid', total: int(7), items: [{ v: int(7) }] }]);
  return { ...first, input: statusInput, mode, drawn: { options: statusOptions, data, milliseconds: 31, mode } };
}

function context(withTab: boolean): Context {
  const tab = {
    id: tabId('t1'),
    shows: { kind: 'collection' as const, connection: connectionId('c-local'), database: 'shop', collection: 'orders' },
    lastActive: 0,
    loaded: true,
  };
  const tabs = withTab ? { ...initialState.tabs, tabs: [tab], active: tab.id } : initialState.tabs;
  return {
    feature: featureId('chart.show'),
    now: 1_763_400_000_000,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'app' },
    state: { ...initialState, tabs },
  };
}

describe('chart.show', () => {
  it('first shows a Bar of count, Top 20, and the text of the empty state', () => {
    const shown = view(first);
    expect(shown.types.find((each) => each.chosen)?.label).toBe('Bar');
    expect(shown.controls.map((each) => each.control)).toEqual(['first', 'unit', 'value', 'series', 'limit']);
    expect(shown.controls.find((each) => each.control === 'value')?.value).toBe('count');
    expect(shown.controls.find((each) => each.control === 'limit')).toMatchObject({ label: 'Top', value: '20' });
    expect(shown.state).toBe('Choose the fields of the chart, then Draw.');
    expect(shown.message).toBeUndefined();
    expect(shown.chart).toBeUndefined();
  });

  it('shows the field of the value only when the value is not count', () => {
    expect(controlsOf({ ...statusInput, value: 'count' }).some((each) => each.control === 'second')).toBe(false);
    expect(controlsOf({ ...statusInput, value: 'sum' }).map((each) => each.control)).toEqual([
      'first',
      'unit',
      'value',
      'second',
      'series',
      'limit',
    ]);
  });

  it('shows the controls of a Pie, a Scatter and a Histogram', () => {
    expect(controlsOf({ ...statusInput, type: 'pie', limit: 10 }).map((each) => each.control)).toEqual([
      'first',
      'value',
      'limit',
    ]);
    expect(controlsOf({ ...statusInput, type: 'scatter', limit: 1000 }).map((each) => each.label)).toEqual([
      'X',
      'Y',
      'Series',
      'Sample',
    ]);
    expect(controlsOf({ ...statusInput, type: 'histogram', limit: 20 }).map((each) => each.label)).toEqual([
      'Field',
      'Bins',
    ]);
  });

  it('sets Data to Pipeline coming from Aggregate, and to Filter coming from Find', () => {
    expect(modeOfQueryBar('aggregate')).toBe('pipeline');
    expect(modeOfQueryBar('find')).toBe('filter');
  });

  it('draws again without Draw only when the options are complete', () => {
    expect(isComplete(firstInput)).toBe(false);
    expect(isComplete(statusInput)).toBe(true);
  });

  it('shows the message and marks the control of options that are wrong, once Draw was asked for', () => {
    const shown = view({ ...first, checked: true });
    expect(shown.message).toBe('Choose the field of the categories');
    expect(shown.controls.find((each) => each.control === 'first')?.marked).toBe(true);
  });

  it('enables Save picture once a chart is drawn', () => {
    expect(view(first).savePicture).toMatchObject({ enabled: false, element: 'chart.save-picture@toolbar' });
    expect(view(drawnState()).savePicture.enabled).toBe(true);
  });

  it('draws the chart as an image named Chart, with its line, clickable for a filter', () => {
    const shown = view(drawnState());
    expect(shown.chart).toMatchObject({ role: 'img', name: 'Chart', clickable: true, legend: 'none', dimmed: false });
    expect(shown.chart?.clickHint).toBe('Click to show the documents');
    expect(shown.line).toBe('1 category · 31 ms');
    expect(shown.state).toBeUndefined();
    expect(view(drawnState('pipeline')).chart?.clickable).toBe(false);
  });

  it('dims the chart while it is drawn again and shows the error of the server', () => {
    expect(view({ ...drawnState(), running: true }).chart?.dimmed).toBe(true);
    const failed = view({ ...drawnState(), error: 'PlanExecutor error: exceeded time limit' });
    expect(failed.state).toBe('PlanExecutor error: exceeded time limit');
    expect(failed.chart?.dimmed).toBe(true);
  });

  it('shows the Code and Draw buttons by their elements', () => {
    const shown = view(first);
    expect(shown.code).toEqual({ label: 'Code' });
    expect(shown.draw).toEqual({ label: 'Draw', element: 'chart.draw@toolbar' });
  });

  it('shows the Chart section of the active collection tab', () => {
    const outcome = plan(context(true), {});
    expect(outcome.kind === 'run' && outcome.plan.steps).toEqual([
      {
        kind: 'app',
        text: 'show the Chart section of orders',
        action: 'tab.activate',
        args: { tab: 't1', section: 'chart' },
      },
    ]);
    const none = plan(context(false), {});
    expect(none.kind === 'run' && none.plan.steps).toEqual([]);
  });

  it('shows the error of a first draw in place of the text of the empty state', () => {
    expect(view({ ...first, error: 'not connected' }).state).toBe('not connected');
  });

  it('keeps the type, the fields and the options with the tab, and reads them back the same', () => {
    const input: ChartInput = {
      type: 'line',
      first: 'createdAt',
      second: 'total',
      value: 'sum',
      series: 'status',
      unit: 'month',
      limit: 50,
    };
    const memory = keptChartMemory({ query: '{}', choices: { codeLanguage: 'go' } }, input);
    expect(memory.choices).toMatchObject({ codeLanguage: 'go', chartType: 'line', chartUnit: 'month' });
    expect(memory.query).toBe('{}');
    expect(inputOfChoices(memory.choices)).toEqual({ ...input, limit: '50' });
    expect(inputOfChoices(chartChoices(statusInput))).toEqual({ ...statusInput, limit: '20' });
    expect(inputOfChoices(undefined)).toEqual(firstInput);
    expect(inputOfChoices({ chartType: 'donut' }).type).toBe('bar');
  });

  it('suggests the fields of the collection with Filter and those of the stage shown with Pipeline, never objects', () => {
    const hints = [
      { path: 'status', types: ['string'] },
      { path: 'address', types: ['object'] },
      { path: 'address.city', types: ['string'] },
      { path: 'mixed', types: ['object', 'null'] },
    ];
    expect(suggestedFields('filter', hints, [])).toEqual(['status', 'address.city', 'mixed']);
    const documents = [{ _id: 'paid', count: int(3), by: { city: 'Rome' }, items: [{ sku: 'a' }] }];
    expect(suggestedFields('pipeline', hints, documents)).toEqual(['_id', 'count', 'by.city', 'items', 'items.sku']);
  });
});
