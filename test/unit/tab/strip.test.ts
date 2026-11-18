import { describe, expect, it } from 'vitest';
import { feature as activate } from '../../../src/features/tab/activate';
import { feature as close } from '../../../src/features/tab/close';
import { feature as collapseGroup } from '../../../src/features/tab/collapse-group';
import { groupConnections, groups } from '../../../src/features/tab/groups';
import { view as menu } from '../../../src/features/tab/menu';
import { feature as open } from '../../../src/features/tab/open';
import { feature as reorder } from '../../../src/features/tab/reorder';
import { view as strip } from '../../../src/features/tab/strip';
import { cacheLocal, collection, fourTabs, harness, home, keys, local, orders, users } from './harness';

function groupNames(h: Awaited<ReturnType<typeof fourTabs>>): (string | undefined)[] {
  return groups(h.state().tabs.tabs, groupConnections(h.state())).map((group) => group.label?.name);
}

describe('tab.groups', () => {
  it('opened as Home, orders, Keys, users, Settings: the app group, Local (orders, users), Cache local (Keys)', async () => {
    const h = harness();
    await h.open(home);
    await h.open(orders);
    await h.open(keys());
    await h.open(users);
    await h.open({ kind: 'app', page: 'settings' });
    expect(h.titles()).toEqual(['Home', 'Settings', 'orders', 'users', 'Keys']);
    expect(groupNames(h as never)).toEqual([undefined, 'Local', 'Cache local']);
  });

  it('a tab opened on Local while the group of Cache local is the last goes at the end of Local, not of the strip', async () => {
    const h = await fourTabs();
    await h.open(collection('products'));
    expect(h.titles()).toEqual(['Home', 'orders', 'users', 'products', 'Keys']);
  });

  it('making a tab of Cache local active does not move its group before Local', async () => {
    const h = await fourTabs();
    await h.start(activate, { tab: h.tab('Keys').id });
    expect(groupNames(h)).toEqual([undefined, 'Local', 'Cache local']);
  });

  it('every tab of Local closed and products of Local opened: Local comes after Cache local', async () => {
    const h = await fourTabs();
    await h.start(close, { tab: h.tab('orders').id });
    await h.start(close, { tab: h.tab('users').id });
    await h.open(collection('products'));
    expect(groupNames(h)).toEqual([undefined, 'Cache local', 'Local']);
  });

  it('setting the color of Local to red turns its group red, with no restart', async () => {
    const h = await fourTabs();
    h.holder.dispatch({ slice: 'connections', type: 'saved', connection: { ...local, color: 'red' } });
    expect(strip(h.state()).groups[1]?.label?.color).toBe('red');
  });

  it('the app group shows no name; with no tab of the app the strip starts with the first connection', async () => {
    const h = await fourTabs();
    expect(strip(h.state()).groups[0]?.label).toBeUndefined();
    await h.start(close, { tab: h.tab('Home').id });
    expect(strip(h.state()).groups[0]?.label?.name).toBe('Local');
  });

  it('disconnecting Local turns the dot of its group into a ring, and its tabs stay', async () => {
    const h = await fourTabs();
    h.holder.dispatch({ slice: 'connections', type: 'state', connection: local.id, state: 'connected' });
    expect(strip(h.state()).groups[1]?.label?.dot).toBe('filled');
    h.holder.dispatch({ slice: 'connections', type: 'state', connection: local.id, state: 'not-connected' });
    expect(strip(h.state()).groups[1]?.label?.dot).toBe('ring');
    expect(h.titles()).toEqual(['Home', 'orders', 'users', 'Keys']);
  });

  it('a name longer than 24 characters is cut with …', async () => {
    const h = harness([{ ...local, name: 'A connection with a long name indeed' }]);
    await h.open(orders);
    expect(strip(h.state()).groups[0]?.label?.name).toBe('A connection with a lon…');
  });
});

