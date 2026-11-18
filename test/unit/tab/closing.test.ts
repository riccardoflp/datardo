import { describe, expect, it } from 'vitest';
import { feature as activate } from '../../../src/features/tab/activate';
import { feature as close } from '../../../src/features/tab/close';
import { feature as closeMany } from '../../../src/features/tab/close-many';
import { closedByRemoval, view as gone } from '../../../src/features/tab/connection-gone';
import { feature as reopen, isOffered as canReopen } from '../../../src/features/tab/reopen';
import { view as strip } from '../../../src/features/tab/strip';
import type { TabShows } from '../../../src/shared/state/tabs';
import { start as startTabs } from '../../../src/main/tabs';
import { collection, document, fourTabs, harness, home, keys, local, orders, staging, users } from './harness';

const playground: TabShows = { kind: 'playground', connection: local.id, title: 'Playground 1' };

describe('tab.close', () => {
  it('Ctrl+W on a collection tab with a filter typed and not run closes it without a question', async () => {
    const h = await fourTabs();
    h.holder.dispatch({ slice: 'tabs', type: 'changed', tab: h.tab('users').id, memory: { query: '{ a: 1 }' } });
    const outcome = await h.start(close);
    expect(outcome).toMatchObject({ kind: 'run', plan: { steps: [{ text: 'close the tab shop.users of Local' }] } });
    expect(h.titles()).toEqual(['Home', 'orders', 'Keys']);
  });

  it('Ctrl+W on the document tab orders · 7 with an edit not saved asks whether to save the changes', async () => {
    const h = harness();
    await h.open(document('7'));
    h.holder.dispatch({ slice: 'tabs', type: 'changed', tab: h.tab('orders · 7').id, unsaved: true });
    const outcome = await h.start(close);
    expect(outcome).toMatchObject({
      kind: 'ask',
      question: {
        title: 'Do you want to save the changes you made to orders · 7?',
        text: "Your changes will be lost if you don't save them.",
        fields: [{ choices: [{ label: 'Save' }, { label: "Don't save" }] }],
      },
    });
    expect(h.titles()).toEqual(['orders · 7']);
  });

  it("Save saves the tab as Ctrl+S would and then closes it; Don't save only closes it", async () => {
    const h = harness();
    await h.open(document('7'));
    h.holder.dispatch({ slice: 'tabs', type: 'changed', tab: h.tab('orders · 7').id, unsaved: true });
    const context = { args: null };
    const saved = close.plan(
      { ...(await import('./harness')).contextOf(h.state(), 'tab.close') },
      { ...context, changes: 'save' },
    );
    // The last tab closed brings Home (home.show, D7).
    expect(saved).toMatchObject({
      plan: { steps: [{ action: 'tab.save' }, { action: 'tab.close' }, { action: 'tab.open' }] },
    });
    const dropped = close.plan((await import('./harness')).contextOf(h.state(), 'tab.close'), {
      ...context,
      changes: 'discard',
    });
    expect(dropped).toMatchObject({ plan: { steps: [{ action: 'tab.close' }, { action: 'tab.open' }] } });
  });

  it('a playground never saved and left as it opened closes without a question; one with a line typed asks', async () => {
    const h = harness();
    await h.open(playground);
    expect(await h.start(close, null)).toMatchObject({ kind: 'run' });
    await h.open(playground);
    h.holder.dispatch({ slice: 'tabs', type: 'changed', tab: h.tab('Playground 1').id, unsaved: true });
    expect(await h.start(close, null)).toMatchObject({ kind: 'ask' });
  });

  it('closing the active tab makes active the tab that was active before it, not its neighbor', async () => {
    const h = await fourTabs();
    await h.start(activate, { tab: h.tab('Home').id });
    await h.start(activate, { tab: h.tab('orders').id });
    await h.start(close);
    expect(h.active()).toBe('Home');
  });

  it('closing the last tab opens Home; Home alone has no close', async () => {
    const h = harness();
    await h.open(orders);
    await h.start(close);
    expect(h.titles()).toEqual(['Home']);
    await h.open(home);
    expect(await h.start(close)).toMatchObject({ plan: { steps: [] } });
    expect(h.titles()).toEqual(['Home']);
  });

  it('a click with the middle button on a tab that is not active closes it and leaves the active tab active', async () => {
    const h = await fourTabs();
    await h.start(close, { tab: h.tab('Keys').id });
    expect(h.active()).toBe('users');
  });
});

