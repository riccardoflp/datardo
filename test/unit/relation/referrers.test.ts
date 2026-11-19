import { describe, expect, it } from 'vitest';
import { referencingTargets } from '../../../src/features/relation/referrers';
import { collectionReferences } from '../../../src/features/relation/targets';
import type { ReferenceTarget } from '../../../src/features/relation/types';
import { ada, oid, relation, shopReferences } from './context';

function incoming(collection: string): ReturnType<typeof collectionReferences>['incoming'] {
  return collectionReferences(shopReferences, collection).incoming;
}

function shown(targets: readonly ReferenceTarget[]): readonly string[][] {
  return targets.map((target) => [target.collection, target.filterText, target.label]);
}

const objectIdAa = 'ObjectId("65f1c0a2b3d4e5f6a7b8c9aa")';

describe('relation.referrers', () => {
  it('finds what refers to a user with an email, in the order of the labels', () => {
    expect(shown(referencingTargets(incoming('users'), { _id: ada, email: 'ada@example.com' }))).toEqual([
      ['orders', `{ customer: ${objectIdAa} }`, 'orders.customer'],
      ['orders', '{ customerEmail: "ada@example.com" }', 'orders.customerEmail'],
      ['orders', `{ owner: ${objectIdAa} }`, 'orders.owner'],
      ['posts', `{ "author.$id": ${objectIdAa} }`, 'posts.author'],
    ]);
  });

  it('finds the same without orders.customerEmail for a user without email', () => {
    const labels = referencingTargets(incoming('users'), { _id: oid('ab') }).map((target) => target.label);
    expect(labels).toEqual(['orders.customer', 'orders.owner', 'posts.author']);
  });

  it('finds what refers to a tag', () => {
    const tag = '{ tagIds: ObjectId("000000000000000000000001") }';
    expect(shown(referencingTargets(incoming('tags'), { _id: oid('01') }))).toEqual([
      ['orders', tag, 'orders.tagIds'],
      ['posts', tag, 'posts.tagIds'],
    ]);
  });

  it('finds what refers to an admin', () => {
    expect(shown(referencingTargets(incoming('admins'), { _id: oid('ac') }))).toEqual([
      ['orders', '{ owner: ObjectId("0000000000000000000000ac") }', 'orders.owner'],
    ]);
  });

  it('finds nothing for an order: nothing refers to orders', () => {
    expect(referencingTargets(incoming('orders'), { _id: oid('1') })).toEqual([]);
  });

  it('labels a field inside an array with [] and writes its filter on the dotted path', () => {
    const comments = [relation('posts.comments.authorId', 'users._id', { fieldLabel: 'comments[].authorId' })];
    expect(shown(referencingTargets(comments, { _id: ada }))).toEqual([
      ['posts', `{ "comments.authorId": ${objectIdAa} }`, 'posts.comments[].authorId'],
    ]);
  });

  it('gives no target for the references to _id when the _id is a sub-document', () => {
    expect(referencingTargets(incoming('users'), { _id: { region: 'eu', n: 1 } })).toEqual([]);
  });

  it('gives one target for two references with the same collection and filter', () => {
    const twice = [relation('orders.customer', 'users._id'), relation('orders.customer', 'users._id')];
    expect(referencingTargets(twice, { _id: ada })).toHaveLength(1);
  });

  it('never gives a target for the relation of a view to its collection', () => {
    const viewOnly = [relation('recent', 'orders', { kind: 'view', field: '', fieldLabel: '', toField: '' })];
    expect(referencingTargets(viewOnly, { _id: ada })).toEqual([]);
  });
});
