import { describe, expect, it } from 'vitest';
import type { FieldHint } from '../../../src/features/query/field-hints';
import { suggestions, type TextKind } from '../../../src/features/query/suggestions';

const fields: readonly FieldHint[] = [
  { path: '_id', types: ['objectId'], ratio: 1, values: [] },
  {
    path: 'status',
    types: ['string'],
    ratio: 1,
    values: [
      { value: 'paid', count: 310 },
      { value: 'new', count: 120 },
    ],
  },
  { path: 'total', types: ['double', 'int'], ratio: 0.98, values: [] },
  { path: 'address', types: ['object'], ratio: 1, values: [] },
  { path: 'address.city', types: ['string'], ratio: 1, values: [] },
  { path: 'items', types: ['array'], ratio: 1, values: [] },
  { path: 'items.sku', types: ['string'], ratio: 1, values: [] },
];

const top = ['$and', '$or', '$nor', '$expr', '$text', '$jsonSchema', '$where', '$comment'];
const operators = [
  '$eq',
  '$ne',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$in',
  '$nin',
  '$exists',
  '$type',
  '$regex',
  '$options',
  '$elemMatch',
  '$size',
  '$all',
  '$not',
  '$mod',
];

function at(written: string, kind: TextKind = 'filter', hints: readonly FieldHint[] = fields) {
  const cursor = written.indexOf('|');
  return suggestions(written.replace('|', ''), cursor, kind, { fields: hints });
}

function labels(written: string, kind: TextKind = 'filter') {
  const found = at(written, kind);
  return found && { position: found.position, labels: found.items.map((item) => item.label) };
}

describe('query.suggestions', () => {
  it('gives exactly the suggestions of each example of the card, in that order', () => {
    expect(labels('{ |')).toEqual({
      position: 'key',
      labels: ['_id', 'status', 'total', 'address', 'address.city', 'items', 'items.sku', ...top],
    });
    expect(at('{ st|')?.items[0]).toMatchObject({ label: 'status', insert: 'status: ' });
    expect(at('{ ci|')?.items[0]).toMatchObject({ label: 'address.city', insert: '"address.city": ' });
    expect(labels('{ status: |')).toEqual({ position: 'value', labels: ['"paid"', '"new"'] });
    expect(at('{ status: "|')?.items.map((item) => item.insert)).toEqual(['paid"', 'new"']);
    expect(labels('{ total: { |')).toEqual({ position: 'key', labels: operators });
    expect(labels('{ total: { $g|')?.labels).toEqual(['$gt', '$gte']);
    expect(labels('{ status: { $in: [|')).toEqual({ position: 'value', labels: ['"paid"', '"new"'] });
    expect(labels('{ items: { $elemMatch: { |')?.labels).toEqual(['sku', ...operators, ...top]);
    expect(labels('{ $|')).toEqual({ position: 'key', labels: top });
    for (const nothing of ['{ status: "paid" }|', '{ a: 1 } // |', '{ name: /ma|']) {
      expect(at(nothing), nothing).toBeUndefined();
    }
    expect(labels('{ total: |', 'sort')).toEqual({ position: 'value', labels: ['1', '-1'] });
    expect(labels('{ status: |', 'project')).toEqual({ position: 'value', labels: ['1', '0'] });
  });

  it('puts the details of values and the skeletons of operators', () => {
    expect(at('{ status: |')?.items.map((item) => item.detail)).toEqual(['×310', '×120']);
    const inOperator = at('{ total: { $i|')?.items.find((item) => item.label === '$in');
    expect(inOperator).toMatchObject({ insert: '$in: []', cursor: 6 });
    const elemMatch = at('{ items: { $el|')?.items.find((item) => item.label === '$elemMatch');
    expect(elemMatch).toMatchObject({ insert: '$elemMatch: {  }', cursor: 14 });
  });

  it('inserts the names in a string already opened without their opening quote', () => {
    const found = at('{ "addr|');
    // The name is closed with its quote; as for any key, :  follows (open question: the card writes the name alone).
    expect(found?.items.map((item) => [item.label, item.insert])).toEqual([
      ['address', 'address": '],
      ['address.city', 'address.city": '],
    ]);
  });

  it('inserts the name alone when the colon is there', () => {
    const found = at('{ addr|: 1 }');
    expect(found?.items.map((item) => item.insert)).toEqual(['address', '"address.city"']);
    expect(found?.items.every((item) => item.cursor === undefined)).toBe(true);
  });

  it('writes the detail of a field with its types and its share', () => {
    const detail = (name: string) => at('{ |')?.items.find((item) => item.label === name)?.detail;
    expect(detail('total')).toBe('double | int · 98%');
    expect(detail('status')).toBe('string');
  });

  it('suggests the 8 operators of the top with no field read yet', () => {
    expect(at('{ |', 'filter', [])?.items.map((item) => item.label)).toEqual(top);
  });

  it('gives the same suggestions for the same text, cursor, kind and fields', () => {
    expect(at('{ total: { $g|')).toEqual(at('{ total: { $g|'));
  });

  it('suggests nothing inside the parentheses of a helper or between a key and its colon', () => {
    expect(at('{ _id: ObjectId("|')).toBeUndefined();
    expect(at('{ status |')).toBeUndefined();
  });

  it('suggests update operators, stages and index values', () => {
    expect(at('{ $s|', 'update')?.items[0]?.label).toBe('$set');
    expect(at('[{ $ma|', 'pipeline')?.items[0]).toMatchObject({ label: '$match', kind: 'stage' });
    expect(labels('{ a: |', 'index')?.labels).toEqual(['1', '-1', '"text"', '"2dsphere"', '"hashed"']);
  });
});
