/**
 * What M20 adds around the saved-query features: Go to finds the saved queries (`saved-query.connection-list`) and
 * opens them with `saved-query.run`; a pin follows the query it holds when the query is renamed, moved or deleted;
 * the file steps say what failed; the question that only explains answers under its key; the state the window runs a
 * loaded query from; the commands Go to offers on a collection tab.
 */
import { describe, expect, it } from 'vitest';
import { plan as openResult } from '../../../src/features/palette/open-result';
import { isOffered } from '../../../src/features/palette/run-command';
import { sources } from '../../../src/features/palette/sources';
import { answersOf } from '../../../src/features/runner/ask';
import { introQuestion } from '../../../src/features/saved-query/choose-folder';
import {
  parse as connectionListParse,
  pinRunArgs,
  type ConnectionQueries,
} from '../../../src/features/saved-query/connection-list';
import { plan as deletePlan } from '../../../src/features/saved-query/delete';
import { plan as movePlan } from '../../../src/features/saved-query/move';
import { plan as renamePlan } from '../../../src/features/saved-query/rename';
import { pinOfSaved, savedRef, type SavedQuery } from '../../../src/features/saved-query/types';
import { readPin } from '../../../src/main/nav';
import type { Answers } from '../../../src/shared/feature';
import { tabId } from '../../../src/shared/ids';
import { initialState, reduce, type AppState } from '../../../src/shared/state';
import { revisionOf } from '../../../src/shared/state/saved-query';
import {
  answersWith,
  appArgs,
  appState,
  contextOn,
  fileSteps,
  find,
  inFolder,
  listOf,
  local,
  mine,
  planOf,
  repoFolder,
  stepTexts,
} from './harness';

const paidThisMonth = inFolder('Paid this month', 'paid-this-month.json', find('{ status: "paid" }'));

function withPins(state: AppState, pins: readonly SavedQuery[]): AppState {
  return { ...state, nav: { ...state.nav, pins: { [local.id]: pins.map(pinOfSaved) } } };
}

function on(query: SavedQuery, saved: readonly SavedQuery[], more: Answers = {}): Answers {
  return answersWith({ saved: savedRef(query) }, { list: listOf(saved), ...more });
}

/** What `saved-query.connection-list` gives for Local, from what the main process read. */
function localQueries(): ConnectionQueries {
  return connectionListParse([
    {
      connectionName: 'Local',
      mine: [],
      folder: {
        folder: repoFolder,
        files: [
          {
            file: 'shop/orders/paid-this-month.json',
            size: 10,
            text: JSON.stringify({
              name: 'Paid this month',
              database: 'shop',
              collection: 'orders',
              filter: '{ status: "paid" }',
            }),
          },
        ],
      },
    },
  ]);
}

describe('saved-query.connection-list', () => {
  it('lists Paid this month in Go to on Local as shop.orders · Folder, and choosing it opens shop.orders with the query run', () => {
    const state = { ...appState(), nav: { ...appState().nav, current: local.id } };
    const looked = sources('paid', {
      state,
      knowledge: { collections: {}, commands: [], savedQueries: { [local.id]: localQueries() } },
    });
    const row = looked.kind === 'look' ? looked.candidates.find((each) => each.kind === 'saved-query') : undefined;
    expect(row).toMatchObject({ name: 'Paid this month', context: 'shop.orders · Folder', source: 'saved-queries' });
    const outcome = openResult(contextOn('palette.open-result', local.id, state), {
      args: JSON.parse(JSON.stringify({ opens: row?.opens, background: false })) as never,
    });
    expect(stepTexts(outcome)).toEqual(['set the query of orders to "Paid this month"']);
    expect(appArgs(outcome, 'saved-query.load')).toMatchObject({
      connection: local.id,
      database: 'shop',
      collection: 'orders',
      query: { kind: 'find', filter: '{ status: "paid" }' },
    });
  });

  it('lists the saved queries of a connection that is not the current one with its name, under ?', () => {
    const looked = sources('?', {
      state: appState(),
      knowledge: { collections: {}, commands: [], savedQueries: { [local.id]: localQueries() } },
    });
    expect(looked.kind === 'look' ? looked.candidates.map((each) => each.context) : []).toEqual([
      'Local / shop.orders · Folder',
    ]);
  });

  it('starts saved-query.run on a pinned query with the query it names, read from the list as it is now', () => {
    const pin = pinOfSaved(paidThisMonth);
    expect(pinRunArgs(local.id, pin)).toEqual({
      connection: local.id,
      database: 'shop',
      collection: 'orders',
      saved: { place: 'folder', name: 'Paid this month', file: 'shop/orders/paid-this-month.json' },
    });
    expect(readPin(JSON.parse(JSON.stringify(pinOfSaved(mine('Paid')))))).toEqual(pinOfSaved(mine('Paid')));
    expect(readPin(JSON.parse(JSON.stringify(pin)))).toEqual(pin);
  });
});

