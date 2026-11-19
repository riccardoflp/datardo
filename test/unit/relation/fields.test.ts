import { describe, expect, it } from 'vitest';
import { fields } from '../../../src/features/relation/fields';
import type { Json } from '../../../src/shared/engine-request';
import { int, oid } from './context';

const example: readonly Json[] = [
  {
    _id: { $oid: '65f1c0a2b3d4e5f6a7b8c9d0' },
    customerId: { $oid: '65f1c0a2b3d4e5f6a7b8c9aa' },
    items: [
      { productId: 'P-1', qty: int(2) },
      { productId: 'P-7', qty: int(1) },
    ],
    tagIds: [oid('01'), oid('02')],
  },
  { _id: { $oid: '65f1c0a2b3d4e5f6a7b8c9d1' }, customerId: null, ship: { city: 'Turin' } },
];

describe('relation.fields', () => {
  it('gives the table of the worked example', () => {
    const table = fields(example).map((field) => [
      field.path,
      field.label,
      field.depth,
      field.types,
      field.share,
      field.several,
    ]);
    expect(table).toEqual([
      ['_id', '_id', 0, ['objectId'], 1, false],
      ['customerId', 'customerId', 0, ['objectId', 'null'], 1, false],
      ['items', 'items', 0, ['array', 'object'], 0.5, false],
      ['items.productId', 'items[].productId', 1, ['string'], 0.5, true],
      ['items.qty', 'items[].qty', 1, ['int'], 0.5, true],
      ['tagIds', 'tagIds', 0, ['array', 'objectId'], 0.5, true],
      ['ship', 'ship', 0, ['object'], 0.5, false],
      ['ship.city', 'ship.city', 1, ['string'], 0.5, false],
    ]);
  });

  it('gives the values that could be references of the worked example', () => {
    const values = Object.fromEntries(fields(example).map((field) => [field.path, field.values]));
    expect(values['customerId']).toEqual([{ type: 'objectId', values: [{ $oid: '65f1c0a2b3d4e5f6a7b8c9aa' }] }]);
    expect(values['items.productId']).toEqual([{ type: 'string', values: ['P-1', 'P-7'] }]);
    expect(values['items.qty']).toEqual([{ type: 'number', values: [int(2), int(1)] }]);
    expect(values['tagIds']).toEqual([{ type: 'objectId', values: [oid('01'), oid('02')] }]);
    expect(values['ship.city']).toEqual([{ type: 'string', values: ['Turin'] }]);
    expect(values['items']).toEqual([]);
  });

  it('keeps the first 300 of 350 different paths, in order of appearance', () => {
    const document = Object.fromEntries(Array.from({ length: 350 }, (_, at) => [`f${String(at)}`, at]));
    const paths = fields([document]).map((field) => field.path);
    expect(paths).toHaveLength(300);
    expect(paths[0]).toBe('f0');
    expect(paths[299]).toBe('f299');
  });

  it('gives a share of 80% to a field in 80 of 100 documents, also inside arrays of several elements', () => {
    const documents = Array.from({ length: 100 }, (_, at) =>
      at < 80 ? { _id: at, items: [{ sku: 'a' }, { sku: 'b' }, { sku: 'c' }] } : { _id: at },
    );
    const sku = fields(documents).find((field) => field.path === 'items.sku');
    expect(sku?.share).toBe(0.8);
  });

  it('skips an array inside an array', () => {
    const [, a] = fields([{ _id: 1, a: [[1, 2]] }]);
    expect(a).toMatchObject({ path: 'a', types: [], values: [] });
  });

  it('gives an empty array the type array', () => {
    const [, a] = fields([{ _id: 1, a: [] }]);
    expect(a).toMatchObject({ path: 'a', types: ['array'] });
  });

  it('gives a DBRef the type dbref, the collection it names, and no sub-fields', () => {
    const listed = fields([{ _id: 1, author: { $ref: 'users', $id: 7 } }]);
    expect(listed.map((field) => field.path)).toEqual(['_id', 'author']);
    expect(listed[1]).toMatchObject({ types: ['dbref'], dbrefs: [{ collection: 'users' }] });
  });

  it('keeps the first 100 of 250 distinct strings', () => {
    const documents = Array.from({ length: 250 }, (_, at) => ({ _id: at, code: `c${String(at)}` }));
    const code = fields(documents).find((field) => field.path === 'code');
    const strings = code?.values.find((typed) => typed.type === 'string')?.values ?? [];
    expect(strings).toHaveLength(100);
    expect(strings[0]).toBe('c0');
    expect(strings[99]).toBe('c99');
  });
});
