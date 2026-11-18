import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { feature as activate } from '../../../src/features/tab/activate';
import { feature as collapseGroup } from '../../../src/features/tab/collapse-group';
import { feature as reorder } from '../../../src/features/tab/reorder';
import { feature as restore, restoredSession, sessionOf } from '../../../src/features/tab/restore';
import { saveTabsNow, start as startTabs } from '../../../src/main/tabs';
import type { TabShows } from '../../../src/shared/state/tabs';
import { cacheLocal, contextOf, harness, home, keys, local, orders, users, type Harness } from './harness';

let folder: string;
let last: Harness | undefined;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-tabs-'));
});

afterEach(async () => {
  // A save waits 1 second after the last change: it is made now, before the folder goes.
  if (last !== undefined) {
    await saveTabsNow(last.services);
  }
  await rm(folder, { recursive: true, force: true });
});

/** Starts a Datardo on the data folder, with the setting given, and its tabs restored. */
async function started(
  settings: Readonly<Record<string, unknown>> = {},
  connections = [local, cacheLocal],
): Promise<Harness> {
  const h = harness(connections, folder);
  h.holder.dispatch({ slice: 'settings', type: 'loaded', stored: settings as never, writable: true });
  await startTabs(h.services);
  last = h;
  return h;
}

/** The four tabs of the cards, users active, then a quit. */
async function quitWithFourTabs(): Promise<void> {
  const h = await started();
  for (const shows of [home, orders, users, keys(), users]) {
    await h.open(shows);
  }
  await saveTabsNow(h.services);
}

describe('tab.restore', () => {
  it('quitting with Home, orders, users and Keys, users active, starts again on the same four tabs, users active', async () => {
    await quitWithFourTabs();
    const h = await started();
    expect(h.titles()).toEqual(['Home', 'orders', 'users', 'Keys']);
    expect(h.active()).toBe('users');
    expect(h.state().nav.history.places.map((place) => place.path)).toEqual(['Local / shop / users']);
  });

  it('after that start only the active tab loads: Local connects, Cache local is not reached until its tab is shown', async () => {
    await quitWithFourTabs();
    const h = await started();
    expect(h.state().tabs.tabs.map((tab) => tab.loaded)).toEqual([false, false, true, false]);
    expect(h.state().nav.current).toBe(local.id);
  });

  it('the tab of orders restored with the filter { status: "paid" } shows that filter', async () => {
    const first = await started();
    await first.open(orders);
    first.holder.dispatch({
      slice: 'tabs',
      type: 'changed',
      tab: first.tab('orders').id,
      memory: { query: '{ status: "paid" }' },
    });
    await saveTabsNow(first.services);
    const h = await started();
    expect(h.tab('orders').memory).toEqual({ query: '{ status: "paid" }' });
  });

  it('the saved file holds no document, no value of a key and no connection string', async () => {
    await quitWithFourTabs();
    const written = await readFile(join(folder, 'session.json'), 'utf8');
    expect(JSON.parse(written)).toMatchObject({ version: 1, active: 2 });
    expect(written).not.toMatch(/mongodb:\/\/|redis:\/\/|password/u);
    expect(Object.keys(JSON.parse(written) as object).sort()).toEqual(['active', 'collapsed', 'tabs', 'version']);
  });

  it('with datardo.tab.restore off, Datardo starts with no tab restored (the Home tab is M5)', async () => {
    await quitWithFourTabs();
    const h = await started({ 'datardo.tab.restore': false });
    expect(h.titles()).toEqual([]);
  });

  it('a draft of Playground 1 comes back marked as unsaved, with the setting on or off', async () => {
    const playground: TabShows = { kind: 'playground', connection: local.id, title: 'Playground 1' };
    const first = await started({ 'datardo.tab.restore': false });
    await first.open(orders);
    await first.open(playground);
    first.holder.dispatch({
      slice: 'tabs',
      type: 'changed',
      tab: first.tab('Playground 1').id,
      draft: { text: 'db.orders.find()' },
    });
    await saveTabsNow(first.services);
    for (const setting of [false, true]) {
      const h = await started({ 'datardo.tab.restore': setting });
      expect(h.titles()).toEqual(['Playground 1']);
      expect(h.tab('Playground 1')).toMatchObject({ unsaved: true, draft: { text: 'db.orders.find()' } });
    }
  });

  it('a tab of a connection removed while Datardo was closed is not restored, and no error is shown', async () => {
    await quitWithFourTabs();
    const h = await started({}, [local]);
    expect(h.titles()).toEqual(['Home', 'orders', 'users']);
    expect(h.state().runner.notifications).toEqual([]);
  });

  it('a group collapsed when Datardo quits is collapsed at the next start (tab.collapse-group)', async () => {
    const first = await started();
    for (const shows of [orders, users, keys()]) {
      await first.open(shows);
    }
    await first.start(collapseGroup, { connection: local.id });
    await saveTabsNow(first.services);
    const h = await started();
    expect(h.state().tabs.collapsed).toEqual([local.id]);
  });

  it('the order of a group after a drag is the same after a restart (tab.reorder)', async () => {
    await quitWithFourTabs();
    const first = await started();
    await first.start(activate, { tab: first.tab('Keys').id });
    await first.start(reorder, { tab: first.tab('users').id, to: 0 });
    await saveTabsNow(first.services);
    const h = await started();
    expect(h.titles()).toEqual(['Home', 'users', 'orders', 'Keys']);
    expect(h.active()).toBe('Keys');
  });

  it('a damaged session.json is set aside, said once, and Datardo starts with no tab', async () => {
    await writeFile(join(folder, 'session.json'), '{ not json', 'utf8');
    const h = await started();
    expect(h.titles()).toEqual([]);
    expect(h.state().runner.notifications.map((each) => each.text)).toEqual([
      expect.stringContaining('The open tabs could not be read and was set aside as session.damaged-'),
    ]);
  });

  it('saves only drafts with the setting off, and restores only those', () => {
    const h = harness();
    expect(sessionOf(h.state().tabs, false)).toEqual({ tabs: [], collapsed: [] });
    expect(restoredSession({ tabs: [{ shows: orders }], active: 0, collapsed: [] }, false)).toEqual({
      tabs: [],
      collapsed: [],
    });
  });

  it('plans save the open tabs, or at start open the saved tabs', () => {
    const state = harness().state();
    expect(restore.plan(contextOf(state, 'tab.restore'), { args: 'save' })).toMatchObject({
      plan: { steps: [{ text: 'save the open tabs', action: 'tab.save-session' }] },
    });
    expect(restore.plan(contextOf(state, 'tab.restore'), { args: 'start' })).toMatchObject({
      plan: { steps: [{ text: 'open the saved tabs', action: 'tab.open-saved' }] },
    });
  });
});
