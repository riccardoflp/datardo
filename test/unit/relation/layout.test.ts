import { describe, expect, it } from 'vitest';
import { layout, type LayoutGraph } from '../../../src/features/relation/layout';
import type { Box, SampledCollection } from '../../../src/features/relation/types';
import { relation, withFields } from './context';

const shop: LayoutGraph = {
  collections: [
    withFields('audit', ['_id']),
    withFields('customers', ['_id', 'name', 'email']),
    withFields('logs', ['_id']),
    withFields('orders', ['_id', 'customerId', 'productId', 'total']),
    withFields('products', ['_id', 'name']),
  ],
  relations: [relation('orders.customerId', 'customers._id'), relation('orders.productId', 'products._id')],
};

function boxOf(boxes: readonly Box[], name: string): readonly number[] {
  const box = boxes.find((each) => each.name === name);
  return box === undefined ? [] : [box.left, box.top, box.height];
}

function overlap(left: Box, right: Box): boolean {
  return (
    left.left < right.left + right.width &&
    right.left < left.left + left.width &&
    left.top < right.top + right.height &&
    right.top < left.top + left.height
  );
}

function wide(name: string, count: number): SampledCollection {
  return withFields(name, ['_id', ...Array.from({ length: count - 2 }, (_, at) => `f${String(at)}`), 'ref']);
}

describe('relation.layout', () => {
  it('gives the boxes and the size of the worked example', () => {
    const drawn = layout(shop, false);
    expect(boxOf(drawn.boxes, 'customers')).toEqual([0, 0, 95]);
    expect(boxOf(drawn.boxes, 'products')).toEqual([0, 131, 76]);
    expect(boxOf(drawn.boxes, 'orders')).toEqual([370, 46.5, 114]);
    expect(boxOf(drawn.boxes, 'audit')).toEqual([0, 279, 57]);
    expect(boxOf(drawn.boxes, 'logs')).toEqual([305, 279, 57]);
    expect([drawn.width, drawn.height]).toEqual([610, 336]);
    expect(drawn.boxes.every((box) => box.width === 240)).toBe(true);
  });

  it('puts reviews, which refers to orders, in column 2 at the left 740', () => {
    const drawn = layout(
      {
        collections: [...shop.collections, withFields('reviews', ['orderId'])],
        relations: [...shop.relations, relation('reviews.orderId', 'orders._id')],
      },
      false,
    );
    expect(drawn.boxes.find((box) => box.name === 'reviews')?.left).toBe(740);
  });

  it('places two collections that refer to each other in two columns, and ends', () => {
    const drawn = layout(
      {
        collections: [withFields('a', ['_id', 'bId']), withFields('b', ['_id', 'aId'])],
        relations: [relation('a.bId', 'b._id'), relation('b.aId', 'a._id')],
      },
      false,
    );
    const [a, b] = drawn.boxes;
    expect(a?.left).not.toBe(b?.left);
  });

  it('puts a collection that refers only to itself in the grid of the unrelated ones', () => {
    const drawn = layout(
      {
        collections: [withFields('categories', ['_id', 'parentId']), withFields('logs', ['_id'])],
        relations: [relation('categories.parentId', 'categories._id')],
      },
      false,
    );
    expect(drawn.boxes.map((box) => [box.name, box.left, box.top])).toEqual([
      ['categories', 0, 0],
      ['logs', 305, 0],
    ]);
  });

  it('places seven unrelated collections in rows of 3, 3 and 1, the first at the top 0', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const drawn = layout({ collections: names.map((name) => withFields(name, ['_id'])), relations: [] }, false);
    expect(drawn.boxes.map((box) => box.top)).toEqual([0, 0, 0, 93, 93, 93, 186]);
    expect(drawn.boxes.map((box) => box.left)).toEqual([0, 305, 610, 0, 305, 610, 0]);
  });

  it('gives a box of 14 rows with 2 keys the height 76 with Keys only', () => {
    const graph: LayoutGraph = {
      collections: [wide('orders', 20), withFields('customers', ['_id'])],
      relations: [relation('orders.ref', 'customers._id')],
    };
    expect(layout(graph, false).boxes.find((box) => box.name === 'orders')?.height).toBe(30 + 15 * 19 + 8);
    expect(layout(graph, true).boxes.find((box) => box.name === 'orders')?.height).toBe(76);
  });

  it('gives the same boxes twice, every collection one box, and no two boxes overlapping', () => {
    const first = layout(shop, false);
    expect(layout(shop, false)).toEqual(first);
    expect(first.boxes.map((box) => box.name).sort()).toEqual(['audit', 'customers', 'logs', 'orders', 'products']);
    const pairs = first.boxes.flatMap((box, at) => first.boxes.slice(at + 1).map((other) => overlap(box, other)));
    expect(pairs.every((each) => !each)).toBe(true);
  });
});