describe('the pin of a saved query', () => {
  it('follows a query renamed, in the folder and for me', () => {
    const folder = inFolder('Paid', 'paid.json');
    const state = withPins(appState(), [folder, mine('Mine')]);
    const renamed = renamePlan(
      contextOn('saved-query.rename', local.id, state),
      on(folder, [folder], { name: 'Paid now' }),
    );
    expect(appArgs(renamed, 'saved-query.set-pin')).toEqual({
      connection: local.id,
      from: pinOfSaved(folder),
      to: pinOfSaved({ ...folder, name: 'Paid now', file: 'shop/orders/paid-now.json' }),
    });
    const me = mine('Mine');
    const renamedMine = renamePlan(contextOn('saved-query.rename', local.id, state), on(me, [me], { name: 'Ours' }));
    expect(appArgs(renamedMine, 'saved-query.set-pin')['to']).toMatchObject({ place: 'me', name: 'Ours' });
  });

  it('goes with a query deleted, and is not touched for a query that is not pinned', () => {
    const folder = inFolder('Paid', 'paid.json');
    const state = withPins(appState(), [folder]);
    const deleted = deletePlan(contextOn('saved-query.delete', local.id, state), on(folder, [folder]));
    expect(appArgs(deleted, 'saved-query.set-pin')).toEqual({
      connection: local.id,
      from: pinOfSaved(folder),
      to: null,
    });
    const other = inFolder('Other', 'other.json');
    const untouched = deletePlan(contextOn('saved-query.delete', local.id, state), on(other, [other]));
    expect(planOf(untouched).steps.some((step) => step.kind === 'app' && step.action === 'saved-query.set-pin')).toBe(
      false,
    );
  });

  it('follows a query moved from the folder to my queries', () => {
    const folder = inFolder('Paid', 'paid.json');
    const state = withPins(appState(), [folder]);
    const moved = movePlan(contextOn('saved-query.move', local.id, state), on(folder, [folder]));
    expect(appArgs(moved, 'saved-query.set-pin')['to']).toMatchObject({ place: 'me', name: 'Paid' });
  });
});

describe('the file steps of the queries folder', () => {
  it('say what failed before the reason of the system', () => {
    const folder = inFolder('Paid', 'paid.json');
    const deleted = deletePlan(contextOn('saved-query.delete'), on(folder, [folder]));
    expect(fileSteps(deleted)[0]?.content?.args).toMatchObject({ failure: 'Could not delete the query:' });
    const renamed = renamePlan(contextOn('saved-query.rename'), on(folder, [folder], { name: 'Paid now' }));
    expect(fileSteps(renamed).map((step) => step.content?.args)).toMatchObject([
      { failure: 'Could not rename the query:' },
      { failure: 'Could not rename the query:' },
    ]);
  });
});

describe('runner.ask', () => {
  it('answers a question that only explains, such as the one before the folder dialog, true under its key', () => {
    expect(answersOf(introQuestion({ name: 'Bare' }), {})).toEqual({ 'saved-query.choose-folder': true });
  });
});

describe('the saved-query part of the state', () => {
  it('keeps the query loaded into each tab with a new number each time, and counts the changes of a connection', () => {
    const first = reduce(initialState, {
      slice: 'saved-query',
      type: 'loaded',
      tab: tabId('t1'),
      query: { kind: 'find' },
    });
    const second = reduce(first, { slice: 'saved-query', type: 'loaded', tab: tabId('t1'), query: { kind: 'find' } });
    expect(first.savedQuery.loads['t1']?.number).toBe(1);
    expect(second.savedQuery.loads['t1']?.number).toBe(2);
    const changed = reduce(second, { slice: 'saved-query', type: 'changed', connection: local.id });
    expect(revisionOf(changed.savedQuery, local.id)).toBe(1);
    expect(revisionOf(changed.savedQuery, 'c-other')).toBe(0);
  });
});

describe('saved-query.show', () => {
  it('offers Queries, Save query… and Clear recent queries in Go to on a collection tab only', () => {
    const tab = {
      id: tabId('t1'),
      shows: { kind: 'collection' as const, connection: local.id, database: 'shop', collection: 'orders' },
      lastActive: 0,
      loaded: true,
    };
    const live = { ...appState().connections.live, [local.id]: { state: 'connected' as const } };
    const base = {
      ...appState(),
      connections: { ...appState().connections, live },
      nav: { ...appState().nav, current: local.id },
    } as AppState;
    const withTab = { ...base, tabs: { ...base.tabs, tabs: [tab], active: tab.id } };
    for (const id of ['saved-query.show', 'saved-query.save', 'saved-query.save:folder', 'saved-query.clear-recent']) {
      expect(isOffered(withTab, id)).toBe(true);
      expect(isOffered(base, id)).toBe(false);
    }
    expect(isOffered(base, 'saved-query.choose-folder')).toBe(true);
  });
});
