import { describe, expect, it } from 'vitest';
import { contentsOf } from '../../../src/features/tree/list-collections';
import { view } from '../../../src/features/tree/mongodb';
import type { MongoTreeData, TreeIsland } from '../../../src/features/tree/types';
import { inputOf, linesOf, mongoConnection, nodesOf } from './context';

const shopInfos = [
  { name: 'orders', type: 'collection' },
  { name: 'system.buckets.weather', type: 'collection' },
  { name: 'fs.files', type: 'collection' },
  { name: 'active_orders', type: 'view' },
  { name: 'weather', type: 'timeseries' },
  { name: 'fs.chunks', type: 'collection' },
  { name: 'Users', type: 'collection' },
  { name: 'system.views', type: 'collection' },
];

const shopData: MongoTreeData = {
  databases: {
    kind: 'loaded',
    value: [
      { name: 'admin', sizeOnDisk: 8192 },
      { name: 'empty', sizeOnDisk: 0 },
      { name: 'shop', sizeOnDisk: 1536 },
    ],
  },
  contents: { shop: { kind: 'loaded', value: contentsOf(shopInfos) } },
  counts: { 'shop.orders': 1204, 'shop.Users': 12_300 },
};

function island(more: Partial<TreeIsland> = {}): Partial<TreeIsland> {
  return { mongodb: shopData, expanded: ['database:shop'], ...more };
}

describe('tree.mongodb', () => {
  it('lists the databases, and under shop its buckets, its entries by name, then its system collections dimmed', () => {
    const items = view(inputOf({ island: island() }), mongoConnection());
    expect(linesOf(items)).toEqual([
      'admin',
      'empty',
      'shop',
      'fs',
      'active_orders',
      'fs.chunks',
      'fs.files',
      'orders',
      'Users',
      'weather',
      'system.buckets.weather',
      'system.views',
    ]);
    expect(
      nodesOf(items)
        .filter((node) => node.dimmed)
        .map((node) => node.name),
    ).toEqual(['system.buckets.weather', 'system.views']);
  });

  it('shows the size of a database after its name, nothing when it is 0, and its name on hover', () => {
    const nodes = nodesOf(view(inputOf({ island: island() }), mongoConnection()));
    expect(nodes.slice(0, 3).map((node) => [node.name, node.after, node.hover])).toEqual([
      ['admin', '8.0 KB', 'admin'],
      ['empty', undefined, 'empty'],
      ['shop', '1.5 KB', 'shop'],
    ]);
  });

  it('gives each kind its icon, its hover text and its count', () => {
    const nodes = nodesOf(view(inputOf({ island: island() }), mongoConnection()));
    const byName = (name: string) => nodes.find((node) => node.name === name);
    expect([byName('orders')?.icon, byName('orders')?.after, byName('orders')?.hover]).toEqual([
      'table',
      '1,204',
      'shop.orders',
    ]);
    expect([byName('Users')?.after]).toEqual(['12.3K']);
    expect([byName('active_orders')?.icon, byName('active_orders')?.after, byName('active_orders')?.hover]).toEqual([
      'eye',
      undefined,
      'shop.active_orders (view)',
    ]);
    expect([byName('weather')?.icon, byName('weather')?.after, byName('weather')?.hover]).toEqual([
      'clock',
      undefined,
      'shop.weather (time series)',
    ]);
    expect([byName('fs')?.icon, byName('fs')?.after, byName('fs')?.hover]).toEqual([
      'files',
      'GridFS',
      'GridFS bucket shop.fs (fs.files and fs.chunks)',
    ]);
  });

  it('a collection shows no count until it is counted', () => {
    const nodes = nodesOf(
      view(inputOf({ island: island({ mongodb: { ...shopData, counts: {} } }) }), mongoConnection()),
    );
    expect(nodes.find((node) => node.name === 'orders')?.after).toBeUndefined();
  });

  it('a click on orders opens its collection tab through tab.open, which makes an open tab active', () => {
    const orders = nodesOf(view(inputOf({ island: island() }), mongoConnection())).find(
      (node) => node.name === 'orders',
    );
    expect(orders?.click).toMatchObject({
      element: 'tree.mongodb@tree',
      feature: 'tab.open',
      args: { shows: { kind: 'collection', connection: 'c-local', database: 'shop', collection: 'orders' } },
    });
  });

  it('a system collection opens like any other collection; a bucket opens its GridFS page', () => {
    const nodes = nodesOf(view(inputOf({ island: island() }), mongoConnection()));
    expect(nodes.find((node) => node.name === 'system.views')?.click).toMatchObject({ feature: 'tab.open' });
    expect(nodes.find((node) => node.name === 'fs')?.click).toMatchObject({
      element: 'gridfs.show@tree',
      args: { shows: { kind: 'page', page: 'gridfs', database: 'shop', of: ['fs'] } },
    });
  });

  it('a click on a database expands or collapses it: it opens nothing', () => {
    const shop = nodesOf(view(inputOf({ island: island() }), mongoConnection())).find((node) => node.name === 'shop');
    expect(shop?.click).toBeUndefined();
    expect([shop?.expandable, shop?.expanded]).toEqual([true, true]);
  });

  it('shows Create collection…, Refresh and Insert document on hover, none that writes on a read-only connection', () => {
    const labels = (readOnly: boolean): readonly string[] =>
      nodesOf(
        view(
          inputOf({ connections: [mongoConnection({ readOnly })], island: island() }),
          mongoConnection({ readOnly }),
        ),
      )
        .filter((node) => node.name === 'shop' || node.name === 'orders' || node.name === 'fs')
        .flatMap((node) => node.buttons.map((button) => button.label));
    expect(labels(false)).toEqual(['Create collection…', 'Refresh', 'Upload files to GridFS…', 'Insert document']);
    expect(labels(true)).toEqual(['Refresh']);
  });

  it('a database that was dropped is gone once the list no longer has it', () => {
    const data = { ...shopData, databases: { kind: 'loaded', value: [{ name: 'admin' }] } as const };
    expect(linesOf(view(inputOf({ island: island({ mongodb: data }) }), mongoConnection()))).toEqual(['admin']);
  });

  it('a database with no collection shows No collections when expanded', () => {
    const data = { ...shopData, contents: { shop: { kind: 'loaded', value: { buckets: [], entries: [] } } as const } };
    const lines = linesOf(view(inputOf({ island: island({ mongodb: data }) }), mongoConnection()));
    expect(lines.slice(2)).toEqual(['shop', 'No collections']);
  });

  it('each node says its name, its kind, its count and whether it is expanded', () => {
    const nodes = nodesOf(view(inputOf({ island: island() }), mongoConnection()));
    expect(nodes.find((node) => node.name === 'shop')?.label).toBe('shop, database, expanded');
    expect(nodes.find((node) => node.name === 'orders')?.label).toBe('orders, collection, 1,204 documents');
  });
});
