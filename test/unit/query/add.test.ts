import { describe, expect, it } from 'vitest';
import type { Json } from '../../../src/shared/engine-request';
import { filterWithCondition } from '../../../src/features/query/add-condition';
import { projectionWithField } from '../../../src/features/query/add-projection';
import { sortWithField } from '../../../src/features/query/add-sort';
import { parsedValue } from '../../../src/features/query/parse';
import { canonical } from './values';
import { BSON } from 'mongodb';

function value(source: string): Json {
  const parsed = parsedValue(source, 0, () => '000000000000000000000000');
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

function added(written: string, field: string, condition: string, within?: string): string {
  const result = filterWithCondition(written, field, value(condition), within === undefined ? {} : { within });
  return result.ok ? result.text : `error: ${result.error}`;
}

describe('query.add-condition', () => {
  it('gives exactly the text of each example of the card', () => {
    expect(added('', 'status', '"paid"')).toBe('{ status: "paid" }');
    expect(added('{ total: { $gte: 10 } }', 'total', '{ $lte: 50 }')).toBe('{ total: { $gte: 10, $lte: 50 } }');
    expect(added('{ total: { $gte: 10 } }', 'total', '42')).toBe('{ total: 42 }');
    expect(added('{ tags: "x" }', 'tags', '{ $in: ["red", "blue"] }')).toBe('{ tags: { $in: ["red", "blue"] } }');
    expect(added('{ status: "paid" }', 'items.sku', '"A1"', 'items')).toBe(
      '{ status: "paid", items: { $elemMatch: { sku: "A1" } } }',
    );
    expect(added('{ items: { $elemMatch: { sku: "A1" } } }', 'items.qty', '{ $gte: 4 }', 'items')).toBe(
      '{ items: { $elemMatch: { sku: "A1", qty: { $gte: 4 } } } }',
    );
    expect(added('{ items: { $size: 2 } }', 'items.qty', '{ $gte: 4 }', 'items')).toBe(
      '{ items: { $size: 2, $elemMatch: { qty: { $gte: 4 } } } }',
    );
    expect(added('[1]', 'a', '1')).toBe('error: must be an object');
  });

  it('gives the error of query.parse for a text it refuses', () => {
    expect(added('{ status: ', 'a', '1')).toMatch(/^error: /);
  });

  it('writes a result longer than 70 characters one top-level field per line', () => {
    const result = added(
      '{ customerName: "Mario Rossi", city: "Milano" }',
      'createdAt',
      '{ $gte: ISODate("2024-01-01") }',
    );
    expect(result).toBe(
      '{\n  customerName: "Mario Rossi",\n  city: "Milano",\n  createdAt: { $gte: ISODate("2024-01-01T00:00:00.000Z") }\n}',
    );
  });

  it('puts a field of a sub-document inside the elements into $elemMatch quoted', () => {
    expect(added('', 'items.options.color', '"red"', 'items')).toBe(
      '{ items: { $elemMatch: { "options.color": "red" } } }',
    );
  });

  it('adds an element that is not a sub-document on the array itself', () => {
    expect(added('', 'tags', '"red"', 'tags')).toBe('{ tags: "red" }');
  });

  it('keeps the type of a value in the text', () => {
    const typed = (each: Json) => {
      const result = filterWithCondition('', 'n', each);
      return result.ok ? result.text : result.error;
    };
    expect(typed(canonical(BSON.Long.fromString('7')))).toBe('{ n: NumberLong(7) }');
    expect(typed(canonical(new BSON.Double(5)))).toBe('{ n: Double(5) }');
    expect(typed(canonical(BSON.Decimal128.fromString('12.50')))).toBe('{ n: NumberDecimal("12.50") }');
    expect(typed(canonical(new Date(Date.UTC(2024, 0, 1))))).toBe('{ n: ISODate("2024-01-01T00:00:00.000Z") }');
  });

  it('keeps a field not yet in the filter after the others, and one already there in its place', () => {
    expect(added('{ a: 1, b: 2 }', 'a', '3')).toBe('{ a: 3, b: 2 }');
    expect(added('{ a: 1, b: 2 }', 'c', '3')).toBe('{ a: 1, b: 2, c: 3 }');
  });
});

describe('query.add-sort', () => {
  const sorted = (written: string, field: string, direction: 1 | -1 | 'remove') => {
    const result = sortWithField(written, field, direction);
    return result.ok ? result.text : `error: ${result.error}`;
  };

  it('gives exactly the text of each example of the card', () => {
    expect(sorted('', 'total', -1)).toBe('{ total: -1 }');
    expect(sorted('{ status: 1 }', 'total', 1)).toBe('{ status: 1, total: 1 }');
    expect(sorted('{ status: 1, total: -1 }', 'status', -1)).toBe('{ status: -1, total: -1 }');
    expect(sorted('{ status: 1 }', 'status', 'remove')).toBe('');
  });

  it('quotes a dotted field and adds the new one after it', () => {
    expect(sorted('{ "address.city": 1 }', 'total', -1)).toBe('{ "address.city": 1, total: -1 }');
  });

  it('gives an error for the text { a: ', () => {
    expect(sortWithField('{ a: ', 'b', 1).ok).toBe(false);
  });
});

describe('query.add-projection', () => {
  const projected = (written: string, field: string, change: 1 | 0 | 'remove') => {
    const result = projectionWithField(written, field, change);
    return result.ok ? result.text : `error: ${result.error}`;
  };

  it('gives exactly the text of each example of the card', () => {
    expect(projected('{ name: 1 }', 'email', 1)).toBe('{ name: 1, email: 1 }');
    expect(projected('{ name: 1, _id: 0 }', 'age', 0)).toBe('{ _id: 0, age: 0 }');
    expect(projected('{ address: 1 }', 'address.city', 1)).toBe('{ "address.city": 1 }');
    expect(projected('{ "address.city": 1, name: 1 }', 'address', 1)).toBe('{ name: 1, address: 1 }');
    expect(projected('{ name: 1 }', '_id', 0)).toBe('{ name: 1, _id: 0 }');
    expect(projected('{ name: 1 }', 'name', 'remove')).toBe('');
  });

  it('counts an entry written false as an exclusion', () => {
    expect(projected('{ name: false }', 'age', 1)).toBe('{ age: 1 }');
  });

  it('never gives a projection that mixes inclusions and exclusions or collides on a path', () => {
    const starts = ['', '{ a: 1 }', '{ a: 0 }', '{ a: 1, _id: 0 }', '{ "a.b": 1, c: 0 }', '{ a: { $slice: 1 } }'];
    for (const start of starts) {
      for (const field of ['a', 'a.b', 'c', '_id']) {
        for (const change of [1, 0] as const) {
          expectConsistent(start, field, change);
        }
      }
    }
  });
});

function expectConsistent(start: string, field: string, change: 1 | 0): void {
  const result = projectionWithField(start, field, change);
  if (!result.ok || result.text === '') {
    return;
  }
  const entries = Object.entries(value(result.text) as Record<string, Json>).filter(([key]) => key !== '_id');
  const kinds = new Set(
    entries.map(([, each]) => (each === 0 || (each as Record<string, Json>)['$numberInt'] === '0' ? 0 : 1)),
  );
  if (field !== '_id') {
    expect(kinds.size, `${start} + ${field} ${String(change)}`).toBeLessThanOrEqual(1);
  }
  const keys = entries.map(([key]) => key);
  for (const key of keys) {
    expect(keys.some((other) => other.startsWith(`${key}.`))).toBe(false);
  }
}
