import { describe, expect, it } from 'vitest';
import { fit } from '../../../src/features/tab/fit';
import { targetKey } from '../../../src/features/tab/same-target';
import { newPlaygroundTitle, tabTitle, titledTabs } from '../../../src/features/tab/title';
import type { TabShows } from '../../../src/shared/state/tabs';
import { cacheLocal, collection, document, harness, keys, local, orders, staging } from './harness';

const playground = (title: string, file?: string): TabShows => ({
  kind: 'playground',
  connection: local.id,
  title,
  ...(file === undefined ? {} : { file }),
});

describe('tab.title', () => {
  it('opening crm.orders while shop.orders is open titles both with their database; closing one gives orders back', async () => {
    const h = harness();
    await h.open(orders);
    expect(h.titles()).toEqual(['orders']);
    await h.open(collection('orders', 'crm'));
    expect(h.titles()).toEqual(['orders · shop', 'orders · crm']);
    await h.start((await import('../../../src/features/tab/close')).feature, { tab: h.tab('orders · crm').id });
    expect(h.titles()).toEqual(['orders']);
  });

  it('the same two collections on two connections are both titled orders', () => {
    const tabs = [orders, collection('orders', 'shop', staging.id)].map((shows, index) => ({
      id: `tab-${String(index)}` as never,
      shows,
      lastActive: 0,
      loaded: true,
    }));
    expect([...titledTabs(tabs).values()]).toEqual(['orders', 'orders']);
  });

  it('the document tab of ObjectId("65f1c0de9a7b4e00012f3a2c") is titled orders · 65f1…a2c, and of _id 7 orders · 7', () => {
    expect(tabTitle(document('ObjectId("65f1c0de9a7b4e00012f3a2c")'), []).text).toBe('orders · 65f1…a2c');
    expect(tabTitle(document('7'), []).text).toBe('orders · 7');
  });

  it('closing Playground 1 and opening a new playground while Playground 2 is open titles it Playground 1', () => {
    expect(newPlaygroundTitle([playground('Playground 2')])).toBe('Playground 1');
    expect(newPlaygroundTitle([playground('Playground 1')])).toBe('Playground 2');
  });

  it('no title holds the name of the connection; the keys of db0 are Keys, of db3 Keys · db3, a namespace its name', () => {
    const shown = [orders, keys(0), keys(3), document('7'), playground('Playground 1')].map(
      (shows) => tabTitle(shows, []).text,
    );
    expect(shown).toEqual(['orders', 'Keys', 'Keys · db3', 'orders · 7', 'Playground 1']);
    expect(shown.some((title) => title.includes('Local') || title.includes('Cache local'))).toBe(false);
    const namespace: TabShows = {
      kind: 'keys',
      connection: cacheLocal.id,
      database: 3,
      namespace: 'session:',
      separator: ':',
    };
    expect(tabTitle(namespace, []).text).toBe('session:');
  });

  it('a key name of 57 characters is cut in the middle to 32', () => {
    const key: TabShows = {
      kind: 'key',
      connection: cacheLocal.id,
      database: 0,
      key: 'cache:product:5f0c1e2a-7b6d-4c1e-9a55-0e2d7c9b1f44:detail',
      separator: ':',
    };
    expect(tabTitle(key, []).text).toBe('cache:product:5f0c1e…1f44:detail');
  });
});

describe('tab.same-target', () => {
  it('shop.orders of Local twice, the second time with another filter, leaves one tab', async () => {
    const h = harness();
    await h.open(orders);
    await h.start((await import('../../../src/features/tab/open')).feature, {
      shows: JSON.parse(JSON.stringify(orders)) as never,
      memory: { query: '{ status: "paid" }' },
    });
    expect(h.titles()).toEqual(['orders']);
    expect(h.tab('orders').memory).toEqual({ query: '{ status: "paid" }' });
  });

  it('the document _id NumberLong(7) is the document _id 7; "7" is another', () => {
    const seven = targetKey(document('7', '{"$numberInt":"7"}'));
    expect(targetKey(document('NumberLong(7)', '{"$numberLong":"7"}'))).toBe(seven);
    expect(targetKey(document('7.0', '{"$numberDouble":"7.0"}'))).toBe(seven);
    expect(targetKey(document('"7"', '"7"'))).not.toBe(seven);
  });

  it('New playground twice opens two tabs; the same file twice, without regard to case on Windows, opens one', () => {
    expect(targetKey(playground('Playground 1'))).not.toBe(targetKey(playground('Playground 2')));
    const one = targetKey(playground('cleanup.mongodb.js', 'C:\\work\\cleanup.mongodb.js'), 'windows');
    expect(targetKey(playground('cleanup.mongodb.js', 'c:\\WORK\\cleanup.mongodb.js'), 'windows')).toBe(one);
  });

  it('the console of Cache local chosen twice leaves one console tab', async () => {
    const h = harness();
    const console: TabShows = { kind: 'console', connection: cacheLocal.id };
    await h.open(console);
    await h.open(console);
    expect(h.titles()).toEqual(['Console']);
  });

  it('the same collection on two connections has two tabs, one in each group', async () => {
    const h = harness([local, staging]);
    await h.open(orders);
    await h.open(collection('orders', 'shop', staging.id));
    expect(h.state().tabs.tabs.map((tab) => (tab.shows.kind === 'app' ? '' : tab.shows.connection))).toEqual([
      'local',
      'staging',
    ]);
  });

  it('the keys of db0 with a pattern and without are the same; a namespace and db0 are not', () => {
    expect(targetKey(keys(0))).toBe(targetKey({ ...keys(0) }));
    const namespace: TabShows = {
      kind: 'keys',
      connection: cacheLocal.id,
      database: 0,
      namespace: 'orders:',
      separator: ':',
    };
    expect(targetKey(namespace)).not.toBe(targetKey(keys(0)));
  });

  it('a page of the app is page:settings, as the places of Back name it', () => {
    expect(targetKey({ kind: 'app', page: 'settings' })).toBe('page:settings');
  });
});

describe('tab.fit', () => {
  const label = [80];
  const wide = (count: number): number[] => Array.from({ length: count }, () => 240);

  it('opening tabs one after the other narrows them together to 96 px; the next one makes the strip scroll', () => {
    expect(fit(1000, label, wide(4))).toEqual({ widths: [200, 200, 200, 200], scrolls: false });
    expect(fit(1000, label, wide(6)).widths).toEqual(Array.from({ length: 6 }, () => 153));
    expect(fit(1000, label, wide(9))).toEqual({ widths: Array.from({ length: 9 }, () => 102), scrolls: false });
    expect(fit(1000, label, wide(10))).toEqual({ widths: Array.from({ length: 10 }, () => 96), scrolls: true });
  });

  it('a tab titled db0 is never widened to match the others', () => {
    const { widths } = fit(1000, label, [100, 100, 240, 240, 240, 240]);
    expect(widths).toEqual([100, 100, 180, 180, 180, 180]);
    expect(fit(1000, label, [60, 240]).widths[0]).toBe(60);
  });

  it('closing tabs until they fit again stops the scrolling, which removes All tabs', () => {
    expect(fit(1000, label, wide(10)).scrolls).toBe(true);
    expect(fit(1000, label, wide(9)).scrolls).toBe(false);
  });

  it('the labels of the groups are never narrowed: they are taken from the strip first', () => {
    expect(fit(1000, [80, 120], wide(4)).widths).toEqual([200, 200, 200, 200]);
    expect(fit(1000, [80, 120], wide(5)).widths).toEqual([160, 160, 160, 160, 160]);
  });
});
