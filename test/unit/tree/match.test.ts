import { describe, expect, it } from 'vitest';
import { matches } from '../../../src/features/tree/match';

describe('tree.match', () => {
  it('ord matches the collection orders of shop', () => {
    expect(matches('ord', { kind: 'collection', database: 'shop', name: 'orders' })).toBe(true);
  });

  it('shop.ord matches shop.orders; orders.shop does not', () => {
    expect(matches('shop.ord', { kind: 'collection', database: 'shop', name: 'orders' })).toBe(true);
    expect(matches('orders.shop', { kind: 'collection', database: 'shop', name: 'orders' })).toBe(false);
  });

  it('SHOP matches the database shop, and so does " Shop ", trimmed', () => {
    expect(matches('SHOP', { kind: 'database', name: 'shop' })).toBe(true);
    expect(matches(' Shop ', { kind: 'database', name: 'shop' })).toBe(true);
  });

  it('shop matches shop.users: the name of the database is part of the text', () => {
    expect(matches('shop', { kind: 'collection', database: 'shop', name: 'users' })).toBe(true);
  });

  it('fs matches the bucket fs of media', () => {
    expect(matches('fs', { kind: 'collection', database: 'media', name: 'fs' })).toBe(true);
  });

  it('2024 matches the namespace orders:2024:; orders:* does not, nothing being a wildcard', () => {
    expect(matches('2024', { kind: 'namespace', prefix: 'orders:2024:' })).toBe(true);
    expect(matches('orders:*', { kind: 'namespace', prefix: 'orders:2024:' })).toBe(false);
    expect(matches('?', { kind: 'namespace', prefix: 'orders:' })).toBe(false);
  });

  it('db1 matches db1, db10 and db15, not db0', () => {
    expect([1, 10, 15, 0].map((number) => matches('db1', { kind: 'redis-database', number }))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it('an empty filter matches every node', () => {
    expect(matches('  ', { kind: 'database', name: 'anything' })).toBe(true);
  });
});