describe('tab.close-many', () => {
  it('Close others on orders leaves orders alone in the strip, active', async () => {
    const h = await fourTabs();
    await h.start(closeMany, { which: 'others', tab: h.tab('orders').id });
    expect(h.titles()).toEqual(['orders']);
    expect(h.active()).toBe('orders');
  });

  it('Close tabs of Local closes orders and users, removes the group and leaves Home and Keys', async () => {
    const h = await fourTabs();
    const outcome = await h.start(closeMany, { which: 'connection', connection: local.id });
    expect(outcome).toMatchObject({ plan: { title: 'Close tabs of Local' } });
    expect(h.titles()).toEqual(['Home', 'Keys']);
    expect(strip(h.state()).groups.map((group) => group.label?.name)).toEqual([undefined, 'Cache local']);
  });

  it('Close all leaves Home alone', async () => {
    const h = await fourTabs();
    await h.start(closeMany, 'all');
    expect(h.titles()).toEqual(['Home']);
  });

  it('with two document tabs with unsaved changes, both questions come before any tab closes', async () => {
    const h = harness();
    await h.open(document('7'));
    await h.open(document('8'));
    for (const title of ['orders · 7', 'orders · 8']) {
      h.holder.dispatch({ slice: 'tabs', type: 'changed', tab: h.tab(title).id, unsaved: true });
    }
    const first = await h.start(closeMany, 'all');
    expect(first).toMatchObject({
      kind: 'ask',
      question: { title: 'Do you want to save the changes you made to orders · 7?' },
    });
    const key = `changes:${h.tab('orders · 7').id}`;
    const second = await h.start(closeMany, 'all', { [key]: 'save' });
    expect(second).toMatchObject({
      kind: 'ask',
      question: { title: 'Do you want to save the changes you made to orders · 8?' },
    });
    expect(h.titles()).toEqual(['orders · 7', 'orders · 8']);
  });

  it('after Close tabs of Local closed three tabs, Ctrl+Shift+T three times brings the three back', async () => {
    const h = await fourTabs();
    await h.open(collection('products'));
    await h.start(closeMany, { which: 'connection', connection: local.id });
    for (let time = 0; time < 3; time += 1) {
      await h.start(reopen);
    }
    expect(h.titles()).toEqual(['Home', 'Keys', 'orders', 'users', 'products']);
  });

  it('the menu of Home does not offer Close tabs of', async () => {
    const h = await fourTabs();
    const outcome = await h.start(closeMany, { which: 'connection', tab: h.tab('Home').id });
    expect(outcome).toMatchObject({ plan: { steps: [] } });
    expect(h.titles()).toHaveLength(4);
  });
});

