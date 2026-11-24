import { describe, expect, it } from 'vitest';
import { contentsOf } from '../../../src/features/tree/list-collections';
import { isExcluded, type ExclusionTarget } from '../../../src/features/tree/excluded';
import { matches } from '../../../src/features/tree/match';
import { view as mongodbView } from '../../../src/features/tree/mongodb';
import { databasesToList } from '../../../src/features/tree/show';
import type { MongoTreeData, TreeIsland } from '../../../src/features/tree/types';
import { inputOf, linesOf, mongoConnection, nodesOf } from './context';

const names = (list: readonly string[]) => list.map((name) => ({ name, type: 'collection' }));

/** Local with `archive` and `shop.logs` excluded from searches. */
const local = mongoConnection({ exclusions: ['archive', 'shop.logs'] });

const data: MongoTreeData = {
  databases: {
    kind: 'loaded',
    value: [
      { name: 'archive', sizeOnDisk: 3_355_443 },
      { name: 'crm', sizeOnDisk: 0 },
      { name: 'shop', sizeOnDisk: 0 },
    ],
  },
  contents: {
    archive: { kind: 'loaded', value: contentsOf(names(['old'])) },
    crm: { kind: 'loaded', value: contentsOf(names(['people'])) },
    shop: { kind: 'loaded', value: contentsOf(names(['logs', 'orders', 'users'])) },
  },
  counts: { 'shop.logs': 120, 'shop.orders': 3 },
};

function shown(more: Partial<TreeIsland> = {}, connection = local) {
  const input = inputOf({
    connections: [connection],
    island: { mongodb: data, expanded: ['database:archive', 'database:shop'], ...more },
  });
  return nodesOf(mongodbView(input, connection));
}

describe('tree.match', () => {
  const excluded = (exclusions: readonly string[], target: ExclusionTarget): boolean =>
    isExcluded({ exclusions }, target);

  it('gives the examples with what is excluded', () => {
    const orders = { kind: 'collection', database: 'shop', collection: 'orders' } as const;
    const node = (exclusions: readonly string[]) => ({
      kind: 'collection' as const,
      database: 'shop',
      name: 'orders',
      excluded: excluded(exclusions, orders),
    });
    expect(matches('ord', node(['shop.orders']))).toBe(false);
    expect(matches('ord', node(['shop']))).toBe(false);
    expect(matches('', node(['shop']))).toBe(true);
    const archive = excluded(['archive'], { kind: 'database', database: 'archive' });
    expect(matches('arch', { kind: 'database', name: 'archive', excluded: archive })).toBe(false);
    const bucket = excluded(['media.fs.files'], { kind: 'bucket', database: 'media', bucket: 'fs' });
    expect(matches('fs', { kind: 'collection', database: 'media', name: 'fs', excluded: bucket })).toBe(false);
  });
});

describe('tree.mongodb', () => {
  it('marks archive, its collections and logs excluded, dimmed, and leaves shop and its other collections', () => {
    const nodes = shown();
    const byName = (name: string) => nodes.find((node) => node.name === name);
    expect(byName('archive')?.after).toBe('excluded · 3.2 MB');
    expect(byName('old')?.after).toBe('excluded with its database');
    expect(byName('logs')?.after).toBe('excluded · 120');
    expect(['archive', 'old', 'logs'].map((name) => byName(name)?.dimmed)).toEqual([true, true, true]);
    expect(['shop', 'orders', 'users'].map((name) => byName(name)?.dimmed)).toEqual([false, false, false]);
    expect(byName('orders')?.after).toBe('3');
    expect(byName('logs')?.hover).toBe('shop.logs\nExcluded from searches');
    expect(byName('old')?.hover).toBe('archive.old\nExcluded from searches with the database archive');
  });

  it('says excluded with the name of an excluded node to a screen reader', () => {
    const nodes = shown();
    expect(nodes.find((node) => node.name === 'logs')?.label).toBe('logs, excluded, 120 documents, collection');
    expect(nodes.find((node) => node.name === 'old')?.label).toBe('old, excluded with its database, collection');
  });

  it('draws an excluded node dimmed instead of in its color', () => {
    const colored = mongoConnection({ exclusions: ['shop.logs'], collectionColors: { 'shop.logs': 'teal' } });
    const logs = shown({}, colored).find((node) => node.name === 'logs');
    expect(logs?.dimmed).toBe(true);
    expect(logs?.color).toBeUndefined();
  });

  it('dims nothing on a connection excluded as a whole', () => {
    const whole = mongoConnection({ excluded: true });
    expect(shown({}, whole).some((node) => node.dimmed)).toBe(false);
  });
});

describe('tree.filter', () => {
  it('typing o shows shop with orders and not logs, and nothing of archive', () => {
    const input = inputOf({ connections: [local], island: { mongodb: data, filter: { open: true, text: 'o' } } });
    expect(linesOf(mongodbView(input, local))).toEqual(['crm', 'people', 'shop', 'orders', 'users']);
  });

  it('typing archive shows Nothing matches "archive"', () => {
    const input = inputOf({ connections: [local], island: { mongodb: data, filter: { open: true, text: 'archive' } } });
    expect(linesOf(mongodbView(input, local))).toEqual(['Nothing matches "archive"']);
  });

  it('sends no listCollections for archive', () => {
    const idle: MongoTreeData = { ...data, contents: { crm: data.contents['crm'] ?? { kind: 'idle' } } };
    const island = { ...inputOf().island, mongodb: idle, filter: { open: true, text: 'o' } };
    expect(databasesToList(island, local)).toEqual(['shop']);
  });

  it('shows the excluded nodes again, dimmed, with the field empty', () => {
    const nodes = shown({ filter: { open: true, text: '' } });
    expect(nodes.filter((node) => node.dimmed).map((node) => node.name)).toEqual(['archive', 'old', 'logs']);
  });
});
