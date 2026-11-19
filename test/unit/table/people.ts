/**
 * The documents the cards of the table area work on: *the three people* of `shop.people`, as canonical Extended JSON.
 */
import { BSON } from 'mongodb';
import type { Document } from '../../../src/features/table/types';
import type { ColumnNode } from '../../../src/features/table/types';
import { canonical } from '../query/values';

/** A document of the driver as canonical Extended JSON. */
export function documentOf(value: Record<string, unknown>): Document {
  return canonical(value) as Document;
}

/** Ada, Bob and Cy. */
export const people: readonly Document[] = [
  documentOf({
    _id: 1,
    name: 'Ada',
    address: { city: 'Milano', zip: '20100' },
    items: [
      { sku: 'A1', qty: 2 },
      { sku: 'B2', qty: 1, options: { color: 'red' } },
    ],
    tags: ['a', 'b'],
  }),
  documentOf({ _id: 2, name: 'Bob', address: 'unknown', email: 'bob@example.com', items: [], tags: [] }),
  documentOf({
    _id: 3,
    name: 'Cy',
    address: { city: 'Roma', geo: { lat: new BSON.Double(41.9), lng: new BSON.Double(12.5) } },
    items: [{ sku: 'C3', qty: 5, parts: [{ n: 1 }] }, 7],
  }),
];

/** The leaves of a tree of columns, written as the cards write them: `address ▸`, `items ▸[]`. */
export function leafNames(nodes: readonly ColumnNode[]): string[] {
  return nodes.flatMap((node) => {
    if (node.children !== undefined) {
      return leafNames(node.children);
    }
    if (!node.expandable) {
      return [node.key];
    }
    return [node.array ? `${node.key} ▸[]` : `${node.key} ▸`];
  });
}

/** The keys of the leaves of a tree of columns. */
export function leafKeys(nodes: readonly ColumnNode[]): string[] {
  return nodes.flatMap((node) => (node.children === undefined ? [node.key] : leafKeys(node.children)));
}