describe('tab.reopen', () => {
  it('closing orders on Indexes and then users, Ctrl+Shift+T opens users, and again orders on Indexes', async () => {
    const h = await fourTabs();
    h.holder.dispatch({ slice: 'tabs', type: 'changed', tab: h.tab('orders').id, section: 'Indexes' });
    await h.start(close, { tab: h.tab('orders').id });
    await h.start(close, { tab: h.tab('users').id });
    await h.start(reopen);
    expect(h.active()).toBe('users');
    await h.start(reopen);
    expect(h.active()).toBe('orders');
    expect(h.tab('orders').section).toBe('Indexes');
  });

  it('a tab closed from the middle of its group comes back in the middle', async () => {
    const h = await fourTabs();
    await h.open(collection('products'));
    await h.start(close, { tab: h.tab('users').id });
    await h.start(reopen);
    expect(h.titles()).toEqual(['Home', 'orders', 'users', 'products', 'Keys']);
  });

  it('after closing orders and opening it again, Ctrl+Shift+T opens the tab closed before it, or nothing', async () => {
    const h = await fourTabs();
    await h.start(close, { tab: h.tab('Keys').id });
    await h.start(close, { tab: h.tab('orders').id });
    await h.open(orders);
    await h.start(reopen);
    expect(h.titles()).toEqual(['Home', 'users', 'orders', 'Keys']);
    expect(await h.start(reopen)).toMatchObject({ plan: { steps: [] } });
  });

  it("a document tab closed with Don't save comes back without the changes", async () => {
    const h = harness();
    await h.open(document('7'));
    h.holder.dispatch({
      slice: 'tabs',
      type: 'changed',
      tab: h.tab('orders · 7').id,
      unsaved: true,
      draft: { text: '{ _id: 7, a: 2 }' },
    });
    await h.start(close, null, { changes: 'discard' });
    await h.start(reopen);
    expect(h.tab('orders · 7')).not.toHaveProperty('draft');
    expect(h.tab('orders · 7').unsaved).not.toBe(true);
  });

  it('right after Datardo starts, Reopen closed tab is disabled', () => {
    expect(canReopen(harness().state())).toBe(false);
  });

  it('the 21st tab closed makes the first one unreachable', async () => {
    const h = harness();
    for (let index = 1; index <= 21; index += 1) {
      await h.open(collection(`c${String(index)}`));
      await h.start(close);
    }
    for (let index = 0; index < 21; index += 1) {
      await h.start(reopen);
    }
    // Home came back each time the last tab closed; it is not a closed tab to reopen.
    expect(h.titles().filter((title) => title !== 'Home')).toHaveLength(20);
    expect(h.titles()).not.toContain('c1');
  });

  it('a tab closed because what it showed was dropped is not offered again', async () => {
    const h = await fourTabs();
    const tab = h.tab('orders');
    const { actions } = await import('../../../src/main/actions/tab');
    await actions(h.services)['tab.close']?.({ tab: tab.id, forget: true }, new AbortController().signal);
    expect(canReopen(h.state())).toBe(false);
  });
});

describe('tab.connection-gone', () => {
  it('after Disconnect on Local its tabs stay, and the dot of its group is a ring', async () => {
    const h = await fourTabs();
    h.holder.dispatch({ slice: 'connections', type: 'state', connection: local.id, state: 'failed', reason: 'gone' });
    expect(gone(h.state())[0]).toMatchObject({ connection: local.id, dot: 'error', saved: true });
    h.holder.dispatch({ slice: 'connections', type: 'state', connection: local.id, state: 'not-connected' });
    expect(gone(h.state())[0]).toMatchObject({ dot: 'ring' });
    expect(h.titles()).toEqual(['Home', 'orders', 'users', 'Keys']);
  });

  it('removing Local closes its tabs of every kind and its group; none comes back, and Back stops on no place of it', async () => {
    const h = harness([local, { ...staging }, (await import('./harness')).cacheLocal]);
    await startTabs(h.services);
    await h.open(home);
    await h.open(orders);
    await h.open(document('7'));
    await h.open(playground);
    await h.open(keys());
    await h.start(close, { tab: h.tab('orders').id });
    h.holder.dispatch({ slice: 'connections', type: 'removed', connection: local.id });
    expect(h.titles()).toEqual(['Home', 'Keys']);
    expect(canReopen(h.state())).toBe(false);
    expect(h.state().nav.history.places.some((place) => place.connection === local.id)).toBe(false);
  });

  it('removing Local with an edited document tab names it among the tabs to ask about first', async () => {
    const h = harness();
    await h.open(document('7'));
    h.holder.dispatch({ slice: 'tabs', type: 'changed', tab: h.tab('orders · 7').id, unsaved: true });
    expect(closedByRemoval(h.state(), local.id).unsaved.map((tab) => tab.id)).toEqual([h.tab('orders · 7').id]);
  });

  it('removing Staging closes the comparison of Local with Staging, which is in the group of Local', async () => {
    const h = harness([local, staging]);
    const comparison: TabShows = {
      kind: 'page',
      connection: local.id,
      page: 'compare',
      title: 'Compare',
      of: ['local/shop.orders', 'staging/shop.orders'],
    };
    await h.open(comparison);
    await h.open(users);
    expect(closedByRemoval(h.state(), staging.id).tabs.map((tab) => tab.shows.kind)).toEqual(['page']);
  });

  it('renaming Local to Dev changes the label of its group and leaves its tabs open', async () => {
    const h = await fourTabs();
    h.holder.dispatch({ slice: 'connections', type: 'saved', connection: { ...local, name: 'Dev' } });
    expect(strip(h.state()).groups[1]?.label?.name).toBe('Dev');
    expect(h.titles()).toEqual(['Home', 'orders', 'users', 'Keys']);
  });
});
