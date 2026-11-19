import { describe, expect, it } from 'vitest';
import { collectionReferences, referenceTargets } from '../../../src/features/relation/targets';
import type { ReferenceTarget } from '../../../src/features/relation/types';
import type { Json } from '../../../src/shared/engine-request';
import { ada, long, oid, relation, shopReferences, uuid } from './context';

const orders = collectionReferences(shopReferences, 'orders').outgoing;
const posts = collectionReferences(shopReferences, 'posts').outgoing;

function shown(targets: readonly ReferenceTarget[]): readonly (string | number)[][] {
  return targets.map((target) => [target.collection, target.filterText, target.label, target.count]);
}

describe('relation.targets', () => {
  it('leads customer to users on _id', () => {
    expect(shown(referenceTargets(orders, 'customer', ada, 'shop'))).toEqual([
      ['users', '{ _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9aa") }', 'users._id', 1],
    ]);
  });

  it('leads tagIds to tags with $in, each value once', () => {
    const [target] = referenceTargets(orders, 'tagIds', [oid('01'), oid('02'), oid('01')], 'shop');
    expect(target?.filter).toEqual({ _id: { $in: [oid('01'), oid('02')] } });
    expect(target?.count).toBe(2);
    expect(target?.filterText).toBe(
      '{ _id: { $in: [ObjectId("000000000000000000000001"), ObjectId("000000000000000000000002")] } }',
    );
  });

  it('leads tagIds holding one value to tags without $in', () => {
    expect(shown(referenceTargets(orders, 'tagIds', [oid('01')], 'shop'))).toEqual([
      ['tags', '{ _id: ObjectId("000000000000000000000001") }', 'tags._id', 1],
    ]);
  });

  it('leads customerEmail to users on email', () => {
    expect(shown(referenceTargets(orders, 'customerEmail', 'ada@example.com', 'shop'))).toEqual([
      ['users', '{ email: "ada@example.com" }', 'users.email', 1],
    ]);
  });

  it('leads owner to users and to admins with the same filter', () => {
    const targets = referenceTargets(orders, 'owner', ada, 'shop');
    expect(targets.map((target) => target.label)).toEqual(['users._id', 'admins._id']);
    expect(new Set(targets.map((target) => target.filterText)).size).toBe(1);
  });

  it('leads a DBRef author to users on _id, also from the column author.$id', () => {
    const expected = [['users', '{ _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9aa") }', 'users._id', 1]];
    expect(shown(referenceTargets(posts, 'author', { $ref: 'users', $id: ada }, 'shop'))).toEqual(expected);
    expect(shown(referenceTargets(posts, 'author.$id', ada, 'shop'))).toEqual(expected);
  });

  it('leads a DBRef of another database nowhere', () => {
    expect(referenceTargets(posts, 'author', { $ref: 'users', $id: ada, $db: 'crm' }, 'shop')).toEqual([]);
  });

  it.each<[string, Json | undefined]>([
    ['null', null],
    ['missing', undefined],
    ['an empty string', ''],
    ['true', true],
    ['a date', { $date: { $numberLong: '1700000000000' } }],
  ])('leads a customer that is %s nowhere', (_name, value) => {
    expect(referenceTargets(orders, 'customer', value, 'shop')).toEqual([]);
  });

  it('leads total nowhere: the field is not a reference', () => {
    expect(referenceTargets(orders, 'total', { $numberDouble: '42.5' }, 'shop')).toEqual([]);
  });

  it('writes a Long as NumberLong(7) and a UUID as UUID("…")', () => {
    const outgoing = [relation('orders.storeId', 'stores._id'), relation('orders.sessionId', 'sessions._id')];
    expect(referenceTargets(outgoing, 'storeId', long('7'), 'shop')[0]?.filterText).toBe('{ _id: NumberLong(7) }');
    const session = referenceTargets(outgoing, 'sessionId', uuid('0123456789abcdef0123456789abcdef'), 'shop');
    expect(session[0]?.filterText).toBe('{ _id: UUID("01234567-89ab-cdef-0123-456789abcdef") }');
  });

  it('drops a null and counts a duplicate once in an array', () => {
    const [target] = referenceTargets(orders, 'tagIds', [null, 'a', oid('01'), oid('01')], 'shop');
    expect(target?.filterText).toBe('{ _id: { $in: ["a", ObjectId("000000000000000000000001")] } }');
  });

  it('never gives a target for the relation of a view to its collection', () => {
    expect(collectionReferences(shopReferences, 'recent')).toEqual({ outgoing: [], incoming: [] });
    const viewOnly = shopReferences.filter((each) => each.kind === 'view');
    expect(referenceTargets(viewOnly, '', ada, 'shop')).toEqual([]);
  });
});
