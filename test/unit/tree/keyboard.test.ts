import { describe, expect, it } from 'vitest';
import { noTypeAhead, view, type KeyboardInput } from '../../../src/features/tree/keyboard';
import { view as mongodbView } from '../../../src/features/tree/mongodb';
import { view as redisView } from '../../../src/features/tree/redis';
import { view as showView } from '../../../src/features/tree/show';
import type { MongoTreeData, TreeItem, TreeLine } from '../../../src/features/tree/types';
import { inputOf, mongoConnection, redisConnection } from './context';

const data: MongoTreeData = {
  databases: { kind: 'loaded', value: [{ name: 'admin' }, { name: 'shop' }] },
  contents: {
    shop: {
      kind: 'loaded',
      value: {
        buckets: [],
        entries: [
          { name: 'orders', kind: 'collection', system: false },
          { name: 'reviews', kind: 'collection', system: false },
          { name: 'users', kind: 'collection', system: false },
        ],
      },
    },
  },
  counts: {},
};

function shown(expanded: readonly string[] = ['database:shop']): readonly TreeItem[] {
  const island = showView(inputOf({ island: { mongodb: data, expanded } }));
  return island.kind === 'tree' ? island.items : [];
}

function press(key: string, focus: string, more: Partial<KeyboardInput> = {}) {
  return view({ items: shown(), focus, key, typed: noTypeAhead, now: 50_000, ...more });
}

describe('tree.keyboard', () => {
  it('Down and Up move through the parts and their headings; Home and End to the first and the last', () => {
    expect(press('Down', 'heading:databases').effect).toEqual({ kind: 'focus', item: 'database:admin' });
    expect(press('Up', 'database:admin').effect).toEqual({ kind: 'focus', item: 'heading:databases' });
    expect(press('Down', 'collection:shop.users').effect).toEqual({ kind: 'focus', item: 'heading:pages' });
    expect(press('Home', 'collection:shop.users').effect).toEqual({ kind: 'focus', item: 'heading:databases' });
    expect(press('End', 'database:admin').effect).toEqual({ kind: 'focus', item: 'page:tasks' });
  });

  it('Right expands a collapsed node, moves into an expanded one, and does nothing on a node with nothing under it', () => {
    expect(press('Right', 'database:admin').effect).toEqual({ kind: 'expand', item: 'database:admin' });
    expect(press('Right', 'database:shop').effect).toEqual({ kind: 'focus', item: 'collection:shop.orders' });
    expect(press('Right', 'collection:shop.orders').effect).toEqual({ kind: 'none' });
  });

  it('Left collapses an expanded node, and otherwise moves to the node it is under', () => {
    expect(press('Left', 'database:shop').effect).toEqual({ kind: 'collapse', item: 'database:shop' });
    expect(press('Left', 'collection:shop.orders').effect).toEqual({ kind: 'focus', item: 'database:shop' });
  });

  it('Enter opens the tab of a collection, and expands or collapses a MongoDB database or a heading', () => {
    expect(press('Enter', 'collection:shop.orders').effect).toMatchObject({
      kind: 'start',
      control: { feature: 'tab.open' },
    });
    expect(press('Enter', 'database:admin').effect).toEqual({ kind: 'expand', item: 'database:admin' });
    expect(press('Enter', 'heading:pages').effect).toEqual({ kind: 'collapse', item: 'heading:pages' });
    expect(press('Enter', 'page:monitor').effect).toMatchObject({
      kind: 'start',
      control: { element: 'monitor.show@tree' },
    });
  });

  it('Space expands or collapses the node and opens nothing', () => {
    expect(press('Space', 'database:shop').effect).toEqual({ kind: 'collapse', item: 'database:shop' });
    expect(press('Space', 'collection:shop.orders').effect).toEqual({ kind: 'none' });
  });

  it('Right on a collapsed Redis database expands it, which scans; Enter on it opens its keys tab and scans nothing', () => {
    const databases = { count: 1, databases: [{ number: 0, keys: 3, expires: 0, averageTtlMs: 0 }] };
    const items = redisView(
      inputOf({
        connections: [redisConnection()],
        island: { redis: { databases: { kind: 'loaded', value: databases }, scans: {} } },
      }),
      redisConnection(),
    );
    const at = (key: string) => view({ items, focus: 'redis-database:0', key, typed: noTypeAhead, now: 0 }).effect;
    expect(at('Right')).toEqual({ kind: 'expand', item: 'redis-database:0' });
    expect(at('Enter')).toMatchObject({ kind: 'start', control: { element: 'key.show@tree', feature: 'tab.open' } });
  });

  it('Enter on Load more scans further, on Retry reads again, on Connect connects', () => {
    const line = (button: string): TreeLine => ({
      kind: 'line',
      id: `x/${button}`,
      level: 2,
      tone: 'quiet',
      text: button,
      button: {
        kind: 'start',
        label: button,
        element: 'tree.scan-namespaces@tree',
        feature: button,
        target: { kind: 'app' },
      },
    });
    for (const feature of ['tree.scan-namespaces', 'tree.refresh', 'connection.connect']) {
      const effect = view({
        items: [line(feature)],
        focus: `x/${feature}`,
        key: 'Enter',
        typed: noTypeAhead,
        now: 0,
      }).effect;
      expect(effect).toMatchObject({ kind: 'start', control: { feature } });
    }
  });

  it('typing or quickly moves to orders; typing o, waiting two seconds and typing r moves to the next node that starts with r', () => {
    const first = press('o', 'database:shop', { now: 1000 });
    expect(first.effect).toEqual({ kind: 'focus', item: 'collection:shop.orders' });
    const quick = press('r', 'collection:shop.orders', { now: 1300, typed: first.typed });
    expect(quick.effect).toEqual({ kind: 'focus', item: 'collection:shop.orders' });
    const slow = press('r', 'collection:shop.orders', { now: 3000, typed: first.typed });
    expect(slow.effect).toEqual({ kind: 'focus', item: 'collection:shop.reviews' });
  });

  it('Shift+F10 and the menu key open the context menu of the node', () => {
    expect(press('Shift+F10', 'collection:shop.orders').effect).toEqual({
      kind: 'menu',
      item: 'collection:shop.orders',
    });
    expect(press('ContextMenu', 'heading:databases').effect).toEqual({ kind: 'menu', item: 'heading:databases' });
  });

  it('F5 refreshes the whole connection from a heading, and the database of the node otherwise; Ctrl+F opens the filter', () => {
    expect(press('F5', 'heading:databases').effect).toEqual({ kind: 'refresh', scope: { kind: 'connection' } });
    expect(press('F5', 'collection:shop.orders').effect).toEqual({
      kind: 'refresh',
      scope: { kind: 'database', database: 'shop' },
    });
    expect(press('Ctrl+F', 'database:shop').effect).toEqual({ kind: 'filter' });
  });

  it('the buttons a node shows on hover are reached through its context menu', () => {
    const shop = mongodbView(inputOf({ island: { mongodb: data } }), mongoConnection()).find(
      (item) => item.id === 'database:shop',
    );
    expect(shop?.kind === 'node' ? [shop.hasMenu, shop.buttons.length] : []).toEqual([true, 2]);
  });

  it('no key of the tree writes to a deployment: Delete does nothing', () => {
    expect(press('Delete', 'collection:shop.orders').effect).toEqual({ kind: 'none' });
  });
});
