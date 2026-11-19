import { describe, expect, it } from 'vitest';
import { parse, type ExplainResult } from '../../../src/features/explain/run';
import { noteOf, plan, view, type ExplainSectionState } from '../../../src/features/explain/show';
import { explainSummary } from '../../../src/features/explain/summary';
import type { Json } from '../../../src/shared/engine-request';
import type { Context } from '../../../src/shared/feature';
import { connectionId, featureId, tabId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { findSortedInMemory, findWithoutIndex } from './examples';
import { explainReply } from './replies';

const findArgs = { mode: 'find', query: { filter: '{ status: "paid" }' } };

function stateOf(result: ExplainResult | undefined, overrides: Partial<ExplainSectionState> = {}): ExplainSectionState {
  return {
    kind: result?.kind ?? 'find',
    running: false,
    cancelled: false,
    raw: false,
    toggled: [],
    readOnly: false,
    view: false,
    ...(result === undefined ? {} : { result }),
    ...overrides,
  };
}

function shownOf(output: Json, args: Json = findArgs, overrides: Partial<ExplainSectionState> = {}) {
  return view(stateOf(parse([output], args), overrides));
}

function contextOf(withTab: boolean): Context {
  const tab = {
    id: tabId('t1'),
    shows: { kind: 'collection' as const, connection: connectionId('c-local'), database: 'shop', collection: 'orders' },
    lastActive: 0,
    loaded: true,
  };
  const tabs = withTab ? { ...initialState.tabs, tabs: [tab], active: tab.id } : initialState.tabs;
  return {
    feature: featureId('explain.show'),
    now: 0,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'app' },
    state: { ...initialState, tabs },
  };
}

