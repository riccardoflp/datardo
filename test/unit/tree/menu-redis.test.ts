import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/tree/menu-redis';
import { patternOf } from '../../../src/features/tree/namespaces';
import type { MenuEntry, NodeRef } from '../../../src/features/tree/types';
import { inputOf, redisConnection } from './context';

function labels(entries: readonly MenuEntry[]): readonly string[] {
  return entries.map((entry) => (entry.kind === 'item' ? entry.control.label : '—'));
}

function namespace(prefix: string): NodeRef {
  return { kind: 'namespace', database: 0, prefix, prefixHex: '', pattern: patternOf(prefix) };
}

function menu(node: NodeRef, options: Parameters<typeof inputOf>[0] = {}): readonly MenuEntry[] {
  return view(inputOf({ connections: [redisConnection()], ...options }), node);
}

function control(entries: readonly MenuEntry[], label: string) {
  const found = entries.find((entry) => entry.kind === 'item' && entry.control.label === label);
  return found?.kind === 'item' ? found.control : undefined;
}

describe('tree.menu-redis', () => {
  it('the heading Databases offers Open console; Refresh and Collapse all', () => {
    expect(labels(menu({ kind: 'heading', part: 'databases' }))).toEqual([
      'Open console',
      '—',
      'Refresh',
      'Collapse all',
    ]);
  });

  it('a database offers its entries in groups', () => {
    expect(labels(menu({ kind: 'redis-database', database: 2 }))).toEqual([
      'Open keys',
      'Open console here',
      '—',
      'Set color…',
      '—',
      'New key…',
      '—',
      'Import keys…',
      'Export keys…',
      '—',
      'Delete keys by pattern…',
      '—',
      'Refresh',
    ]);
  });

  it('a namespace offers its entries in groups', () => {
    expect(labels(menu(namespace('orders:')))).toEqual([
      'Open keys',
      'Pin',
      '—',
      'New key…',
      '—',
      'Export keys…',
      'Delete keys by pattern…',
      '—',
      'Refresh',
    ]);
  });

  it('Delete keys by pattern… on a[1]: starts with the pattern a\\[1\\]:*', () => {
    expect(control(menu(namespace('a[1]:')), 'Delete keys by pattern…')).toMatchObject({
      element: 'key.delete-by-pattern@tree-menu',
      feature: 'key.delete-by-pattern',
      args: { connection: 'c-cache', database: 0, pattern: 'a\\[1\\]:*' },
    });
  });

  it('on a read-only connection New key…, Import keys… and Delete keys by pattern… are not shown', () => {
    const readOnly = { connections: [redisConnection({ readOnly: true })] };
    expect(labels(menu({ kind: 'redis-database', database: 0 }, readOnly))).toEqual([
      'Open keys',
      'Open console here',
      '—',
      'Set color…',
      '—',
      'Export keys…',
      '—',
      'Refresh',
    ]);
  });

  it('a database has Set color…, also on a read-only connection; a namespace has none', () => {
    expect(control(menu({ kind: 'redis-database', database: 3 }), 'Set color…')).toMatchObject({
      element: 'tree.set-database-color@tree-menu',
      feature: 'tree.set-database-color',
      args: { connection: 'c-cache', database: 3 },
    });
    expect(labels(menu(namespace('orders:')))).not.toContain('Set color…');
  });

  it('Open console here on db2 starts the console on database 2', () => {
    expect(control(menu({ kind: 'redis-database', database: 2 }), 'Open console here')).toMatchObject({
      feature: 'console.show',
      args: { connection: 'c-cache', database: 2 },
    });
  });

  it('the node <n> empty databases has no menu; an empty database under it has the menu of a database', () => {
    expect(menu({ kind: 'empty-databases', count: 14 })).toEqual([]);
    expect(labels(menu({ kind: 'redis-database', database: 9 }))[0]).toBe('Open keys');
  });

  it('Pin reads Unpin on a namespace that is pinned', () => {
    const pinned = menu(namespace('orders:'), { pins: [{ kind: 'namespace', database: 0, namespace: 'orders:' }] });
    expect(labels(pinned).slice(0, 2)).toEqual(['Open keys', 'Unpin']);
  });

  it('Refresh on a namespace refreshes its database', () => {
    expect(control(menu(namespace('orders:')), 'Refresh')).toMatchObject({
      element: 'tree.refresh@tree-menu',
      args: { scope: { kind: 'redis-database', database: 0 } },
    });
  });
});
