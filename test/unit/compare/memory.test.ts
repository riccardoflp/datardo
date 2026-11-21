import { describe, expect, it } from 'vitest';
import { afterReplies, plan as copyPlan } from '../../../src/features/compare/copy-document';
import { choicesOf, keptOf, leftOfShows } from '../../../src/features/compare/page/memory';
import { compareAction, pageParse, pageRequest } from '../../../src/features/compare/read';
import { isOffered } from '../../../src/features/palette/run-command';
import { pageShows, plan } from '../../../src/features/compare/show';
import type { Json } from '../../../src/shared/engine-request';
import type { Context } from '../../../src/shared/feature';
import { connectionId, tabId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import type { Tab, TabShows } from '../../../src/shared/state/tabs';
import { contextWith, int, leftSide, local, planOf, rightSide, started } from './context';

const left = { ...leftSide, connection: connectionId('c-local') };
const right = { ...rightSide, connection: connectionId('c-prod'), collection: 'orders_2023' };
const options = { filter: '{ status: "new" }', ignore: 'updatedAt', ignoreOrder: false, numbersByValue: true };

function withTab(context: Context): Context {
  const tab: Tab = { id: tabId('tab-7'), shows: pageShows(left), lastActive: 0, loaded: true };
  return { ...context, state: { ...context.state, tabs: { ...context.state.tabs, tabs: [tab] } } };
}

describe('compare.show', () => {
  it('keeps the two sides, the filter, Ignore and the two options with the tab, and reads them back', () => {
    const choices = choicesOf({ left, right, options });
    expect(choices).toMatchObject({
      'right.collection': 'orders_2023',
      filter: '{ status: "new" }',
      ignoreOrder: 'false',
    });
    expect(keptOf(pageShows(left), choices)).toEqual({ left, right, options });
  });

  it('opens a tab with no memory on the collection it names, with the default options', () => {
    expect(leftOfShows(pageShows(left))).toEqual(left);
    expect(keptOf(pageShows(left), undefined)).toEqual({
      left,
      options: { filter: '', ignore: '', ignoreOrder: true, numbersByValue: true },
    });
  });

  it('changes the title of the tab to Compare: orders ↔ orders_2023 and keeps its choices with it', () => {
    const context = withTab(contextWith('compare.show'));
    const choices = choicesOf({ left, right, options });
    const kept = planOf(plan(context, started({ keep: { tab: 'tab-7', choices } })));
    expect(kept.steps).toEqual([
      {
        kind: 'app',
        text: 'keep the sides and options of Compare: orders ↔ orders_2023 with its tab',
        action: 'compare.keep',
        args: { tab: 'tab-7', title: 'Compare: orders ↔ orders_2023', choices },
      },
    ]);
    expect(kept.danger).toEqual({ kind: 'none' });
    expect(planOf(plan(context, started({ keep: { tab: 'tab-9', choices } }))).steps).toEqual([]);
  });

  it('opens on the collection of the node of the tree it was chosen on', () => {
    const context = { ...contextWith('compare.show'), target: { kind: 'connection', connection: local.id } } as const;
    const outcome = plan(context, started({ connection: 'c-local', database: 'shop', collection: 'orders' }));
    expect(JSON.stringify(planOf(outcome))).toContain(JSON.stringify(pageShows(left)));
  });
});

describe('compare.read', () => {
  it('reads through the app action of the main process, and refuses a filter that is not valid without reading', () => {
    const context = contextWith('compare.read');
    const args = { left: leftSide, right: rightSide, options: { ...options, filter: '' } };
    expect(pageRequest(context, args)).toEqual({ kind: 'app', action: compareAction, args });
    const refused = pageRequest(context, { ...args, options: { ...options, filter: '{ status: ' } });
    expect(refused).toMatchObject({ kind: 'refuse', code: 'compare.read/filter' });
    const result: Json = { counts: { identical: 1 }, differences: [], filtered: false };
    expect(pageParse([result])).toEqual(result);
  });
});

describe('compare.copy-document', () => {
  it('says what it wrote once it has run, and reads the side again', () => {
    const context = contextWith('compare.copy-document');
    const answers = started({
      left: leftSide,
      right: rightSide,
      to: 'right',
      difference: { id: int(4), kind: 'only-right' },
    });
    const planned = planOf(copyPlan(context, answers));
    expect(planned.after).toEqual([
      { kind: 'notify', level: 'success', text: 'Deleted 1 in Production › shop.orders.' },
      { kind: 'refresh', connection: 'c-prod' },
    ]);
    expect(afterReplies(context, answers, [{ deletedCount: int(1) }])).toEqual(planned.after);
  });
});

describe('compare.show', () => {
  function withActive(shows: TabShows): AppState {
    const { state } = contextWith('compare.show');
    const tab: Tab = { id: tabId('tab-1'), shows, lastActive: 0, loaded: true };
    const live = { ...state.connections.live, [local.id]: { state: 'connected' as const } };
    return {
      ...state,
      connections: { ...state.connections, live },
      nav: { ...state.nav, current: local.id },
      tabs: { ...state.tabs, tabs: [tab], active: tab.id },
    };
  }

  it('offers Compare with… in Go to on a collection tab, and Compare structure with… on a tab of a database', () => {
    const collection = withActive({ kind: 'collection', connection: local.id, database: 'shop', collection: 'orders' });
    expect(isOffered(collection, 'compare.show')).toBe(true);
    expect(isOffered(collection, 'structure.show')).toBe(true);
    const page = withActive({
      kind: 'page',
      connection: local.id,
      page: 'structure',
      title: 'Structure: shop',
      database: 'shop',
    });
    expect(isOffered(page, 'compare.show')).toBe(false);
    expect(isOffered(page, 'structure.show')).toBe(true);
    const home = withActive({ kind: 'page', connection: local.id, page: 'overview', title: 'Local' });
    expect(isOffered(home, 'structure.show')).toBe(false);
  });
});