describe('tab.collapse-group', () => {
  it('a click on the label of Local with four tabs, none active, leaves Local 4; a second click shows them in order', async () => {
    const h = harness();
    await h.open(keys());
    for (const name of ['a', 'b', 'c', 'd']) {
      await h.open(collection(name), true);
    }
    await h.start(collapseGroup, { connection: local.id });
    const collapsed = strip(h.state()).groups.find((group) => group.connection === local.id);
    expect(collapsed).toMatchObject({ collapsed: true, count: 4, tabs: [] });
    await h.start(collapseGroup, { connection: local.id });
    expect(strip(h.state()).groups[1]?.tabs.map((tab) => tab.title)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('collapsing the group of the active tab leaves that tab shown and active', async () => {
    const h = await fourTabs();
    await h.start(collapseGroup, { connection: local.id });
    expect(strip(h.state()).groups[1]?.tabs.map((tab) => [tab.title, tab.active])).toEqual([['users', true]]);
  });

  it('making a tab of a collapsed group active, in any way, expands its group', async () => {
    const h = await fourTabs();
    await h.start(activate, { tab: h.tab('Keys').id });
    await h.start(collapseGroup, { connection: local.id });
    await h.start(activate, { tab: h.tab('orders').id });
    expect(h.state().tabs.collapsed).toEqual([]);
  });

  it('the app group has no label and cannot be collapsed', async () => {
    const h = await fourTabs();
    await h.start(activate, { tab: h.tab('Home').id });
    const outcome = await h.start(collapseGroup);
    expect(outcome).toMatchObject({ kind: 'run', plan: { steps: [] } });
  });

  it('plans collapse the group of Local', async () => {
    const h = await fourTabs();
    const outcome = await h.start(collapseGroup, { connection: local.id });
    expect(outcome).toMatchObject({ plan: { steps: [{ text: 'collapse the group of Local' }] } });
  });
});

describe('tab.activate', () => {
  it('Ctrl+Tab from users makes Keys active and Cache local current; again makes Home active and leaves it current', async () => {
    const h = await fourTabs();
    await h.start(activate, 'next');
    expect(h.active()).toBe('Keys');
    expect(h.state().nav.current).toBe(cacheLocal.id);
    await h.start(activate, 'next');
    expect(h.active()).toBe('Home');
    expect(h.state().nav.current).toBe(cacheLocal.id);
  });

  it('Ctrl+Shift+Tab from Home makes Keys active', async () => {
    const h = await fourTabs();
    await h.start(activate, { tab: h.tab('Home').id });
    await h.start(activate, 'previous');
    expect(h.active()).toBe('Keys');
  });

  it('Ctrl+2 makes orders active, Ctrl+9 Keys, and Ctrl+7 does nothing', async () => {
    const h = await fourTabs();
    await h.start(activate, '2');
    expect(h.active()).toBe('orders');
    await h.start(activate, 'last');
    expect(h.active()).toBe('Keys');
    const outcome = await h.start(activate, '7');
    expect(outcome).toMatchObject({ plan: { steps: [] } });
    expect(h.active()).toBe('Keys');
  });

  it('with the group of Local collapsed and Home active, Ctrl+Tab makes Keys active', async () => {
    const h = await fourTabs();
    await h.start(activate, { tab: h.tab('Home').id });
    await h.start(collapseGroup, { connection: local.id });
    await h.start(activate, 'next');
    expect(h.active()).toBe('Keys');
  });

  it('making active a tab of a connection that is not connected does not connect it', async () => {
    const h = await fourTabs();
    const outcome = await h.start(activate, { tab: h.tab('orders').id });
    expect(outcome).toMatchObject({ kind: 'run', plan: { after: [] } });
  });

  it('plans make the tab active and remember it as a recent place; a place is added for Back', async () => {
    const h = await fourTabs();
    const outcome = await h.start(activate, { tab: h.tab('orders').id });
    expect(outcome).toMatchObject({
      plan: {
        steps: [
          { text: 'make the tab shop.orders of Local active', action: 'tab.activate' },
          { text: 'remember shop.orders of Local as a recent place', action: 'palette.remember-place' },
        ],
      },
    });
    const { places, index } = h.state().nav.history;
    expect(places[index]?.path).toBe('Local / shop / orders');
  });
});

describe('tab.open', () => {
  it('opens the collection tab at the end of Local and makes it active; a second click opens nothing', async () => {
    const h = await fourTabs();
    const first = await h.open(collection('products'));
    expect(first).toMatchObject({ plan: { steps: [{ text: 'open the tab shop.products of Local' }] } });
    expect(h.active()).toBe('products');
    const second = await h.open(collection('products'));
    expect(second).toMatchObject({ plan: { steps: [{ text: 'make the tab shop.products of Local active' }] } });
    expect(h.titles()).toEqual(['Home', 'orders', 'users', 'products', 'Keys']);
  });

  it('opening a saved query of shop.orders gives its filter to the tab that is open', async () => {
    const h = await fourTabs();
    await h.start(open, { shows: JSON.parse(JSON.stringify(orders)) as never, memory: { query: '{ status: "new" }' } });
    expect(h.tab('orders').memory?.query).toBe('{ status: "new" }');
    expect(h.active()).toBe('orders');
  });

  it('a click with the middle button adds the tab and leaves the active tab active; its page does not load', async () => {
    const h = await fourTabs();
    await h.open(collection('products'), true);
    expect(h.active()).toBe('users');
    expect(h.tab('products').loaded).toBe(false);
    await h.start(activate, { tab: h.tab('products').id });
    expect(h.tab('products').loaded).toBe(true);
  });

  it('opening the first tab of Cache local adds its group after the last group', async () => {
    const h = harness();
    await h.open(orders);
    await h.open(keys());
    expect(strip(h.state()).groups.map((group) => group.label?.name)).toEqual(['Local', 'Cache local']);
  });

  it('opening a collection of a connection that is not connected connects it', async () => {
    const h = harness();
    const outcome = await h.open(orders);
    expect(outcome).toMatchObject({ plan: { after: [{ kind: 'start', feature: 'connection.connect' }] } });
  });

  it('a tab of a connection removed in the meantime is refused: That connection no longer exists.', async () => {
    const h = harness([cacheLocal]);
    const outcome = await h.open(orders);
    expect(outcome).toMatchObject({ kind: 'refuse', code: 'tab.open/no-connection' });
  });
});

describe('tab.reorder', () => {
  it('dragging users before orders makes the group users, orders, and leaves users active', async () => {
    const h = await fourTabs();
    await h.start(activate, { tab: h.tab('Keys').id });
    const outcome = await h.start(reorder, { tab: h.tab('users').id, to: 0 });
    expect(outcome).toMatchObject({ plan: { steps: [{ text: 'move the tab shop.users of Local to place 1' }] } });
    expect(h.titles()).toEqual(['Home', 'users', 'orders', 'Keys']);
    expect(h.active()).toBe('Keys');
  });

  it('a tab moved past the end of its group stays in its group', async () => {
    const h = await fourTabs();
    await h.start(reorder, { tab: h.tab('orders').id, to: 9 });
    expect(h.titles()).toEqual(['Home', 'users', 'orders', 'Keys']);
  });

  it('Ctrl+Shift+PageUp on the first tab of its group changes nothing', async () => {
    const h = await fourTabs();
    await h.start(activate, { tab: h.tab('orders').id });
    const outcome = await h.start(reorder, 'left');
    expect(outcome).toMatchObject({ plan: { steps: [] } });
    await h.start(reorder, 'right');
    expect(h.titles()).toEqual(['Home', 'users', 'orders', 'Keys']);
  });
});

describe('tab.strip', () => {
  it('Home, orders and users of Local and the keys of Cache local: three groups, the app, Local, Cache local', async () => {
    const h = await fourTabs();
    const view = strip(h.state());
    expect(view.groups.map((group) => group.tabs.map((tab) => tab.title))).toEqual([
      ['Home'],
      ['orders', 'users'],
      ['Keys'],
    ]);
  });

  it('a click on users makes it active; a click with the middle button on orders closes it and leaves users active', async () => {
    const h = await fourTabs();
    await h.start(activate, { tab: h.tab('Home').id });
    await h.start(activate, { tab: h.tab('users').id });
    await h.start(close, { tab: h.tab('orders').id });
    expect(h.active()).toBe('users');
    expect(h.titles()).toEqual(['Home', 'users', 'Keys']);
  });

  it('a tab with unsaved changes is drawn with its dot, and says so to a screen reader', async () => {
    const h = await fourTabs();
    h.holder.dispatch({ slice: 'tabs', type: 'changed', tab: h.tab('orders').id, unsaved: true });
    const tab = strip(h.state()).groups[1]?.tabs[0];
    expect(tab).toMatchObject({ unsaved: true, spoken: 'orders, collection tab, Local, unsaved changes' });
  });

  it('resting the pointer on orders shows Local / shop / orders', async () => {
    const h = await fourTabs();
    expect(strip(h.state()).groups[1]?.tabs[0]?.path).toBe('Local / shop / orders');
  });

  it('the close button of Home is not shown while Home is the only tab', async () => {
    const h = harness();
    await h.open(home);
    expect(strip(h.state()).groups[0]?.tabs[0]?.closable).toBe(false);
  });
});

describe('tab.menu', () => {
  it('the menu of orders of Local shows every entry, in order', async () => {
    const h = await fourTabs();
    const labels = menu(h.state(), h.tab('orders').id).flatMap((entry) =>
      entry.kind === 'item' ? [entry.label] : ['—'],
    );
    expect(labels).toEqual([
      'Close',
      'Close others',
      'Close tabs of Local',
      'Close all',
      '—',
      'Reopen closed tab',
      '—',
      'Pin',
      'Copy path',
      'Open on another connection…',
    ]);
  });

  it('the menu of Home shows Close, Close others, Close all and Reopen closed tab, and nothing of the fourth part', async () => {
    const h = await fourTabs();
    const labels = menu(h.state(), h.tab('Home').id).flatMap((entry) => (entry.kind === 'item' ? [entry.label] : []));
    expect(labels).toEqual(['Close', 'Close others', 'Close all', 'Reopen closed tab']);
  });

  it('Close in the menu of a tab that is not active closes that tab and leaves the active one', async () => {
    const h = await fourTabs();
    const entry = menu(h.state(), h.tab('orders').id)[0];
    expect(entry).toMatchObject({ feature: 'tab.close', element: 'tab.close@tab-menu' });
    await h.start(close, entry?.kind === 'item' ? entry.args : null);
    expect(h.titles()).toEqual(['Home', 'users', 'Keys']);
    expect(h.active()).toBe('users');
  });

  it('with one tab open, Close others is disabled; Reopen closed tab is disabled until a tab is closed', async () => {
    const h = harness();
    await h.open(orders);
    const entries = menu(h.state(), h.tab('orders').id);
    expect(entries.find((entry) => entry.kind === 'item' && entry.label === 'Close others')).toMatchObject({
      disabled: true,
    });
    expect(entries.find((entry) => entry.kind === 'item' && entry.label === 'Reopen closed tab')).toMatchObject({
      disabled: true,
    });
  });
});
