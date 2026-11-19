import { describe, expect, it } from 'vitest';
import { fieldDiff, type FieldRow } from '../../../src/features/compare/field-diff';
import { inspectorView } from '../../../src/features/compare/page/inspector';
import type { EqualityOptions } from '../../../src/features/compare/types';
import type { Json } from '../../../src/shared/engine-request';
import { double, int } from './context';

function options(overrides: Partial<EqualityOptions> = {}): EqualityOptions {
  return { ignore: [], ignoreOrder: true, numbersByValue: true, ...overrides };
}

describe('compare.field-diff', () => {
  const byType = options({ numbersByValue: false });

  it.each<[string, Json, Json, EqualityOptions, readonly FieldRow[]]>([
    [
      'a changed value',
      { _id: int(1), status: 'new', total: int(10) },
      { _id: int(1), status: 'paid', total: int(10) },
      options(),
      [{ path: 'status', left: 'new', right: 'paid' }],
    ],
    [
      'a field only on the right',
      { _id: int(1), a: int(1) },
      { _id: int(1), a: int(1), b: int(2) },
      options(),
      [{ path: 'b', right: int(2) }],
    ],
    [
      'a field of a sub-document',
      { _id: int(1), ship: { city: 'Turin', zip: '10100' } },
      { _id: int(1), ship: { city: 'Turin', zip: '10121' } },
      options(),
      [{ path: 'ship.zip', left: '10100', right: '10121' }],
    ],
    [
      'an element of an array of the same length',
      {
        _id: int(1),
        items: [
          { sku: 'A', qty: int(1) },
          { sku: 'B', qty: int(2) },
        ],
      },
      {
        _id: int(1),
        items: [
          { sku: 'A', qty: int(1) },
          { sku: 'B', qty: int(3) },
        ],
      },
      options(),
      [{ path: 'items.1.qty', left: int(2), right: int(3) }],
    ],
    [
      'arrays of different lengths, whole',
      { _id: int(1), tags: ['a', 'b'] },
      { _id: int(1), tags: ['a', 'b', 'c'] },
      options(),
      [{ path: 'tags', left: ['a', 'b'], right: ['a', 'b', 'c'] }],
    ],
    [
      'numbers by type',
      { _id: int(1), n: int(1) },
      { _id: int(1), n: double('1.0') },
      byType,
      [{ path: 'n', left: int(1), right: double('1.0'), types: ['int', 'double'] }],
    ],
    [
      'a string and a number',
      { _id: int(1), v: '1' },
      { _id: int(1), v: int(1) },
      options(),
      [{ path: 'v', left: '1', right: int(1) }],
    ],
    [
      'only the order of fields',
      { _id: int(1), a: int(1), b: int(2) },
      { _id: int(1), b: int(2), a: int(1) },
      options({ ignoreOrder: false }),
      [{ path: '(field order)' }],
    ],
    [
      'an ignored field',
      { _id: int(1), a: 'x', updatedAt: int(1) },
      { _id: int(1), a: 'y', updatedAt: int(2) },
      options({ ignore: ['updatedAt'] }),
      [{ path: 'a', left: 'x', right: 'y' }],
    ],
    [
      'an ignored field of array elements',
      { _id: int(1), items: [{ price: int(1), tmp: int(1) }] },
      { _id: int(1), items: [{ price: int(2), tmp: int(2) }] },
      options({ ignore: ['items.tmp'] }),
      [{ path: 'items.0.price', left: int(1), right: int(2) }],
    ],
  ])('%s', (...[, left, right, given, rows]) => {
    expect(fieldDiff(left, right, given).rows).toEqual(rows);
  });

  it('sums up 6 differing fields as a, b, c, d (+2)', () => {
    const left = { a: int(1), b: int(1), c: int(1), d: int(1), e: int(1), f: int(1) };
    const right = { a: int(2), b: int(2), c: int(2), d: int(2), e: int(2), f: int(2) };
    expect(fieldDiff(left, right, options()).summary).toBe('a, b, c, d (+2)');
  });

  it('shows a field only on the left with — on the right and the tooltip The field is missing', () => {
    const difference = fieldDiff({ _id: int(1), a: int(1) }, { _id: int(1) }, options());
    expect(difference.rows).toEqual([{ path: 'a', left: int(1) }]);
    const shown = inspectorView({ kind: 'different', id: int(1), ...difference }, undefined);
    expect(shown.kind === 'different' && shown.rows[0]).toEqual({
      kind: 'field',
      path: 'a',
      left: { text: '1' },
      right: { text: '—', hint: 'The field is missing' },
    });
  });

  it('returns 200 rows of two documents that differ in 250 fields', () => {
    const left = Object.fromEntries(Array.from({ length: 250 }, (_, index) => [`f${String(index)}`, int(1)]));
    const right = Object.fromEntries(Array.from({ length: 250 }, (_, index) => [`f${String(index)}`, int(2)]));
    expect(fieldDiff(left, right, options()).rows).toHaveLength(200);
  });

  it('gives no row for 1 against 1.0 with Compare numbers by value', () => {
    expect(fieldDiff({ n: int(1) }, { n: double('1.0') }, options()).rows).toEqual([]);
  });

  it('shows the row (field order) as one sentence across the two value columns', () => {
    const difference = fieldDiff({ a: int(1), b: int(2) }, { b: int(2), a: int(1) }, options({ ignoreOrder: false }));
    const shown = inspectorView({ kind: 'different', id: int(1), ...difference }, undefined);
    expect(shown.kind === 'different' && shown.rows).toEqual([
      { kind: 'field-order', path: '(field order)', text: 'Same fields and values in a different order' },
    ]);
  });

  it('shows the BSON types beside values that look the same', () => {
    const difference = fieldDiff({ n: int(1) }, { n: double('1.0') }, byType);
    const shown = inspectorView({ kind: 'different', id: int(1), ...difference }, undefined);
    expect(shown.kind === 'different' && shown.rows[0]).toEqual({
      kind: 'field',
      path: 'n',
      left: { text: '1', type: 'int' },
      right: { text: '1', type: 'double' },
    });
  });
});
