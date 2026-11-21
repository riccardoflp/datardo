import { describe, expect, it } from 'vitest';
import { filterAfterMark, isClickable, plan, type MarkArgs } from '../../../src/features/chart/filter-from-mark';
import { chartData } from '../../../src/features/chart/data';
import type { Context, Outcome } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { mongoshValue } from '../../../src/shared/mongosh-value';
import { date, int } from './replies';

const context: Context = {
  feature: featureId('chart.filter-from-mark'),
  now: 1_763_400_000_000,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'app' },
  state: initialState,
};

function markArgs(overrides: Partial<MarkArgs> & Pick<MarkArgs, 'mark'>): MarkArgs {
  return {
    connection: 'c-local',
    database: 'shop',
    collection: 'orders',
    chart: { type: 'bar', first: 'status', data: 'filter' },
    filter: { kind: 'empty' },
    ...overrides,
  };
}

function filterAfter(args: MarkArgs): string {
  return mongoshValue(filterAfterMark({}, args));
}

function planned(args: MarkArgs): Outcome {
  return plan(context, { args: args });
}

describe('chart.filter-from-mark', () => {
  it('gives the filters of the six worked examples', () => {
    expect(filterAfter(markArgs({ mark: { category: 'paid' } }))).toBe('{ status: "paid" }');
    const series = markArgs({
      chart: { type: 'bar', first: 'status', series: 'country', data: 'filter' },
      mark: { category: 'paid', series: 'IT' },
    });
    expect(filterAfter(series)).toBe('{ status: "paid", country: "IT" }');
    const weeks = chartData({ type: 'bar', first: 'createdAt', value: 'count', unit: 'week', limit: 20 }, [
      { _id: date('2024-03-10T00:00:00.000Z'), total: int(1), items: [{ v: int(1) }] },
    ]);
    expect(
      filterAfter(
        markArgs({
          chart: { type: 'bar', first: 'createdAt', data: 'filter' },
          mark: { category: weeks.conditions[0] ?? null },
        }),
      ),
    ).toBe('{ createdAt: { $gte: ISODate("2024-03-10T00:00:00.000Z"), $lt: ISODate("2024-03-17T00:00:00.000Z") } }');
    const lastRange = { $gte: 75, $lte: 100 };
    expect(
      filterAfter(
        markArgs({ chart: { type: 'histogram', first: 'total', data: 'filter' }, mark: { category: lastRange } }),
      ),
    ).toBe('{ total: { $gte: 75, $lte: 100 } }');
    expect(filterAfter(markArgs({ mark: { category: null } }))).toBe('{ status: null }');
    expect(
      filterAfter(markArgs({ chart: { type: 'bar', first: 'tags', data: 'filter' }, mark: { category: 'a' } })),
    ).toBe('{ tags: "a" }');
  });

  it('plans one app step that puts the filter in the query bar of the tab; the window then runs the query', () => {
    expect(planned(markArgs({ tab: 't-3', mark: { category: 'paid' } }))).toEqual({
      kind: 'run',
      plan: {
        title: 'Show the documents',
        steps: [
          {
            kind: 'app',
            text: 'add status: "paid" to the filter of orders',
            action: 'query.set-filter',
            args: {
              connection: 'c-local',
              database: 'shop',
              collection: 'orders',
              tab: 't-3',
              filter: '{ status: "paid" }',
              filterJson: { status: 'paid' },
            },
          },
        ],
        danger: { kind: 'none' },
        undo: { cannot: 'Nothing is written to a deployment, so nothing is recorded.' },
        publishes: false,
        after: [],
      },
    });
  });

  it('adds the condition to the filter { total: { $gte: 100 } }', () => {
    const args = markArgs({
      filter: { kind: 'value', value: { total: { $gte: int(100) } } },
      mark: { category: 'paid' },
    });
    const outcome = planned(args);
    expect(outcome.kind === 'run' && outcome.plan.steps[0]?.kind === 'app' && outcome.plan.steps[0].args).toMatchObject(
      {
        filter: '{ total: { $gte: 100 }, status: "paid" }',
      },
    );
  });

  it('reads the filter of the bar as typed, and refuses one that does not parse', () => {
    const typed = { ...markArgs({ mark: { category: 'paid' } }), filter: '{ total: { $gte: 100 } }' };
    const outcome = plan(context, { args: typed });
    expect(outcome.kind === 'run' && outcome.plan.steps[0]?.kind === 'app' && outcome.plan.steps[0].args).toMatchObject(
      { filter: '{ total: { $gte: 100 }, status: "paid" }' },
    );
    const broken = { ...typed, filter: '{ status: ' };
    expect(plan(context, { args: broken })).toMatchObject({
      kind: 'refuse',
      code: 'chart.filter-from-mark/invalid-filter',
    });
  });

  it('joins operators on a field and replaces a value', () => {
    const before = { total: { $gte: int(100) }, status: 'new' };
    const histogram: MarkArgs = markArgs({
      chart: { type: 'histogram', first: 'total', data: 'filter' },
      mark: { category: { $lt: 250 } },
    });
    expect(mongoshValue(filterAfterMark(before, histogram))).toBe('{ total: { $gte: 100, $lt: 250 }, status: "new" }');
    expect(mongoshValue(filterAfterMark(before, markArgs({ mark: { category: 'paid' } })))).toBe(
      '{ total: { $gte: 100 }, status: "paid" }',
    );
  });

  it('does nothing for a chart of a pipeline or a Scatter', () => {
    expect(isClickable('bar', 'pipeline')).toBe(false);
    expect(isClickable('scatter', 'filter')).toBe(false);
    expect(isClickable('pie', 'filter')).toBe(true);
    for (const chart of [
      { type: 'bar', first: 'status', data: 'pipeline' },
      { type: 'scatter', first: 'qty', data: 'filter' },
    ] as const) {
      const outcome = planned(markArgs({ chart, mark: { category: 'paid' } }));
      expect(outcome.kind === 'run' && outcome.plan.steps).toEqual([]);
    }
  });

  it('refuses a filter that is not valid', () => {
    const args = markArgs({
      filter: { kind: 'invalid', message: 'Unexpected end of input' },
      mark: { category: 'paid' },
    });
    expect(planned(args)).toEqual({
      kind: 'refuse',
      code: 'chart.filter-from-mark/invalid-filter',
      message: 'Fix the filter first: Unexpected end of input',
    });
  });

  it('does nothing for a click on an empty part of the chart', () => {
    const outcome = plan(context, { args: { collection: 'orders' } });
    expect(outcome.kind === 'run' && outcome.plan.steps).toEqual([]);
  });

  it('writes nothing to a deployment, so it is allowed on a read-only connection', () => {
    const outcome = planned(markArgs({ mark: { category: 'paid' } }));
    expect(outcome.kind === 'run' && outcome.plan.steps.every((step) => step.kind === 'app')).toBe(true);
  });
});
