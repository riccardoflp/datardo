import { describe, expect, it } from 'vitest';
import {
  headOf,
  inputAfterAsk,
  inputChoices,
  inputJson,
  inputOf,
  keptInput,
  runOfTab,
  scanJson,
} from '../../../src/features/search/model/page';
import { runAfter, startRun } from '../../../src/features/search/model/run';
import { plan } from '../../../src/features/search/show';
import { firstInput, type SearchInput } from '../../../src/features/search/types';
import type { AppStep } from '../../../src/shared/feature';
import { tabId } from '../../../src/shared/ids';
import { initialSearchState, reduceSearch } from '../../../src/shared/state/search';
import { contextOn, local, planOf } from './context';

const mario: SearchInput = { ...firstInput, text: 'mario', database: 'shop', collections: ['orders'], read: 1000 };

describe('search.show', () => {
  it('keeps the input of the page with the tab, as one choice, and reads it back made valid', () => {
    const choices = inputChoices(mario);
    expect(Object.keys(choices)).toEqual(['search']);
    expect(keptInput(choices)).toEqual(mario);
    expect(keptInput(undefined)).toEqual(firstInput);
    expect(keptInput({ search: 'not json' })).toEqual(firstInput);
    expect(inputOf({ text: 'x', read: 7, mode: 'other', collections: ['a'] })).toEqual({
      ...firstInput,
      text: 'x',
    });
  });

  it('starts a search of the tab in the main process with what the page shows, and stops it', () => {
    const context = contextOn('search.show');
    const started = planOf(plan(context, { args: { tab: 't1', run: inputJson(mario) } }));
    expect(started.steps).toEqual([
      {
        kind: 'app',
        text: 'search “mario”',
        action: 'search.run',
        args: { tab: 't1', connection: local.id, input: inputJson(mario), fallback: 'app' },
      },
    ]);
    const stopped = planOf(plan(context, { args: { tab: 't1', stop: true } }));
    expect(stopped.steps).toEqual([
      { kind: 'app', text: 'stop the search', action: 'search.stop', args: { tab: 't1' } },
    ]);
  });

  it('keeps the choices with the tab of the page, which is opened or made active', () => {
    const steps = planOf(plan(contextOn('search.show'), { args: { choices: inputJson(mario) } })).steps as AppStep[];
    expect(steps.at(-1)?.args).toMatchObject({ memory: { choices: inputChoices(mario) } });
  });

  it('sets the scope from a node of the tree without searching; an input from open_search searches', () => {
    expect(inputAfterAsk(firstInput, { scope: { database: 'shop', collections: ['orders'] } })).toEqual({
      input: { ...firstInput, database: 'shop', collections: ['orders'] },
      start: false,
    });
    expect(inputAfterAsk(mario, { scope: { database: 'crm', collections: [] } }).input).toMatchObject({
      text: 'mario',
      database: 'crm',
      collections: [],
    });
    expect(inputAfterAsk(firstInput, { input: inputJson(mario) })).toEqual({ input: mario, start: true });
    expect(inputAfterAsk(mario, null)).toEqual({ input: mario, start: false });
  });

  it('keeps the search of a tab in the app state, a collection apart, until the tab closes', () => {
    const tab = tabId('t1');
    const run = runAfter(startRun(1, mario, 1000), {
      kind: 'listed',
      search: 1,
      collections: [{ database: 'shop', collection: 'orders', view: false }],
      at: 1100,
    });
    const [scan] = run.scans;
    if (scan === undefined) {
      throw new Error('The run has a collection.');
    }
    let state = reduceSearch(initialSearchState, {
      slice: 'search',
      type: 'run',
      tab,
      run: headOf(run),
      scans: run.scans.map(scanJson),
    });
    state = reduceSearch(state, {
      slice: 'search',
      type: 'scan',
      tab,
      index: 0,
      scan: scanJson({ ...scan, read: 300, found: 2 }),
    });
    expect(runOfTab(state.tabs[tab])?.scans[0]).toMatchObject({ read: 300, found: 2 });
    expect(runOfTab(state.tabs[tab])?.text).toBe('mario');
    state = reduceSearch(state, { slice: 'search', type: 'asked', tab, ask: { scope: { database: 'shop' } } });
    state = reduceSearch(state, { slice: 'search', type: 'asked', tab, ask: { scope: { database: 'crm' } } });
    expect(state.tabs[tab]?.ask?.number).toBe(2);
    state = reduceSearch(state, { slice: 'search', type: 'forgotten', tab });
    expect(state.tabs[tab]).toBeUndefined();
  });
});
