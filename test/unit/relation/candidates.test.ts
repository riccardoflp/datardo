import { describe, expect, it } from 'vitest';
import { candidates, idType, type CandidateSample } from '../../../src/features/relation/candidates';
import { parseUnique } from '../../../src/features/relation/read';
import type { Candidate } from '../../../src/features/relation/types';
import type { Json } from '../../../src/shared/engine-request';
import { int, long, oid, sampled } from './context';

function ids(prefix: string, count: number): readonly Json[] {
  return Array.from({ length: count }, (_, at) => oid(`${prefix}${String(at).padStart(4, '0')}`));
}

const customerIds = ids('c', 45);

function orders(): readonly Json[] {
  return customerIds.map((customerId, at) => ({
    _id: oid(`a${String(at).padStart(4, '0')}`),
    customerId,
    items: [{ productId: `P-${String(at)}` }],
    status: 'paid',
    total: { $numberDouble: '12.5' },
    storeId: int(at % 5),
    customerEmail: `c${String(at)}@example.com`,
    email: `o${String(at)}@example.com`,
    code: `K${String(at)}`,
    ref: at % 2 === 0 ? oid(`f${String(at).padStart(4, '0')}`) : `R-${String(at)}`,
  }));
}

function database(productsUnique: readonly string[] = []): readonly CandidateSample[] {
  return [
    sampled(
      'customers',
      ids('c', 10).map((_id, at) => ({ _id, email: `c${String(at)}@example.com`, name: 'Ada' })),
      ['email'],
    ),
    sampled('orders', orders()),
    sampled(
      'products',
      [0, 1, 2].map((at) => ({ _id: `P-${String(at)}`, code: `K${String(at)}` })),
      productsUnique,
    ),
    sampled(
      'stores',
      [0, 1].map((at) => ({ _id: long(String(at)) })),
    ),
  ];
}

function targetsOf(list: readonly Candidate[], path: string, type?: string): readonly string[] {
  return list
    .filter((each) => each.collection === 'orders' && each.field.path === path)
    .filter((each) => type === undefined || each.type === type)
    .flatMap((each) => each.targets.map((target) => `${target.collection}.${target.field}`));
}

describe('relation.candidates', () => {
  const found = candidates(database());

  it.each([
    ['customerId', ['customers._id', 'orders._id']],
    ['items.productId', ['products._id']],
    ['status', []],
    ['total', []],
    ['storeId', ['stores._id']],
    ['customerEmail', ['customers.email']],
    ['email', ['customers.email']],
    ['code', []],
    ['_id', []],
  ])('looks %s up in %j', (path, targets) => {
    expect(targetsOf(found, path)).toEqual(targets);
  });

  it('looks code up in products.code once products has a unique index on code alone', () => {
    expect(targetsOf(candidates(database(['code'])), 'code')).toEqual(['products.code']);
  });

  it('looks the ObjectIds of ref up in customers._id and orders._id, and its strings nowhere', () => {
    expect(targetsOf(found, 'ref', 'objectId')).toEqual(['customers._id', 'orders._id']);
    expect(targetsOf(found, 'ref', 'string')).toEqual([]);
  });

  it('looks up the first 20 of 45 distinct ObjectIds, in the order of the sample', () => {
    const customer = found.find((each) => each.collection === 'orders' && each.field.path === 'customerId');
    expect(customer?.values).toEqual(customerIds.slice(0, 20));
  });

  it('gives no target for a unique index of two fields, a partial unique index or the _id_ index', () => {
    const unique = parseUnique([
      { v: 2, key: { _id: 1 }, name: '_id_' },
      { v: 2, key: { code: 1, shop: 1 }, name: 'code_1_shop_1', unique: true },
      { v: 2, key: { code: 1 }, name: 'code_1', unique: true, partialFilterExpression: { code: { $exists: true } } },
    ]);
    expect(unique).toEqual([]);
    expect(targetsOf(candidates(database(unique)), 'code')).toEqual([]);
  });

  it('never makes the _id of orders a candidate, also when its ObjectIds are _ids of another collection', () => {
    const shared = ids('b', 3);
    const list = candidates([
      sampled(
        'orders',
        shared.map((_id) => ({ _id })),
      ),
      sampled(
        'archive',
        shared.map((_id) => ({ _id })),
      ),
    ]);
    expect(list).toEqual([]);
  });

  it('gives a collection with 60 ObjectId and 40 string _ids the type ObjectId', () => {
    const accounts = sampled('accounts', [
      ...ids('a', 60).map((_id) => ({ _id })),
      ...Array.from({ length: 40 }, (_, at) => ({ _id: `A-${String(at)}` })),
    ]);
    expect(idType(accounts)).toBe('objectId');
    const list = candidates([accounts, sampled('payments', [{ _id: oid('d1'), accountId: 'A-1' }])]);
    expect(list.filter((each) => each.field.path === 'accountId')).toEqual([]);
  });

  it('finds no candidate in a database of one collection, unless ObjectIds can be looked up in its own _ids', () => {
    expect(candidates([sampled('logs', [{ _id: oid('1'), level: 'info', count: 3 }])])).toEqual([]);
    const tree = candidates([sampled('categories', [{ _id: oid('1'), parentId: oid('2') }])]);
    expect(tree.map((each) => [each.field.path, each.targets])).toEqual([
      ['parentId', [{ collection: 'categories', field: '_id' }]],
    ]);
  });
});
