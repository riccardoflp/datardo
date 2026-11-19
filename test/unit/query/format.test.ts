import { BSON } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { formattedValue } from '../../../src/features/query/format';
import { parsedValue } from '../../../src/features/query/parse';
import type { Json } from '../../../src/shared/engine-request';
import { canonical, everyType } from './values';

function value(text: string): Json {
  const parsed = parsedValue(text, 0, () => '65f1c0de65f1c0de65f1c0de');
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

const of = (name: string): Json => everyType[name] ?? null;

describe('query.format', () => {
  it('writes each row of the table of types exactly', () => {
    const rows: [string, string][] = [
      ['string', '"paid"'],
      ['multiline', '"line one\\nline two"'],
      ['int32', '5'],
      ['double', 'Double(5)'],
      ['doubleFraction', '42.5'],
      ['doubleNaN', 'NaN'],
      ['doubleInfinity', 'Infinity'],
      ['doubleMinusInfinity', '-Infinity'],
      ['int64', 'NumberLong(5)'],
      ['int64Big', 'NumberLong("9007199254740993")'],
      ['decimal', 'NumberDecimal("12.50")'],
      ['boolean', 'true'],
      ['null', 'null'],
      ['objectId', 'ObjectId("65f1c0de65f1c0de65f1c0de")'],
      ['date', 'ISODate("2024-03-15T10:30:00.000Z")'],
      ['dateBeyondJavaScript', 'new Date(9000000000000000000)'],
      ['regex', '/^mario/i'],
      ['uuid', 'UUID("0f8fad5b-d9cb-469f-a165-70867728950e")'],
      ['binary', 'BinData(0, "aGVsbG8=")'],
      ['timestamp', 'Timestamp({ t: 1700000000, i: 1 })'],
      ['minKey', 'MinKey()'],
      ['maxKey', 'MaxKey()'],
      ['emptyArray', '[]'],
      ['emptyDocument', '{}'],
      ['undefined', 'undefined'],
      ['symbol', 'BSONSymbol("x")'],
      ['code', 'Code("function () { return 1 }")'],
      ['codeWithScope', 'Code("x + 1", { x: 1 })'],
      ['dbRef', '{ $ref: "users", $id: ObjectId("65f1c0de65f1c0de65f1c0de") }'],
      ['keys', '{ status: 1, $gte: 5, "address.city": 1, "2fa": true }'],
      ['array', '[1, NumberLong(1), Double(2)]'],
    ];
    for (const [name, text] of rows) {
      expect(formattedValue(of(name)), name).toBe(text);
    }
  });

  it('writes the numbers of its card, one per type', () => {
    expect(formattedValue(canonical(new BSON.Int32(5)))).toBe('5');
    expect(formattedValue(canonical(new BSON.Double(5)))).toBe('Double(5)');
    expect(formattedValue(canonical(new BSON.Double(5.5)))).toBe('5.5');
    expect(formattedValue(canonical(BSON.Long.fromNumber(5)))).toBe('NumberLong(5)');
    expect(formattedValue(canonical(BSON.Long.fromString('9007199254740993')))).toBe('NumberLong("9007199254740993")');
    expect(formattedValue(canonical(BSON.Decimal128.fromString('12.50')))).toBe('NumberDecimal("12.50")');
  });

  it('writes the one-line example of its card', () => {
    const document = canonical({
      _id: new BSON.ObjectId('65f1c0de65f1c0de65f1c0de'),
      status: 'paid',
      total: new BSON.Double(42.5),
      qty: new BSON.Int32(2),
      views: BSON.Long.fromNumber(1204),
      tags: ['a', 'b'],
    });
    expect(formattedValue(document)).toBe(
      '{ _id: ObjectId("65f1c0de65f1c0de65f1c0de"), status: "paid", total: 42.5, qty: 2, views: NumberLong(1204), tags: ["a", "b"] }',
    );
  });

  it('writes the filter layout on one line up to 70 characters, then one field per line', () => {
    expect(formattedValue(value('{ status: "paid" }'), 'filter')).toBe('{ status: "paid" }');
    const long = value('{ status: "paid", createdAt: { $gte: ISODate("2024-01-01"), $lt: ISODate("2025-01-01") } }');
    expect(formattedValue(long, 'filter')).toBe(
      [
        '{',
        '  status: "paid",',
        '  createdAt: { $gte: ISODate("2024-01-01T00:00:00.000Z"), $lt: ISODate("2025-01-01T00:00:00.000Z") }',
        '}',
      ].join('\n'),
    );
    const seventy = value(`{ a: "${'x'.repeat(61)}" }`);
    expect(formattedValue(seventy, 'filter')).toHaveLength(70);
    expect(formattedValue(seventy, 'filter')).not.toContain('\n');
    const seventyOne = value(`{ a: "${'x'.repeat(62)}" }`);
    expect(formattedValue(seventyOne, 'filter')).toContain('\n');
  });

  it('writes the pretty example of its card within 76 characters', () => {
    const document = value(
      '{ _id: ObjectId("65f1c0de65f1c0de65f1c0de"), status: "paid", customer: { name: "Mario Rossi", email: "mario@example.com" }, items: [{ sku: "A1", qty: 2 }, { sku: "B2", qty: 1 }] }',
    );
    expect(formattedValue(document, 'pretty')).toBe(
      [
        '{',
        '  _id: ObjectId("65f1c0de65f1c0de65f1c0de"),',
        '  status: "paid",',
        '  customer: { name: "Mario Rossi", email: "mario@example.com" },',
        '  items: [{ sku: "A1", qty: 2 }, { sku: "B2", qty: 1 }]',
        '}',
      ].join('\n'),
    );
  });

  it('writes a date before 1970 as a date', () => {
    expect(formattedValue(canonical(new Date(-1000)))).toBe('ISODate("1969-12-31T23:59:59.000Z")');
  });

  it('escapes the slash of a pattern, and query.parse gives it back', () => {
    expect(formattedValue(of('regexSlash'))).toBe('/a\\/b/i');
    expect(value('/a\\/b/i')).toEqual(of('regexSlash'));
  });

  it('writes the indented layout with every entry on its own line', () => {
    const text = formattedValue(value('{ a: 1, b: [1, { c: 2 }], e: {}, ea: [] }'), 'indented');
    expect(text).toBe(
      ['{', '  a: 1,', '  b: [', '    1,', '    {', '      c: 2', '    }', '  ],', '  e: {},', '  ea: []', '}'].join(
        '\n',
      ),
    );
  });

  it('writes a Double of 1e21 and of 3000000000 so that they are read back as Double', () => {
    expect(formattedValue(of('doubleBig'))).toBe('Double(1e+21)');
    expect(formattedValue(of('doubleWhole'))).toBe('Double(3000000000)');
    expect(value('Double(3000000000)')).toEqual(of('doubleWhole'));
  });

  it('writes the same text for the same value', () => {
    for (const each of Object.values(everyType)) {
      expect(formattedValue(each, 'pretty')).toBe(formattedValue(each, 'pretty'));
    }
  });
});