describe('explain.show', () => {
  it('shows COLLSCAN, the four numbers, the note, the suggested index and a plan of one row on a find without an index', () => {
    const shown = shownOf(explainReply('find-collscan'));
    expect(shown.title).toBe('Explain · find');
    expect(shown.summary?.verdict).toEqual([
      {
        text: 'COLLSCAN',
        tone: 'warning',
        icon: 'warning',
        hint: 'Every document of the collection is read: no index is used for the filter',
      },
    ]);
    expect(shown.summary?.numbers.map((number) => number.name)).toEqual([
      'returned',
      'keys examined',
      'documents examined',
      'time',
    ]);
    expect(shown.summary?.note).toBe('333 documents examined for each one returned.');
    expect(shown.summary?.suggestion).toMatchObject({ label: 'Suggested index:', keys: '{ status: 1 }' });
    expect(shown.summary?.winningPlan?.rows.map((row) => row.stage)).toEqual(['COLLSCAN']);
  });

  it('shows index status_1, no note and no suggestion, and FETCH with IXSCAN under it once the index exists', () => {
    const shown = shownOf(explainReply('find-ixscan'));
    expect(shown.summary?.verdict).toEqual([{ text: 'index status_1', tone: 'good', icon: 'check' }]);
    expect(shown.summary?.note).toBeUndefined();
    expect(shown.summary?.suggestion).toBeUndefined();
    const rows = shown.summary?.winningPlan?.rows ?? [];
    expect(rows.map((row) => [row.depth, row.stage, row.tone])).toEqual([
      [0, 'FETCH', 'plain'],
      [1, '└ IXSCAN', 'good'],
    ]);
    expect(rows[1]?.counts).toBe('120 out · 120 keys');
    expect(rows[1]?.details).toContain('indexName: "status_1"  keyPattern: { status: 1 }');
  });

  it('shows the numbers 3, 0, 1,000 and 7 ms and the note of the first worked example', () => {
    const shown = shownOf(findWithoutIndex);
    expect(shown.summary?.numbers).toEqual([
      { value: '3', name: 'returned' },
      { value: '0', name: 'keys examined' },
      { value: '1,000', name: 'documents examined' },
      { value: '7 ms', name: 'time' },
    ]);
    expect(shown.summary?.note).toBe('333 documents examined for each one returned.');
  });

  it('shows the marks of the second worked example in order, and its three rows indented', () => {
    const shown = shownOf(findSortedInMemory, {
      mode: 'find',
      query: { filter: '{ status: "paid" }', sort: '{ createdAt: -1 }' },
    });
    expect(shown.summary?.verdict.map((mark) => mark.text)).toEqual([
      'index status_1',
      'in-memory sort',
      '1 rejected plan',
    ]);
    expect(shown.summary?.winningPlan?.rows.map((row) => [row.depth, row.stage])).toEqual([
      [0, 'SORT'],
      [1, '└ FETCH'],
      [2, '└ IXSCAN'],
    ]);
    expect(shown.summary?.suggestion?.keys).toBe('{ status: 1, createdAt: -1 }');
  });

  it('gives Create… the suggested keys in their order and directions, to start index.create', () => {
    const shown = shownOf(findSortedInMemory, {
      mode: 'find',
      query: { filter: '{ status: "paid" }', sort: '{ createdAt: -1 }' },
    });
    expect(shown.summary?.suggestion?.create).toEqual({
      label: 'Create…',
      hint: 'Open the index dialog with this index ready to create',
      feature: 'index.create',
      keys: [
        { field: 'status', direction: 1 },
        { field: 'createdAt', direction: -1 },
      ],
    });
  });

  it('shows the suggestion without Create… on a read-only connection and on a view', () => {
    const readOnly = shownOf(explainReply('find-collscan'), findArgs, { readOnly: true });
    expect(readOnly.summary?.suggestion).toMatchObject({ keys: '{ status: 1 }' });
    expect(readOnly.summary?.suggestion?.create).toBeUndefined();
    const onView = shownOf(explainReply('find-collscan'), findArgs, { view: true });
    expect(onView.summary?.suggestion?.create).toBeUndefined();
  });

  it('shows a pipeline with the plan of its query and the stages after it', () => {
    const shown = shownOf(explainReply('aggregate-cursor'), { mode: 'aggregate' });
    expect(shown.title).toBe('Explain · pipeline');
    expect(shown.summary?.winningPlan?.rows.map((row) => row.stage)).toEqual(['COLLSCAN']);
    expect(shown.summary?.stagesAfterQuery?.title).toBe('Pipeline stages after the query');
    expect(shown.summary?.stagesAfterQuery?.rows.map((row) => row.name)).toEqual(['$addFields', '$sort']);
    expect(shown.summary?.stagesAfterQuery?.rows[0]?.counts).toMatch(/^3 out · ~\d+ ms$/u);
  });

  it('marks each warning and each good one by an icon as well as by its tone', () => {
    const shown = shownOf(findSortedInMemory);
    const marks = shown.summary?.verdict ?? [];
    const rows = shown.summary?.winningPlan?.rows ?? [];
    for (const each of [...marks, ...rows]) {
      expect(each.icon).toBe(each.tone === 'warning' ? 'warning' : each.tone === 'good' ? 'check' : undefined);
    }
    expect(rows.find((row) => row.stage === 'SORT')).toMatchObject({ tone: 'warning', icon: 'warning' });
  });

  it('shows the first stage plainly when there is neither a COLLSCAN nor an index', () => {
    const output: Json = { queryPlanner: { winningPlan: { stage: 'EOF' } } };
    expect(shownOf(output).summary?.verdict).toEqual([{ text: 'EOF', tone: 'plain' }]);
  });

  it('writes the note of an explain with none returned, and none under ten times', () => {
    const summary = explainSummary(findWithoutIndex);
    expect(noteOf({ ...summary, numbers: { returned: 0, docsExamined: 1000 } })).toBe(
      '1,000 documents examined, none returned.',
    );
    expect(noteOf({ ...summary, numbers: { returned: 10, docsExamined: 99 } })).toBeUndefined();
    expect(noteOf({ ...summary, numbers: { returned: 10, docsExamined: 100 } })).toBe(
      '10 documents examined for each one returned.',
    );
    expect(noteOf({ ...summary, numbers: {} })).toBeUndefined();
  });

  it('shows Running explain… with Raw disabled while the explain runs', () => {
    const shown = view(stateOf(undefined, { running: true }));
    expect(shown).toMatchObject({ running: 'Running explain…', raw: { label: 'Raw', enabled: false } });
    expect(shown.summary).toBeUndefined();
  });

  it('shows the error in place of the summary, with Raw disabled', () => {
    const result = parse([explainReply('find-collscan')], findArgs);
    const shown = view(stateOf(result, { error: 'unknown operator: $foo' }));
    expect(shown.message).toBe('unknown operator: $foo');
    expect(shown.summary).toBeUndefined();
    expect(shown.raw.enabled).toBe(false);
  });

  it('shows Cancelled and Run again after a cancel', () => {
    const shown = view(stateOf(undefined, { cancelled: true }));
    expect(shown.cancelled).toEqual({ text: 'Cancelled', runAgain: 'Run again', element: 'explain.run@query-bar' });
  });

  it('shows no verdict and no winning plan for an explain where nothing is recognized, and Raw shows it', () => {
    const output: Json = { something: 'else', ok: 1 };
    const shown = shownOf(output);
    expect(shown.summary?.verdict).toEqual([]);
    expect(shown.summary?.winningPlan).toBeUndefined();
    expect(shown.raw).toEqual({ label: 'Raw', enabled: true, element: 'explain.raw@toolbar' });
    const raw = shownOf(output, findArgs, { raw: true });
    expect(raw.raw.label).toBe('Summary');
    expect(raw.summary).toBeUndefined();
    expect(raw.output?.rows.length).toBe(4);
  });

  it('shows the summary again, the same as before, after Raw and Summary', () => {
    const result = parse([explainReply('find-ixscan-sort')], findArgs);
    const before = view(stateOf(result));
    expect(view(stateOf(result, { raw: true })).summary).toBeUndefined();
    expect(view(stateOf(result, { raw: false }))).toEqual(before);
  });

  it('shows the Explain section of the active collection tab', () => {
    const outcome = plan(contextOf(true), {});
    expect(outcome.kind === 'run' && outcome.plan.steps).toEqual([
      {
        kind: 'app',
        text: 'show the Explain section of orders',
        action: 'tab.activate',
        args: { tab: 't1', section: 'explain' },
      },
    ]);
    const none = plan(contextOf(false), {});
    expect(none.kind === 'run' && none.plan.steps).toEqual([]);
  });
});
