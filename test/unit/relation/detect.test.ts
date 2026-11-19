import { describe, expect, it } from 'vitest';
import { relations, relationText, type SampledDatabase } from '../../../src/features/relation/detect';
import type {
  Candidate,
  FoundValues,
  ReferenceType,
  Relation,
  SampledField,
  TargetField,
} from '../../../src/features/relation/types';
import type { Json } from '../../../src/shared/engine-request';
import { int, long, oid, relation, sampled, view } from './context';

const noCollections: SampledDatabase = { database: 'shop', collections: [] };

function field(path: string, several = false): SampledField {
  return {
    path,
    label: path.replace('items.', 'items[].'),
    depth: path.split('.').length - 1,
    types: [],
    share: 1,
    several,
    values: [],
    dbrefs: [],
  };
}

/** A candidate of `orders`; a field of `items` holds several references. */
function candidate(path: string, type: ReferenceType, values: readonly Json[], targets: readonly string[]): Candidate {
  const at = targets.map((each): TargetField => {
    const [collection = '', name = ''] = each.split('.');
    return { collection, field: name };
  });
  return { collection: 'orders', field: field(path, path.startsWith('items.')), type, values, targets: at };
}

function objectIds(count: number): readonly Json[] {
  return Array.from({ length: count }, (_, at) => oid(`a${String(at)}`));
}

function strings(count: number): readonly Json[] {
  return Array.from({ length: count }, (_, at) => `P-${String(at)}`);
}

function found(target: string, values: readonly Json[]): FoundValues {
  const [collection = '', name = ''] = target.split('.');
  return { collection, field: name, values };
}

function detected(each: Candidate, results: readonly FoundValues[]): readonly string[] {
  return relations(noCollections, [each], results).map((one) => `${one.from}.${one.field} → ${one.to}.${one.toField}`);
}

