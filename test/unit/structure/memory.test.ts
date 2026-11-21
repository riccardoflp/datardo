import { describe, expect, it } from 'vitest';
import { choicesOf, keptOf } from '../../../src/features/structure/model/memory';
import { pageParse, pageRequest, readBothAction } from '../../../src/features/structure/read';
import { plan, view, type StructurePageState } from '../../../src/features/structure/show';
import type { Context } from '../../../src/shared/feature';
import { connectionId, tabId } from '../../../src/shared/ids';
import type { Tab, TabShows } from '../../../src/shared/state/tabs';
import { contextWith, devShop, planOf, prodShop } from './build';

const shows: TabShows = {
  kind: 'page',
  connection: connectionId('c-dev'),
  page: 'structure',
  title: 'Structure: shop',
  database: 'shop',
};

const kept = {
  left: devShop,
  right: { connection: 'c-prod', database: 'shop_staging' },
  showAll: true,
  chip: 'only-left',
  folded: ['orders', 'users'],
  drops: true,
} as const;

function withTab(context: Context): Context {
  const tab: Tab = { id: tabId('tab-3'), shows, lastActive: 0, loaded: true };
  return { ...context, state: { ...context.state, tabs: { ...context.state.tabs, tabs: [tab] } } };
}

describe('structure.show', () => {
  it('keeps the two sides, All, the chip, the folded groups and Include drops with the tab, and reads them back', () => {
    const choices = choicesOf(kept);
    expect(choices).toMatchObject({ 'right.database': 'shop_staging', folded: '["orders","users"]', drops: 'true' });
    expect(keptOf(shows, choices)).toEqual(kept);
    expect(keptOf(shows, undefined)).toEqual({ left: devShop, right: {}, showAll: false, folded: [], drops: false });
    expect(keptOf(shows, { folded: 'not a list' })?.folded).toEqual([]);
  });

  it('changes the title of the tab to Structure: shop ↔ shop_staging and keeps its choices with it', () => {
    const context = withTab(contextWith('structure.show'));
    const choices = choicesOf(kept);
    expect(planOf(plan(context, { args: { keep: { tab: 'tab-3', choices } } })).steps).toEqual([
      {
        kind: 'app',
        text: 'keep the sides and choices of Structure: shop ↔ shop_staging with its tab',
        action: 'structure.keep',
        args: { tab: 'tab-3', title: 'Structure: shop ↔ shop_staging', choices },
      },
    ]);
  });

  it('opens on the database of the node of the tree it was chosen on', () => {
    const context = {
      ...contextWith('structure.show'),
      target: { kind: 'connection', connection: connectionId('c-dev') },
    } as const;
    const steps = planOf(plan(context, { args: { connection: 'c-dev', database: 'shop' } })).steps;
    expect(JSON.stringify(steps)).toContain('"page":"structure"');
    expect(JSON.stringify(steps)).toContain('Structure: shop');
  });

  it('says how far the read is with the detail of its work in progress', () => {
    const state: StructurePageState = {
      left: devShop,
      right: prodShop,
      connections: [],
      comparing: true,
      progressText: 'Reading the structures… left 3 of 12 collections, right …',
      showAll: false,
      folded: [],
      drops: false,
      swapping: false,
    };
    expect(view(state).progress).toBe('Reading the structures… left 3 of 12 collections, right …');
  });
});

describe('structure.read', () => {
  it('reads both sides through the app action of the main process, and one side by its first requests', () => {
    const context = contextWith('structure.read');
    const both = { left: devShop, right: prodShop };
    expect(pageRequest(context, both)).toEqual({ kind: 'app', action: readBothAction, args: both });
    expect(pageRequest(context, devShop).kind).toBe('engine');
    const read = { left: { kind: 'error', message: 'x' }, right: { kind: 'error', message: 'y' } };
    expect(pageParse([read], both)).toEqual(read);
  });
});
