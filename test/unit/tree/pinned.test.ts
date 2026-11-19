import { describe, expect, it } from 'vitest';
import { menu, view } from '../../../src/features/tree/pinned';
import type { Pin } from '../../../src/shared/state/nav';
import { inputOf, mongoConnection, redisConnection, stateOf } from './context';

const pins: readonly Pin[] = [
  { kind: 'collection', database: 'shop', collection: 'orders' },
  { kind: 'namespace', database: 0, namespace: 'orders:' },
  { kind: 'key', database: 0, keyHex: '6f72646572733a3432' },
  { kind: 'saved-query', database: 'shop', collection: 'orders', name: 'Late orders' },
  { kind: 'page', page: 'monitor', title: 'Monitor' },
];

describe('tree.pinned', () => {
  it('lists the items in the order nav.pin keeps them, each with its icon, its name and where it is', () => {
    expect(view(inputOf({ pins })).map((node) => [node.icon, node.name, node.after])).toEqual([
      ['table', 'orders', 'shop'],
      ['symbol-namespace', 'orders:', 'db0'],
      ['key', 'orders:42', 'db0'],
      ['bookmark', 'Late orders', 'shop.orders'],
      ['browser', 'Monitor', undefined],
    ]);
  });

  it('with no pinned item there is nothing to show', () => {
    expect(view(inputOf())).toEqual([]);
  });

  it('pins belong to one connection: another connection shows its own', () => {
    const local = mongoConnection();
    const cache = redisConnection();
    const state = stateOf({ connections: [local, cache], current: cache });
    const input = { ...inputOf(), state: { ...state, nav: { ...state.nav, pins: { [local.id]: pins } } } };
    expect(view(input)).toEqual([]);
  });

  it('a click opens through tab.open, which makes an open tab active instead of opening another', () => {
    const [orders, namespace, key] = view(inputOf({ pins }));
    expect(orders?.click).toMatchObject({
      element: 'tree.pinned@tree',
      feature: 'tab.open',
      args: { shows: { kind: 'collection', database: 'shop', collection: 'orders' } },
    });
    expect(namespace?.click).toMatchObject({ args: { shows: { kind: 'keys', database: 0, namespace: 'orders:' } } });
    expect(key?.click).toMatchObject({ args: { shows: { kind: 'key', database: 0, key: 'orders:42' } } });
  });

  it('an item whose collection no longer exists stays listed, and Unpin removes it', () => {
    const gone: Pin = { kind: 'collection', database: 'dropped', collection: 'old' };
    const input = inputOf({ pins: [gone] });
    expect(view(input).map((node) => node.name)).toEqual(['old']);
    expect(
      menu(input, gone).map((entry) => (entry.kind === 'item' ? [entry.control.label, entry.control.element] : [])),
    ).toEqual([
      ['Open', 'tree.pinned@tree-menu'],
      ['Unpin', 'nav.pin@tree-menu'],
    ]);
  });
});
