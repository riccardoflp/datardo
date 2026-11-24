import { describe, expect, it } from 'vitest';
import { tabColor, type GroupConnection } from '../../../src/features/tab/groups';
import { view as strip } from '../../../src/features/tab/strip';
import type { TabShows } from '../../../src/shared/state/tabs';
import { collection, document, harness, home, keys, saved } from './harness';

const local = saved('local', 'Local', 'mongodb', {
  color: 'red',
  databaseColors: { shop: 'teal' },
  collectionColors: { 'shop.orders': 'none' },
});
const cacheLocal = saved('cache-local', 'Cache local', 'redis', { databaseColors: { '3': 'pink' } });

function page(page: string, database?: string, of?: readonly string[], title = page): TabShows {
  return {
    kind: 'page',
    connection: local.id,
    page,
    title,
    ...(database === undefined ? {} : { database }),
    ...(of === undefined ? {} : { of }),
  };
}

/** The color of each tab of the strip, by its title, `plain` for none. */
function colorsOf(h: ReturnType<typeof harness>): Readonly<Record<string, string>> {
  return Object.fromEntries(
    strip(h.state()).groups.flatMap((group) => group.tabs.map((tab) => [tab.title, tab.color ?? 'plain'])),
  );
}

describe('tab.groups', () => {
  it('gives the tabs of Local the colors of the worked example, and its group stays red', async () => {
    const h = harness([local, cacheLocal]);
    await h.open(collection('orders'));
    await h.open(collection('users'));
    await h.open(collection('users', 'crm'));
    await h.open(page('diagram', 'shop', undefined, 'Diagram of shop'));
    await h.open(page('monitor', undefined, undefined, 'Monitor'));
    expect(colorsOf(h)).toEqual({
      orders: 'plain',
      'users · shop': 'teal',
      'users · crm': 'plain',
      'Diagram of shop · shop': 'teal',
      Monitor: 'plain',
    });
    expect(strip(h.state()).groups.find((group) => group.connection === local.id)?.label?.color).toBe('red');
  });

  it('gives the keys tab and a key tab of db3 pink, and the keys tab of db0 and the console none', async () => {
    const h = harness([local, cacheLocal]);
    await h.open(keys(3));
    await h.open({ kind: 'key', connection: cacheLocal.id, database: 3, key: 'session:42', separator: ':' });
    await h.open(keys(0));
    await h.open({ kind: 'console', connection: cacheLocal.id });
    const tabs = strip(h.state()).groups.flatMap((group) => group.tabs);
    expect(tabs.map((tab) => tab.color ?? 'plain')).toEqual(['pink', 'pink', 'plain', 'plain']);
  });

  it('turns the collection tab and the document tab of shop.orders pink at once, and leaves the group red', async () => {
    const h = harness([local, cacheLocal]);
    await h.open(home);
    await h.open(collection('orders'));
    await h.open(document('7'));
    const pink = { ...local, collectionColors: { 'shop.orders': 'pink' } } as const;
    h.holder.dispatch({ slice: 'connections', type: 'saved', connection: pink });
    const group = strip(h.state()).groups.find((each) => each.connection === local.id);
    expect(group?.tabs.map((tab) => tab.color)).toEqual(['pink', 'pink']);
    expect(group?.label?.color).toBe('red');
    expect(strip(h.state()).groups[0]?.tabs[0]?.color).toBeUndefined();
  });

  it('colors the pages of one collection, of a bucket, of a database, and none of the whole connection', () => {
    const connection: GroupConnection = {
      id: local.id,
      name: 'Local',
      state: 'connected',
      color: 'red',
      databaseColors: { shop: 'teal' },
      collectionColors: { 'shop.orders': '#1e90ff', 'media.fs.files': 'pink' },
    };
    const examples: readonly (readonly [TabShows, string | undefined])[] = [
      [page('watch', 'shop', ['orders']), '#1e90ff'],
      [page('watch', 'shop'), 'teal'],
      [page('watch'), undefined],
      [page('advisor', 'shop', ['users']), 'teal'],
      [page('history', 'shop', ['orders', '{"$oid":"65f1"}']), '#1e90ff'],
      [page('gridfs', 'media', ['fs']), 'pink'],
      [page('compare', 'shop', ['shop.orders']), '#1e90ff'],
      [page('structure', 'shop'), 'teal'],
      [page('overview'), undefined],
      [page('search'), undefined],
      [{ kind: 'playground', connection: local.id, title: 'Playground 1' }, undefined],
    ];
    for (const [shows, color] of examples) {
      expect(tabColor(shows, connection), JSON.stringify(shows)).toBe(color);
    }
  });
});

describe('tab.strip', () => {
  it('draws the icon of orders teal, and those of users and Home in their usual color', async () => {
    const teal = saved('local', 'Local', 'mongodb', { color: 'red', collectionColors: { 'shop.orders': 'teal' } });
    const h = harness([teal, cacheLocal]);
    await h.open(home);
    await h.open(collection('orders'));
    await h.open(collection('users'));
    expect(colorsOf(h)).toEqual({ Home: 'plain', orders: 'teal', users: 'plain' });
  });
});
