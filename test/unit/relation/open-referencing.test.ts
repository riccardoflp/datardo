import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/relation/open-referencing';
import { collectionReferences } from '../../../src/features/relation/targets';
import type { Relation } from '../../../src/features/relation/types';
import type { Json } from '../../../src/shared/engine-request';
import type { Outcome } from '../../../src/shared/feature';
import { ada, contextOn, local, oid, planOf, relation } from './context';

const references: readonly Relation[] = [
  relation('orders.userId', 'users._id'),
  relation('posts.comments.authorId', 'users._id', { fieldLabel: 'comments[].authorId' }),
  relation('posts.author', 'users._id', { kind: 'dbref', found: 0, lookedUp: 0 }),
  relation('posts.tagIds', 'tags._id', { several: true }),
  relation('categories.parentId', 'categories._id'),
];

function open(collection: string, document: Json, label: string): Outcome {
  const incoming = collectionReferences(references, collection).incoming;
  const args = { connection: local.id, database: 'shop', incoming, document, label };
  return plan(contextOn('relation.open-referencing'), { args });
}

describe('relation.open-referencing', () => {
  it('opens shop.orders with the filter on userId', () => {
    const opened = planOf(open('users', { _id: ada }, 'orders.userId'));
    expect(opened.steps).toEqual([
      expect.objectContaining({
        kind: 'app',
        text: 'open shop.orders with the filter { userId: ObjectId("65f1c0a2b3d4e5f6a7b8c9aa") }',
        args: expect.objectContaining({ collection: 'orders', sort: '', projection: '' }) as unknown,
      }),
    ]);
    expect(opened.title).toBe('Find referencing documents');
  });

  it('opens shop.posts with the tag in the array tagIds', () => {
    expect(planOf(open('tags', { _id: oid('01') }, 'posts.tagIds')).steps[0]).toMatchObject({
      text: 'open shop.posts with the filter { tagIds: ObjectId("000000000000000000000001") }',
    });
  });

  it('opens shop.posts on comments.authorId', () => {
    expect(planOf(open('users', { _id: ada }, 'posts.comments[].authorId')).steps[0]).toMatchObject({
      text: 'open shop.posts with the filter { "comments.authorId": ObjectId("65f1c0a2b3d4e5f6a7b8c9aa") }',
    });
  });

  it('opens the same collection for a collection that refers to itself', () => {
    expect(planOf(open('categories', { _id: oid('c1') }, 'categories.parentId')).steps[0]).toMatchObject({
      args: { collection: 'categories', filter: '{ parentId: ObjectId("0000000000000000000000c1") }' },
    });
  });

  it('opens the filter on author.$id for a field of DBRefs', () => {
    expect(planOf(open('users', { _id: ada }, 'posts.author')).steps[0]).toMatchObject({
      args: { filter: '{ "author.$id": ObjectId("65f1c0a2b3d4e5f6a7b8c9aa") }' },
    });
  });

  it('opens nothing for a line that is not there', () => {
    expect(planOf(open('orders', { _id: oid('1') }, 'orders.userId')).steps).toEqual([]);
  });
});
