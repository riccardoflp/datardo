import { describe, expect, it } from 'vitest';
import type { Json } from '../../../src/shared/engine-request';
import { documentFields, updatedFields } from '../../../src/features/oplog/updated-fields';

describe('oplog.updated-fields', () => {
  it.each<[string, Json | undefined, readonly string[] | undefined]>([
    [
      'operators',
      { $set: { a: 1, b: 2 }, $inc: { n: 1 }, $unset: { c: '' }, $setOnInsert: { _id: 1 } },
      ['a', 'b', 'n', 'c'],
    ],
    [
      'paths cut at a position or a placeholder',
      { $set: { 'address.city': 'x', 'items.1.qty': 2, 'tags.$': 'y', 'list.$[el].v': 1, 'a.b.0': 1 } },
      ['address.city', 'items', 'tags', 'list', 'a.b'],
    ],
    ['$rename', { $rename: { old: 'new', 'a.b': 'c.d', 'list.0': 'x' } }, ['old', 'a.b', 'list', 'new', 'c.d', 'x']],
    ['a replacement', { _id: 1, name: 'x', age: 3 }, ['name', 'age']],
    [
      'a pipeline of $set, $addFields and $unset',
      [{ $set: { a: 1 } }, { $addFields: { 'b.c': 2 } }, { $unset: ['d', 'e.1'] }, { $unset: 'f' }],
      ['a', 'b.c', 'd', 'e', 'f'],
    ],
    ['a pipeline with $replaceWith', [{ $set: { a: 1 } }, { $replaceWith: '$b' }], undefined],
    ['an empty update', {}, []],
    ['no update', undefined, []],
    ['an empty pipeline', [], []],
  ])('%s', (_name, update, fields) => {
    expect(updatedFields(update)).toEqual(fields);
  });

  it('gives the fields of the documents before and after, without _id', () => {
    expect(documentFields({ _id: 1, a: 1, b: 2 }, { _id: 1, b: 3, c: 4 }, null)).toEqual(['a', 'b', 'c']);
  });

  it('cuts only at a position, never a name that starts with a digit', () => {
    expect(updatedFields({ $set: { 'a.b1': 1, 'a.1b': 2 } })).toEqual(['a.b1', 'a.1b']);
  });
});
