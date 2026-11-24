import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/tree/menu-mongodb';
import type { MenuEntry, NodeRef } from '../../../src/features/tree/types';
import { inputOf, mongoConnection } from './context';

const orders: NodeRef = {
  kind: 'collection',
  database: 'shop',
  name: 'orders',
  collectionKind: 'collection',
  system: false,
};
const active: NodeRef = { kind: 'collection', database: 'shop', name: 'active', collectionKind: 'view', system: false };
const weather: NodeRef = {
  kind: 'collection',
  database: 'shop',
  name: 'weather',
  collectionKind: 'timeseries',
  system: false,
};
const views: NodeRef = {
  kind: 'collection',
  database: 'shop',
  name: 'system.views',
  collectionKind: 'collection',
  system: true,
};

function labels(entries: readonly MenuEntry[]): readonly string[] {
  return entries.map((entry) => (entry.kind === 'item' ? entry.control.label : '—'));
}

function menu(node: NodeRef, options: Parameters<typeof inputOf>[0] = {}): readonly MenuEntry[] {
  return view(inputOf(options), node);
}

describe('tree.menu-mongodb', () => {
  it('the heading Databases offers its entries in groups', () => {
    expect(labels(menu({ kind: 'heading', part: 'databases' }))).toEqual([
      'Create database…',
      'New playground',
      '—',
      'Back up…',
      'Restore from backup…',
      'Schedule…',
      '—',
      'Refresh',
      'Collapse all',
    ]);
  });

  it('a database offers its entries in groups, and no Open: there is no page of a database', () => {
    expect(labels(menu({ kind: 'database', database: 'shop' }))).toEqual([
      'Create collection…',
      'New playground',
      '—',
      'Set color…',
      'Exclude from searches',
      '—',
      'Search documents…',
      'Relationship diagram',
      '—',
      'Back up…',
      'Restore from backup…',
      'Schedule…',
      '—',
      'Manage users and roles',
      'Watch changes',
      'Index advisor',
      '—',
      'Compare structure with…',
      'Upload files to GridFS…',
      '—',
      'Refresh',
      '—',
      'Drop database…',
    ]);
  });

  it('a collection offers its entries in groups', () => {
    expect(labels(menu(orders))).toEqual([
      'Open',
      'Pin',
      '—',
      'Set color…',
      'Exclude from searches',
      '—',
      'Insert document',
      'New playground',
      '—',
      'Search documents…',
      'Relationship diagram',
      'Indexes',
      '—',
      'Watch changes',
      'Index advisor',
      '—',
      'Import documents…',
      'Generate test documents…',
      'Export collection…',
      'Copy collection to…',
      'Compare with…',
      'Back up…',
      'Restore from backup…',
      'Schedule…',
      '—',
      'Rename collection…',
      'Edit validation rules…',
      '—',
      'Drop…',
    ]);
  });

  it('Drop… on shop.orders starts manage.drop-collection on that collection, and the tree runs nothing itself', () => {
    const drop = menu(orders).find((entry) => entry.kind === 'item' && entry.control.label === 'Drop…');
    expect(drop?.kind === 'item' ? drop.control : undefined).toMatchObject({
      kind: 'start',
      element: 'manage.drop-collection@tree-menu',
      feature: 'manage.drop-collection',
      target: { kind: 'connection', connection: 'c-local' },
      args: { connection: 'c-local', database: 'shop', collection: 'orders' },
    });
  });

  it('on a read-only connection the entries that only write are not shown; the editors of rules and definitions stay', () => {
    const readOnly = { connections: [mongoConnection({ readOnly: true })] };
    const shown = [
      ...labels(menu({ kind: 'heading', part: 'databases' }, readOnly)),
      ...labels(menu({ kind: 'database', database: 'shop' }, readOnly)),
      ...labels(menu(orders, readOnly)),
      ...labels(menu(active, readOnly)),
      ...labels(menu({ kind: 'bucket', database: 'shop', name: 'fs' }, readOnly)),
    ];
    for (const writes of [
      'Create database…',
      'Create collection…',
      'Restore from backup…',
      'Upload files to GridFS…',
      'Drop database…',
      'Insert document',
      'Import documents…',
      'Generate test documents…',
      'Rename collection…',
      'Drop…',
      'Delete GridFS bucket…',
    ]) {
      expect(shown).not.toContain(writes);
    }
    expect(shown).toContain('Edit validation rules…');
    expect(shown).toContain('Edit view definition…');
  });

  it('a view never shows what writes through it, nor Indexes, Watch changes or Index advisor', () => {
    expect(labels(menu(active))).toEqual([
      'Open',
      'Pin',
      '—',
      'Set color…',
      'Exclude from searches',
      '—',
      'New playground',
      '—',
      'Search documents…',
      'Relationship diagram',
      '—',
      'Export collection…',
      'Copy collection to…',
      'Compare with…',
      'Back up…',
      'Schedule…',
      '—',
      'Edit view definition…',
      '—',
      'Drop…',
    ]);
  });

  it('a time series collection has the entries of a collection without Rename, Edit validation rules and Watch changes', () => {
    const shown = labels(menu(weather));
    expect(shown).not.toContain('Rename collection…');
    expect(shown).not.toContain('Edit validation rules…');
    expect(shown).not.toContain('Watch changes');
    expect(shown).toContain('Insert document');
  });

  it('a system collection has the entries of a collection', () => {
    expect(labels(menu(views))).toEqual(labels(menu(orders)));
  });

  it('Pin reads Unpin on a node that is pinned', () => {
    const pinned = menu(orders, { pins: [{ kind: 'collection', database: 'shop', collection: 'orders' }] });
    expect(labels(pinned).slice(0, 2)).toEqual(['Open', 'Unpin']);
  });

  it('a bucket offers Open GridFS bucket, Upload files to GridFS… and Delete GridFS bucket…', () => {
    expect(labels(menu({ kind: 'bucket', database: 'shop', name: 'fs' }))).toEqual([
      'Open GridFS bucket',
      '—',
      'Set color…',
      'Exclude from searches',
      '—',
      'Upload files to GridFS…',
      '—',
      'Delete GridFS bucket…',
    ]);
  });

  it('a database, a collection, a view, a time series collection and a bucket have Set color…, also on a read-only connection', () => {
    const readOnly = { connections: [mongoConnection({ readOnly: true })] };
    const nodes: readonly NodeRef[] = [
      { kind: 'database', database: 'shop' },
      orders,
      active,
      weather,
      { kind: 'bucket', database: 'shop', name: 'fs' },
    ];
    for (const node of nodes) {
      expect(labels(menu(node, readOnly)), node.kind).toContain('Set color…');
    }
    const setColor = (node: NodeRef): unknown => {
      const found = menu(node).find((entry) => entry.kind === 'item' && entry.control.label === 'Set color…');
      return found?.kind === 'item' ? found.control : undefined;
    };
    expect(setColor({ kind: 'database', database: 'shop' })).toMatchObject({
      element: 'tree.set-database-color@tree-menu',
      feature: 'tree.set-database-color',
      args: { connection: 'c-local', database: 'shop' },
    });
    expect(setColor(orders)).toMatchObject({
      element: 'tree.set-collection-color@tree-menu',
      feature: 'tree.set-collection-color',
      args: { connection: 'c-local', database: 'shop', collection: 'orders' },
    });
    expect(setColor({ kind: 'bucket', database: 'shop', name: 'fs' })).toMatchObject({
      feature: 'tree.set-collection-color',
      args: { connection: 'c-local', database: 'shop', bucket: 'fs' },
    });
  });

  it('an entry is shown only when its feature is built', () => {
    const shown = labels(menu(orders, { missing: ['transfer.import', 'manage.drop-collection', 'index.show'] }));
    expect(shown).not.toContain('Import documents…');
    expect(shown).not.toContain('Indexes');
    expect(shown.at(-1)).toBe('Edit validation rules…');
  });
});
