import { describe, expect, it } from 'vitest';
import {
  filterOfRows,
  type BuilderOperator,
  type BuilderRow,
  type Combine,
} from '../../../src/features/query/builder-filter';
import { rowsOfFilter } from '../../../src/features/query/builder-rows';
import { formattedValue } from '../../../src/features/query/format';
import { parsedValue } from '../../../src/features/query/parse';

function row(field: string, operator: BuilderOperator, value = ''): BuilderRow {
  return { field, operator, value };
}

function filterText(rows: readonly BuilderRow[], combine: Combine = 'all'): string {
  const result = filterOfRows(rows, combine);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return formattedValue(result.filter);
}

function read(source: string) {
  const parsed = parsedValue(source, 0, () => '000000000000000000000000');
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

const examples: readonly (readonly [readonly BuilderRow[], Combine, string])[] = [
  [[row('status', 'eq', 'paid')], 'all', '{ status: "paid" }'],
  [[row('status', 'eq', '"paid"')], 'all', '{ status: "paid" }'],
  [[row('age', 'gte', '20'), row('age', 'lte', '30')], 'all', '{ age: { $gte: 20, $lte: 30 } }'],
  [[row('age', 'gt', '20'), row('age', 'gt', '30')], 'all', '{ $and: [{ age: { $gt: 20 } }, { age: { $gt: 30 } }] }'],
  [
    [row('status', 'eq', 'paid'), row('total', 'gt', '100')],
    'any',
    '{ $or: [{ status: "paid" }, { total: { $gt: 100 } }] }',
  ],
  [[row('status', 'in', 'paid, new')], 'all', '{ status: { $in: ["paid", "new"] } }'],
  [[row('n', 'nin', '[1, 2]')], 'all', '{ n: { $nin: [1, 2] } }'],
  [[row('name', 'regex', '/^mario/i'), row('city', 'regex', 'mil')], 'all', '{ name: /^mario/i, city: /mil/ }'],
  [[row('name', 'eq', 'mario'), row('name', 'regex', '/^m/')], 'all', '{ name: { $eq: "mario", $regex: /^m/ } }'],
  [
    [row('email', 'exists'), row('phone', 'missing'), row('age', 'type', 'int'), row('tags', 'size', '3')],
    'all',
    '{ email: { $exists: true }, phone: { $exists: false }, age: { $type: "int" }, tags: { $size: 3 } }',
  ],
  [
    [row('createdAt', 'gte', 'ISODate("2024-01-01")')],
    'all',
    '{ createdAt: { $gte: ISODate("2024-01-01T00:00:00.000Z") } }',
  ],
  [[row('status', 'eq', 'paid'), row('', 'eq', 'x'), row('total', 'gt', '')], 'all', '{ status: "paid" }'],
];

describe('query.builder-filter', () => {
  it('gives exactly the filter of each example of the card', () => {
    for (const [rows, combine, expected] of examples) {
      expect(filterText(rows, combine)).toBe(expected);
    }
  });

  it('writes no complete row as {} and an empty Filter', () => {
    expect(filterOfRows([row('', 'eq', '1'), row('a', 'gt', '  ')], 'all')).toEqual({ ok: true, filter: {}, text: '' });
  });

  it('writes the text of Filter in the filter layout', () => {
    const result = filterOfRows([row('status', 'eq', 'paid')], 'all');
    expect(result.ok && result.text).toBe('{ status: "paid" }');
  });

  it('refuses a size that is not a whole number, 0 or more', () => {
    for (const value of ['2.5', '-1', 'x']) {
      expect(filterOfRows([row('tags', 'size', value)], 'all')).toEqual({
        ok: false,
        error: 'tags: size needs a whole number',
      });
    }
  });

  it('writes exists and missing on one field with $and', () => {
    expect(filterText([row('a', 'exists'), row('a', 'missing')])).toBe(
      '{ $and: [{ a: { $exists: true } }, { a: { $exists: false } }] }',
    );
  });

  it('compares an object of $ keys as a value with $eq', () => {
    expect(filterText([row('a', 'eq', '{ $x: 1 }')])).toBe('{ a: { $eq: { $x: 1 } } }');
  });

  it('reads values as mongosh syntax, or as the text itself', () => {
    expect(
      filterText([
        row('a', 'eq', '42'),
        row('b', 'eq', '"42"'),
        row('c', 'eq', 'abc'),
        row('d', 'eq', 'true'),
        row('e', 'eq', 'null'),
      ]),
    ).toBe('{ a: 42, b: "42", c: "abc", d: true, e: null }');
    expect(filterText([row(' name ', 'eq', 'Mario Rossi')])).toBe('{ name: "Mario Rossi" }');
  });

  it('gives back the same complete rows through query.builder-rows, for every example', () => {
    for (const [rows, combine] of examples) {
      const result = filterOfRows(rows, combine);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      const back = rowsOfFilter(result.filter);
      const complete = rows.filter(
        (each) => each.field !== '' && (each.value !== '' || each.operator === 'exists' || each.operator === 'missing'),
      );
      expect(back?.rows.map((each) => [each.field, each.operator])).toEqual(
        complete.map((each) => [each.field, each.operator]),
      );
      expect(back && filterOfRows(back.rows, back.combine)).toEqual(result);
    }
  });
});

describe('query.builder-rows', () => {
  const shown = (source: string) => {
    const rows = rowsOfFilter(read(source));
    return (
      rows && {
        combine: rows.combine,
        rows: rows.rows.map((each) => `${each.field} ${each.operator} ${each.value}`.trim()),
      }
    );
  };

  it('gives exactly the rows of each example of the card', () => {
    expect(shown('{ status: "paid", age: { $gte: 20, $lte: 30 } }')).toEqual({
      combine: 'all',
      rows: ['status eq "paid"', 'age gte 20', 'age lte 30'],
    });
    expect(shown('{ $or: [{ status: "paid" }, { total: { $gt: 100 } }] }')).toEqual({
      combine: 'any',
      rows: ['status eq "paid"', 'total gt 100'],
    });
    expect(shown('{ $and: [{ age: { $gt: 20 } }, { age: { $gt: 30 } }] }')).toEqual({
      combine: 'all',
      rows: ['age gt 20', 'age gt 30'],
    });
    expect(shown('{ name: /^mario/i, city: { $regex: "mil", $options: "i" } }')).toEqual({
      combine: 'all',
      rows: ['name regex /^mario/i', 'city regex /mil/i'],
    });
    expect(shown('{ address: { city: "Milano" } }')).toEqual({
      combine: 'all',
      rows: ['address eq { city: "Milano" }'],
    });
    expect(shown('{ s: { $in: ["a", "b"] }, n: { $nin: [1] } }')).toEqual({
      combine: 'all',
      rows: ['s in ["a", "b"]', 'n nin [1]'],
    });
  });

  it('says cannot be shown for the examples of the card', () => {
    for (const source of [
      '{ items: { $elemMatch: { sku: "A1" } } }',
      '{ $expr: { $gt: ["$a", "$b"] } }',
      '{ $or: [{ a: 1 }], b: 2 }',
      '{ $or: [{ a: { $gt: 1, $lt: 5 } }] }',
      '{ $or: [{ a: 1, b: 2 }] }',
      '{ a: { $not: { $gt: 1 } } }',
      '{ a: { $type: ["int", "long"] } }',
      '{ a: { $gt: 1, b: 2 } }',
      '{ $nor: [{ a: 1 }] }',
    ]) {
      expect(rowsOfFilter(read(source)), source).toBeUndefined();
    }
  });

  it('gives no rows and all for {}', () => {
    expect(rowsOfFilter({})).toEqual({ combine: 'all', rows: [] });
  });

  it('reads $exists with a number', () => {
    expect(shown('{ email: { $exists: 1 } }')?.rows).toEqual(['email exists']);
    expect(shown('{ email: { $exists: 0 } }')?.rows).toEqual(['email missing']);
  });

  it('never changes a filter that cannot be shown: there are no rows to write it back from', () => {
    const source = '{ items: { $elemMatch: { sku: "A1" } } }';
    expect(rowsOfFilter(read(source))).toBeUndefined();
  });
});
