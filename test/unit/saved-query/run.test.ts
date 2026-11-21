import { describe, expect, it } from 'vitest';
import { plan as choosePlan } from '../../../src/features/saved-query/choose-folder';
import { plan as revealPlan } from '../../../src/features/saved-query/reveal-file';
import { plan } from '../../../src/features/saved-query/run';
import { queryJson, savedRef } from '../../../src/features/saved-query/types';
import { tabId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import type { Tab } from '../../../src/shared/state/tabs';
import { redisConnection, stateWith } from '../connection/context';
import {
  answersWith,
  appArgs,
  appState,
  bare,
  contextOn,
  find,
  inFolder,
  listOf,
  local,
  pipeline,
  planOf,
  production,
  repoFolder,
  stepTexts,
} from './harness';

function withTabs(tabs: readonly Tab[], active?: string): AppState {
  const state = appState();
  return { ...state, tabs: { ...state.tabs, tabs, ...(active === undefined ? {} : { active: tabId(active) }) } };
}

function collectionTab(id: string, collection = 'orders'): Tab {
  return {
    id: tabId(id),
    shows: { kind: 'collection', connection: local.id, database: 'shop', collection },
    lastActive: 1,
    loaded: true,
  };
}

const paidThisMonth = find('{ status: "paid" }', '{ createdAt: -1 }', '');

describe('saved-query.run', () => {
  it('replaces the filter, the sort and the projection of the tab with the three texts as saved, and runs the first page', () => {
    const context = contextOn('saved-query.run', undefined, withTabs([collectionTab('t1')], 't1'));
    const outcome = plan(context, answersWith({ query: queryJson(paidThisMonth), name: 'Paid this month' }));
    expect(stepTexts(outcome)).toEqual(['set the query of orders to "Paid this month"']);
    expect(appArgs(outcome, 'saved-query.load')).toEqual({
      connection: 'c-local',
      database: 'shop',
      collection: 'orders',
      tab: 't1',
      query: { kind: 'find', filter: '{ status: "paid" }', sort: '{ createdAt: -1 }', projection: '' },
    });
    // The window shows the query in the tab and runs its first page, as its run button does (`query.run`).
    expect(planOf(outcome).after).toEqual([]);
  });

  it('switches to the pipeline editor with its stages, disabled ones disabled, and runs the whole pipeline', () => {
    const stages = pipeline(['$match', '{}'], ['$sort', '{ a: 1 }', false]);
    const outcome = plan(
      contextOn('saved-query.run', undefined, withTabs([collectionTab('t1')], 't1')),
      answersWith({ query: queryJson(stages) }),
    );
    expect(stepTexts(outcome)).toEqual(['set the query of orders to aggregate $match']);
    // The window switches the tab to Aggregate with the whole pipeline shown, and runs it (`aggregate.run`).
    expect(appArgs(outcome, 'saved-query.load')['query']).toEqual(queryJson(stages));
  });

  it('leaves aggregate.run to hand a pipeline ending with $out to aggregate.write-output, and writes nothing itself', () => {
    const outcome = plan(contextOn('saved-query.run'), answersWith({ query: queryJson(pipeline(['$out', '"copy"'])) }));
    expect(planOf(outcome).steps.every((step) => step.kind === 'app')).toBe(true);
    expect(planOf(outcome).after).toEqual([]);
  });

  it('opens a tab of shop.orders when none is open, from Go to', () => {
    const outcome = plan(
      contextOn('saved-query.run', undefined, withTabs([collectionTab('t2', 'sales')], 't2')),
      answersWith({ query: queryJson(paidThisMonth) }),
    );
    // With no tab named, the main process opens the tab of shop.orders and loads the query there.
    expect(appArgs(outcome, 'saved-query.load')['tab']).toBeUndefined();
    expect(appArgs(outcome, 'saved-query.load')).toMatchObject({ database: 'shop', collection: 'orders' });
  });

  it('fills a filter that is not valid mongosh as it is: query.run marks it as invalid and sends nothing', () => {
    const outcome = plan(contextOn('saved-query.run'), answersWith({ query: queryJson(find('{ a: ')) }));
    expect(appArgs(outcome, 'saved-query.load')['query']).toMatchObject({ filter: '{ a: ' });
  });

  it('reads the query of a pin of a file in the folder from the list, and runs nothing when the file is gone', () => {
    const file = inFolder('Paid', 'paid.json');
    const answers = answersWith({ saved: savedRef(file) });
    expect(plan(contextOn('saved-query.run'), answers)).toMatchObject({ kind: 'read', need: { key: 'list' } });
    expect(stepTexts(plan(contextOn('saved-query.run'), { ...answers, list: listOf([file]) }))).toEqual([
      'set the query of orders to "Paid"',
    ]);
    expect(planOf(plan(contextOn('saved-query.run'), { ...answers, list: listOf([]) })).steps).toEqual([]);
  });
});

describe('saved-query.reveal-file', () => {
  it('reveals the file of a query in the folder in the file manager', () => {
    const outcome = revealPlan(
      contextOn('saved-query.reveal-file'),
      answersWith({ saved: savedRef(inFolder('Paid', 'paid.json')) }),
    );
    expect(stepTexts(outcome)).toEqual([`reveal ${repoFolder}\\shop\\orders\\paid.json in the file manager`]);
    expect(appArgs(outcome, 'saved-query.reveal')).toEqual({
      queriesFolder: repoFolder,
      file: 'shop/orders/paid.json',
    });
  });

  it('reveals shop/orders/broken.json from the warning about it', () => {
    const context = {
      ...contextOn('saved-query.reveal-file'),
      target: { kind: 'connection' as const, connection: local.id },
    };
    const outcome = revealPlan(context, { args: { connection: local.id, file: 'shop/orders/broken.json' } });
    expect(appArgs(outcome, 'saved-query.reveal')).toEqual({
      queriesFolder: repoFolder,
      file: 'shop/orders/broken.json',
    });
  });

  it('reveals nothing for a query for me, a path out of the folder, or a connection with no queries folder', () => {
    expect(
      planOf(revealPlan(contextOn('saved-query.reveal-file'), answersWith({ saved: { place: 'me', name: 'Paid' } })))
        .steps,
    ).toEqual([]);
    expect(
      planOf(revealPlan(contextOn('saved-query.reveal-file'), answersWith({ file: '../secret.json' }))).steps,
    ).toEqual([]);
    expect(
      planOf(revealPlan(contextOn('saved-query.reveal-file'), answersWith({ connection: bare.id, file: 'a.json' })))
        .steps,
    ).toEqual([]);
  });

  it('works on a macOS path as well', () => {
    const state = stateWith([{ ...local, queriesFolder: '/Users/ada/repo/.mongoster/queries/' }]);
    const context = { ...contextOn('saved-query.reveal-file', undefined, state), platform: 'macos' as const };
    expect(stepTexts(revealPlan(context, answersWith({ file: 'shop/orders/paid.json' })))).toEqual([
      'reveal /Users/ada/repo/.mongoster/queries/shop/orders/paid.json in the file manager',
    ]);
  });
});

describe('saved-query.choose-folder', () => {
  it('asks the folder in the dialog titled Queries folder of Local, starting in the folder the connection has', () => {
    const outcome = choosePlan(contextOn('saved-query.choose-folder'), { args: {} });
    expect(outcome).toMatchObject({
      kind: 'read',
      need: {
        key: 'folder',
        read: 'saved-query.choose-folder:dialog',
        args: { title: 'Queries folder of Local', start: repoFolder },
      },
    });
  });

  it('saves the connection with the folder chosen, the folder itself, and says where queries go', () => {
    const outcome = choosePlan(contextOn('saved-query.choose-folder'), {
      args: {},
      folder: 'C:\\repo\\.mongoster\\queries',
    });
    expect(stepTexts(outcome)).toEqual(['save the connection Local']);
    expect(appArgs(outcome, 'saved-query.set-folder')).toEqual({ connection: 'c-local', queriesFolder: repoFolder });
    expect(planOf(outcome).after).toEqual([
      { kind: 'notify', level: 'info', text: 'Queries saved in the folder go to C:\\repo\\.mongoster\\queries.' },
    ]);
    expect(planOf(outcome).danger).toEqual({ kind: 'none' });
  });

  it('is for the connection named, or the current one, and only for MongoDB', () => {
    const outcome = choosePlan(contextOn('saved-query.choose-folder'), {
      args: { connection: production.id },
      folder: 'D:\\q',
    });
    expect(appArgs(outcome, 'saved-query.set-folder')).toEqual({ connection: 'c-prod', queriesFolder: 'D:\\q' });
    const cache = redisConnection();
    const redis = {
      ...contextOn('saved-query.choose-folder', undefined, stateWith([cache])),
      target: { kind: 'connection' as const, connection: cache.id },
    };
    expect(planOf(choosePlan(redis, { args: {}, folder: 'D:\\q' })).steps).toEqual([]);
  });
});