describe('relation.detect', () => {
  it.each([
    [
      'customerId, 20 ObjectIds, found 20 and 0',
      candidate('customerId', 'objectId', objectIds(20), ['customers._id', 'orders._id']),
      [found('customers._id', objectIds(20))],
      ['orders.customerId → customers._id'],
    ],
    [
      'items[].productId, 20 strings, 18 found',
      candidate('items.productId', 'string', strings(20), ['products._id']),
      [found('products._id', strings(18))],
      ['orders.items.productId → products._id'],
    ],
    [
      'note, 1 ObjectId, found nowhere',
      candidate('note', 'objectId', objectIds(1), ['customers._id', 'orders._id']),
      [found('customers._id', []), found('orders._id', [])],
      [],
    ],
    [
      'customerEmail, 20 strings, 20 found',
      candidate('customerEmail', 'string', strings(20), ['customers.email']),
      [found('customers.email', strings(20))],
      ['orders.customerEmail → customers.email'],
    ],
    [
      'storeId, 5 Int32 found as Int64',
      candidate('storeId', 'number', [1, 2, 3, 4, 5].map(int), ['stores._id']),
      [found('stores._id', ['1', '2', '3', '4', '5'].map(long))],
      ['orders.storeId → stores._id'],
    ],
    [
      'parentId, 20 ObjectIds, 0 and 4 found (20%)',
      candidate('parentId', 'objectId', objectIds(20), ['customers._id', 'orders._id']),
      [found('orders._id', objectIds(4))],
      ['orders.parentId → orders._id'],
    ],
    [
      'refundOf, 20 ObjectIds, 0 and 3 found (15%)',
      candidate('refundOf', 'objectId', objectIds(20), ['customers._id', 'orders._id']),
      [found('orders._id', objectIds(3))],
      [],
    ],
    [
      'productId, 11 of 20 strings (55%)',
      candidate('productId', 'string', strings(20), ['products._id']),
      [found('products._id', strings(11))],
      [],
    ],
    [
      'productId, 12 of 20 strings (60%)',
      candidate('productId', 'string', strings(20), ['products._id']),
      [found('products._id', strings(12))],
      ['orders.productId → products._id'],
    ],
    [
      'productId, 1 of 1 string (fewer than 3 looked up)',
      candidate('productId', 'string', strings(1), ['products._id']),
      [found('products._id', strings(1))],
      ['orders.productId → products._id'],
    ],
    [
      'productId, 1 of 2 strings (50%)',
      candidate('productId', 'string', strings(2), ['products._id']),
      [found('products._id', strings(1))],
      [],
    ],
    [
      'productId, 2 of 3 strings (67%, and 2 found)',
      candidate('productId', 'string', strings(3), ['products._id']),
      [found('products._id', strings(2))],
      ['orders.productId → products._id'],
    ],
  ])('%s', (_name, each, results, expected) => {
    expect(detected(each, results)).toEqual(expected);
  });

  it('describes the items[].productId reference as many-to-many', () => {
    const [found18] = relations(
      noCollections,
      [candidate('items.productId', 'string', strings(20), ['products._id'])],
      [found('products._id', strings(18))],
    );
    expect(found18 === undefined ? '' : relationText(found18)).toBe(
      'orders.items[].productId → products._id · many-to-many (an array of references) · 18 of 20 sampled values found',
    );
  });

  it('gives a DBRef owner its relation, and none for a DBRef of another database', () => {
    const shop: SampledDatabase = {
      database: 'shop',
      collections: [
        sampled('customers', [{ _id: oid('1') }]),
        sampled('orders', [
          { _id: oid('2'), owner: { $ref: 'customers', $id: oid('1') } },
          { _id: oid('3'), seller: { $ref: 'customers', $id: 7, $db: 'crm' } },
        ]),
      ],
    };
    const [owner, ...others] = relations(shop, [], []);
    expect(others).toEqual([]);
    expect(owner).toMatchObject({ from: 'orders', field: 'owner', to: 'customers', toField: '_id', kind: 'dbref' });
    expect(owner === undefined ? '' : relationText(owner)).toBe('orders.owner → customers._id · many-to-one · DBRef');
  });

  it('accepts a DBRef whose $db is this database', () => {
    const shop: SampledDatabase = {
      database: 'shop',
      collections: [
        sampled('users', [{ _id: oid('1') }]),
        sampled('posts', [{ _id: oid('2'), author: { $ref: 'users', $id: oid('1'), $db: 'shop' } }]),
      ],
    };
    expect(relations(shop, [], []).map((each) => each.kind)).toEqual(['dbref']);
  });

  it('gives an ObjectId field found in the _ids of two collections two relations', () => {
    const each = candidate('ownerId', 'objectId', objectIds(5), ['users._id', 'admins._id']);
    const results = [found('users._id', objectIds(5)), found('admins._id', objectIds(2))];
    expect(detected(each, results)).toEqual(['orders.ownerId → admins._id', 'orders.ownerId → users._id']);
  });

  it('finds NumberInt(7) in a stores._id holding NumberLong(7)', () => {
    const each = candidate('storeId', 'number', [int(7)], ['stores._id']);
    expect(detected(each, [found('stores._id', [long('7')])])).toEqual(['orders.storeId → stores._id']);
  });

  it('gives a field of DBRefs naming customers and suppliers two DBRef relations; a missing collection none', () => {
    const shop: SampledDatabase = {
      database: 'shop',
      collections: [
        sampled('customers', [{ _id: oid('1') }]),
        sampled('orders', [
          { _id: oid('2'), party: { $ref: 'customers', $id: oid('1') } },
          { _id: oid('3'), party: { $ref: 'suppliers', $id: oid('4') } },
          { _id: oid('5'), party: { $ref: 'carriers', $id: oid('6') } },
        ]),
        sampled('suppliers', [{ _id: oid('4') }]),
      ],
    };
    expect(relations(shop, [], []).map((each) => `${each.kind} ${each.to}`)).toEqual([
      'dbref customers',
      'dbref suppliers',
    ]);
  });

  it('links a view to its collection, and not to a collection the database does not have', () => {
    const shop: SampledDatabase = {
      database: 'shop',
      collections: [sampled('orders', [{ _id: oid('1') }]), view('recent', 'orders'), view('elsewhere', 'archive')],
    };
    const listed = relations(shop, [], []);
    expect(listed.map(relationText)).toEqual(['recent is a view of orders']);
  });

  it('describes a field inside an array and an array of ids as holding several references', () => {
    const items = relation('orders.items.productId', 'products._id', {
      fieldLabel: 'items[].productId',
      several: true,
    });
    const tags = relation('orders.tagIds', 'tags._id', { several: true });
    expect(relationText(items)).toContain('many-to-many (an array of references)');
    expect(relationText(tags)).toContain('many-to-many (an array of references)');
    const listed = sampled('orders', [{ _id: 1, items: [{ productId: 'P-1' }], tagIds: [oid('1')] }]).fields;
    expect(listed.filter((each) => each.several).map((each) => each.path)).toEqual(['items.productId', 'tagIds']);
  });

  it('describes a reference as in the card', () => {
    expect(relationText(relation('orders.customerId', 'customers._id'))).toBe(
      'orders.customerId → customers._id · many-to-one · 20 of 20 sampled values found',
    );
  });

  it('returns the reference of carts before the one of orders', () => {
    const fromOrders = candidate('customerId', 'objectId', objectIds(3), ['customers._id']);
    const fromCarts: Candidate = { ...fromOrders, collection: 'carts' };
    const listed: readonly Relation[] = relations(
      noCollections,
      [fromOrders, fromCarts],
      [found('customers._id', objectIds(3))],
    );
    expect(listed.map((each) => each.from)).toEqual(['carts', 'orders']);
  });
});
