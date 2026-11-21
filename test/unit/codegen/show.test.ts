import { describe, expect, it } from 'vitest';
import { noMakers } from '../../../src/features/aggregate/mongosh/helpers';
import {
  choicesOfCode,
  codeChoices,
  codeOfTab,
  firstChoices,
  plan,
  view,
  type CodeSectionState,
} from '../../../src/features/codegen/show';
import type { Context } from '../../../src/shared/feature';
import { connectionId, featureId, tabId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { codeQuery, type CodeResult } from '../../../src/features/codegen/source';
import { nodejsCode } from '../../../src/features/codegen/nodejs';
import { pythonCode } from '../../../src/features/codegen/python';
import { chartStages } from '../../../src/features/chart/pipeline';
import { codeLanguages, generatedCode } from '../../../src/features/codegen/types';
import { findExample, findFilter, int, lines, pipelineStages, program } from './queries';

const collectionTab = {
  id: tabId('t1'),
  shows: { kind: 'collection' as const, connection: connectionId('c-local'), database: 'shop', collection: 'orders' },
  memory: { query: '{ status: "paid" }', choices: { chartType: 'pie' } },
  lastActive: 0,
  loaded: true,
};

const context: Context = {
  feature: featureId('codegen.show'),
  now: 1_763_400_000_000,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'app' },
  state: { ...initialState, tabs: { ...initialState.tabs, tabs: [collectionTab], active: collectionTab.id } },
};

const findSource: CodeResult = {
  kind: 'code',
  query: findExample,
  database: 'shop',
  collection: 'orders',
  title: 'find',
};

function state(overrides: Partial<CodeSectionState> = {}): CodeSectionState {
  return { source: findSource, collection: 'orders', ...firstChoices(), ...overrides };
}

describe('codegen.show', () => {
  it('shows Code · orders · find and the Node.js lines of the find example at first', () => {
    const shown = view(state());
    expect(shown.title).toBe('Code · orders · find');
    expect(shown.code).toBe(nodejsCode(findExample, lines));
    expect(shown.program.checked).toBe(false);
    expect(shown.languages.tabs.find((tab) => tab.selected)?.label).toBe('Node.js');
  });

  it('shows the Python lines, then its program, when they are chosen', () => {
    expect(view(state({ language: 'python' })).code).toBe(pythonCode(findExample, lines));
    expect(view(state({ language: 'python', program: true })).code).toBe(pythonCode(findExample, program));
  });

  it('lists the languages in order, with Full program and its explanation', () => {
    const shown = view(state());
    expect(shown.languages.tabs.map((tab) => tab.label)).toEqual(['mongosh', 'Node.js', 'Python', 'Java', 'C#', 'Go']);
    expect(shown.program).toMatchObject({
      label: 'Full program',
      hint: 'Imports, connection (MONGODB_URI) and printing the results',
    });
  });

  it('titles a pipeline by its enabled stages', () => {
    const source = codeQuery({
      database: 'shop',
      collection: 'orders',
      kind: 'aggregate',
      stages: pipelineStages.map((stage, index) => {
        const [name, body] = Object.entries(stage as Record<string, never>)[0] ?? ['', null];
        return { name, body: { kind: 'value', value: body }, enabled: index !== 2 };
      }),
    });
    expect(view(state({ source })).title).toBe('Code · orders · aggregate (3 stages)');
  });

  it('shows Code · orders · bar chart with a pipeline that ends with the stages of the chart', () => {
    const chart = { type: 'bar', first: 'status', value: 'count', limit: 20 } as const;
    const source = codeQuery({
      database: 'shop',
      collection: 'orders',
      kind: 'chart',
      chart,
      source: { kind: 'filter', filter: { kind: 'empty' } },
    });
    const shown = view(state({ source, language: 'mongosh' }));
    expect(shown.title).toBe('Code · orders · bar chart');
    expect(shown.code).toContain('{ $limit: 20 }\n]);');
    expect(source.kind === 'code' && source.query.kind === 'aggregate' && source.query.pipeline).toEqual(
      chartStages(chart),
    );
  });

  it('shows the message, no code, and Copy disabled for the filter [1]', () => {
    const source = codeQuery({
      database: 'shop',
      collection: 'orders',
      kind: 'find',
      filter: { kind: 'value', value: [{ $numberInt: '1' }] },
      projection: { kind: 'empty' },
      sort: { kind: 'empty' },
    });
    const shown = view(state({ source }));
    expect(shown.message).toBe('Invalid query: Filter must be an object');
    expect(shown.code).toBeUndefined();
    expect(shown.copy.enabled).toBe(false);
  });

  it('carries the identifier of Copy', () => {
    expect(view(state()).copy).toEqual({ label: 'Copy', enabled: true, element: 'codegen.copy@toolbar' });
  });

  it('writes no connection string, user or password in any code', () => {
    for (const { language } of codeLanguages) {
      for (const target of [lines, program]) {
        const code = generatedCode(language, findExample, target);
        expect(code).not.toMatch(/mongodb:\/\/[^"]*@|password/iu);
      }
    }
  });

  it('takes the query of the bar as typed, the enabled stages of the editor, or the aggregation of a chart', () => {
    const tab = {
      database: 'shop',
      collection: 'orders',
      mode: 'find' as const,
      texts: {
        filter: "{ status: 'paid', customer: ObjectId('65f1c0de9a1b2c3d4e5f6a7b') }",
        sort: '{ createdAt: -1 }',
        project: '',
      },
      pipeline: {
        stages: [
          { name: '$match', body: "{ status: 'paid' }", enabled: true },
          { name: '$sort', body: '{ total: -1 }', enabled: false },
          { name: '$limit', body: '10', enabled: true },
        ],
      },
    };
    const find = codeOfTab({ kind: 'query' }, tab, noMakers);
    expect(find).toMatchObject({ kind: 'code', title: 'find' });
    expect(find.kind === 'code' && find.query).toEqual({
      kind: 'find',
      filter: { status: 'paid', customer: findFilter.customer },
      sort: { createdAt: int(-1) },
    });
    const aggregate = codeOfTab({ kind: 'query' }, { ...tab, mode: 'aggregate' }, noMakers);
    expect(aggregate).toMatchObject({ kind: 'code', title: 'aggregate (2 stages)' });
    const chart = { type: 'bar', first: 'status', value: 'count', limit: 20 } as const;
    const charted = codeOfTab({ kind: 'chart', options: chart, mode: 'filter' }, tab, noMakers);
    expect(charted).toMatchObject({ kind: 'code', title: 'bar chart' });
    expect(charted.kind === 'code' && charted.query.kind === 'aggregate' && charted.query.pipeline.slice(1)).toEqual(
      chartStages(chart),
    );
    const invalid = codeOfTab({ kind: 'query' }, { ...tab, texts: { ...tab.texts, filter: '[1]' } }, noMakers);
    expect(invalid).toEqual({ kind: 'invalid', message: 'Invalid query: Filter must be an object' });
  });

  it('keeps the language and Full program with the tab, and reads them back', () => {
    expect(codeChoices({ language: 'python', program: true })).toEqual({ codeLanguage: 'python', codeProgram: 'on' });
    expect(choicesOfCode({ codeLanguage: 'python', codeProgram: 'on' })).toEqual({ language: 'python', program: true });
    expect(choicesOfCode(undefined)).toEqual(firstChoices());
    expect(choicesOfCode({ codeLanguage: 'cobol' })).toEqual(firstChoices());
    const outcome = plan(context, { args: { choices: { codeLanguage: 'go', codeProgram: 'on' } } });
    const step = outcome.kind === 'run' ? outcome.plan.steps[0] : undefined;
    expect(step).toMatchObject({ action: 'tab.activate', args: { tab: 't1', section: 'code' } });
    expect(step?.kind === 'app' && step.args).toMatchObject({
      memory: { query: '{ status: "paid" }', choices: { chartType: 'pie', codeLanguage: 'go', codeProgram: 'on' } },
    });
  });
});
