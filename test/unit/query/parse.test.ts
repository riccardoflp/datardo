import { BSON } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { formattedValue } from '../../../src/features/query/format';
import { idOfTime, parsedValue, type Parsed } from '../../../src/features/query/parse';
import type { Json } from '../../../src/shared/engine-request';
import { canonical, everyType } from './values';

const now = Date.parse('2026-11-18T09:00:00.000Z');
const newId = (): string => '65f1c0de65f1c0de65f1c0de';

function value(text: string): Json {
  const parsed = parsedValue(text, now, newId);
  if (!parsed.ok) {
    throw new Error(`${text}: ${parsed.error.message} at ${String(parsed.error.column)}`);
  }
  return parsed.value;
}

function refused(text: string): Extract<Parsed, { ok: false }>['error'] {
  const parsed = parsedValue(text, now, newId);
  if (parsed.ok) {
    throw new Error(`${text} was read as ${JSON.stringify(parsed.value)}`);
  }
  return parsed.error;
}

const int = (n: number): Json => canonical(new BSON.Int32(n));
const long = (digits: string): Json => canonical(BSON.Long.fromString(digits));
const double = (n: number): Json => canonical(new BSON.Double(n));

describe('query.parse', () => {
  it('reads the worked examples of its card', () => {
    expect(value('{ status: "paid" }')).toEqual({ status: 'paid' });
    expect(value("{ 'address.city': 'Milano', } // north")).toEqual({ 'address.city': 'Milano' });
    expect(value('{ n: 5 }')).toEqual({ n: int(5) });
    for (const text of ['{ n: 5.0 }', '{ n: 5.5 }', '{ n: 1e3 }']) {
      expect(Object.keys(value(text) as object)).toEqual(['n']);
      expect((value(text) as { n: object }).n).toHaveProperty('$numberDouble');
    }
    expect(value('{ n: 3000000000 }')).toEqual({ n: long('3000000000') });
    expect(value('{ n: 0x1F }')).toEqual({ n: int(31) });
    expect(value('{ a: Int32(5), b: Long("5"), c: Double(5), d: Decimal128("5") }')).toEqual({
      a: int(5),
      b: long('5'),
      c: double(5),
      d: canonical(BSON.Decimal128.fromString('5')),
    });
    expect(value('{ by: DBRef("users", 7) }')).toEqual({ by: { $ref: 'users', $id: int(7) } });
    expect(value('{ a: undefined }')).toEqual({ a: { $undefined: true } });
    expect(value('{ h: HexData(0, "68656c6c6f") }')).toEqual(value('{ h: BinData(0, "aGVsbG8=") }'));
    expect(value('{ createdAt: { $gte: ISODate("2024-01-01") } }')).toEqual({
      createdAt: { $gte: canonical(new Date('2024-01-01T00:00:00.000Z')) },
    });
    expect(value('{ name: /^mario/i }')).toEqual({ name: canonical(new BSON.BSONRegExp('^mario', 'i')) });
    expect(value('{ name: /a/gi }')).toEqual({ name: canonical(new BSON.BSONRegExp('a', 'i')) });
    expect(value('{ tags: [/a/, /b/m] }')).toEqual({
      tags: [canonical(new BSON.BSONRegExp('a', '')), canonical(new BSON.BSONRegExp('b', 'm'))],
    });
    expect(value('{ note: "ObjectId(\\"x\\")" }')).toEqual({ note: 'ObjectId("x")' });
    expect(value('{ "_id": { "$oid": "65f1c0de65f1c0de65f1c0de" } }')).toEqual(
      value('{ _id: ObjectId("65f1c0de65f1c0de65f1c0de") }'),
    );
    expect(value('42')).toEqual(int(42));
    expect(value('[1, 2]')).toEqual([int(1), int(2)]);
  });

  it('refuses the texts of its card, pointing at the first character that cannot be read', () => {
    const refusedTexts = [
      '{ a: ObjectId("123") }',
      '{ a: MD5("abc") }',
      '{ a: Double("x") }',
      '{ a: Binary("x") }',
      '{ n: 1 + 1 }',
      '{ r: 10 / 2 }',
      '{ a: b }',
      '{ d: Date.now() }',
      '{ a: 1',
      'db.orders.find({})',
    ];
    for (const text of refusedTexts) {
      expect(refused(text).line).toBe(1);
    }
    expect(refused('{ a: b }').column).toBe(6);
    expect(refused('{ n: 1 + 1 }').column).toBe(8);
    expect(refused('{ r: 10 / 2 }').column).toBe(9);
    expect(refused('db.orders.find({})').column).toBe(1);
    expect(refused('{ a: ObjectId("123") }').column).toBe(15);
    expect(refused('{ a: 1').column).toBe(7);
    expect(refused('{\n  a: 1,\n  b: c\n}')).toMatchObject({ line: 3, column: 6 });
  });

  it('reads ISODate() as the time given, the same each time', () => {
    expect(value('{ at: ISODate() }')).toEqual({ at: canonical(new Date('2026-11-18T09:00:00.000Z')) });
    expect(value('{ at: ISODate() }')).toEqual(value('{ at: new Date() }'));
  });

  it('keeps every digit of a NumberLong and the trailing zero of a NumberDecimal', () => {
    expect(value('NumberLong("9007199254740993")')).toEqual({ $numberLong: '9007199254740993' });
    expect(value('NumberLong(9007199254740993)')).toEqual({ $numberLong: '9007199254740993' });
    expect(value('NumberDecimal("12.50")')).toEqual({ $numberDecimal: '12.50' });
  });

  it('reads a UUID with or without dashes, in any case', () => {
    expect(value('UUID("0F8FAD5BD9CB469FA16570867728950E")')).toEqual(
      value('UUID("0f8fad5b-d9cb-469f-a165-70867728950e")'),
    );
    expect(value('UUID("0f8fad5b-d9cb-469f-a165-70867728950e")')).toEqual(everyType['uuid']);
  });

  it('refuses a date JavaScript cannot read, in the words of its card', () => {
    expect(refused('ISODate("tomorrow")').message).toBe('Invalid date: "tomorrow"');
  });

  it('skips comments of both kinds', () => {
    expect(value('{ a: 1 /* note */, // why\nb: 2 }')).toEqual({ a: int(1), b: int(2) });
  });

  it('draws no id itself: ObjectId() is the id of the maker given', () => {
    expect(value('{ _id: ObjectId() }')).toEqual({ _id: { $oid: '65f1c0de65f1c0de65f1c0de' } });
    expect(value('new ObjectId()')).toEqual({ $oid: '65f1c0de65f1c0de65f1c0de' });
    expect(idOfTime(now)).toBe('6afd69100000000000000000');
  });

  it('runs no code: calls and functions are refused, Code(…) is text', () => {
    expect(refused('{ a: process.exit() }').column).toBe(6);
    expect(refused('{ a: (() => 1)() }').column).toBe(6);
    expect(value('Code("process.exit()")')).toEqual({ $code: 'process.exit()' });
    expect(refused('{ a: `x` }').column).toBe(6);
    expect(refused('{ a: new Function("x") }').column).toBe(10);
  });

  it('reads back what query.format writes, with the same type, for every BSON type', () => {
    for (const [name, each] of Object.entries(everyType)) {
      for (const layout of ['one-line', 'filter', 'pretty', 'indented'] as const) {
        expect(value(formattedValue(each, layout)), `${name} in ${layout}`).toEqual(each);
      }
    }
    const numbers = ['5', 'Double(5)', 'NumberLong(5)', 'NumberDecimal("5")'].map(value);
    expect(new Set(numbers.map((each) => JSON.stringify(each))).size).toBe(4);
  });

  it('reads Extended JSON, its relaxed forms made canonical', () => {
    const extended = [
      '{ "$date": "2024-03-15T10:30:00.000Z" }',
      '{ "$date": { "$numberLong": "1710498600000" } }',
      '{ "$numberInt": "5" }',
      '{ "$numberLong": "5" }',
      '{ "$numberDouble": "5.0" }',
      '{ "$numberDecimal": "1.5" }',
      '{ "$code": "x" }',
      '{ "$symbol": "x" }',
      '{ "$undefined": true }',
      '{ "$binary": { "base64": "aGVsbG8=", "subType": "00" } }',
      '{ "$regularExpression": { "pattern": "a", "options": "i" } }',
      '{ "$timestamp": { "t": 1, "i": 2 } }',
      '{ "$minKey": 1 }',
      '{ "$maxKey": 1 }',
    ];
    for (const text of extended) {
      const read = value(text);
      expect(value(formattedValue(read)), text).toEqual(read);
    }
    expect(value('{ "$date": "2024-03-15T10:30:00.000Z" }')).toEqual(
      value('{ "$date": { "$numberLong": "1710498600000" } }'),
    );
    expect(value('{ "$uuid": "0f8fad5b-d9cb-469f-a165-70867728950e" }')).toEqual(everyType['uuid']);
    expect(value('{ "$timestamp": { "t": 1, "i": 2 } }')).toEqual(canonical(new BSON.Timestamp({ t: 1, i: 2 })));
  });

  it('reads the numbers and the freedoms of JSON5', () => {
    expect(value('.5')).toEqual(double(0.5));
    expect(value('5.')).toEqual(double(5));
    expect(value('+1')).toEqual(int(1));
    expect(value('-Infinity')).toEqual(double(Number.NEGATIVE_INFINITY));
    expect(value('NaN')).toEqual(double(Number.NaN));
    expect(value('2147483648')).toEqual(long('2147483648'));
    expect(value('-2147483648')).toEqual(int(-2147483648));
    expect(value('99999999999999999999')).toEqual(double(1e20));
    expect(value("{ a: 'it\\'s', b: \"\\u00e9\\x41\" }")).toEqual({ a: "it's", b: 'éA' });
    expect(value('[1, 2,]')).toEqual([int(1), int(2)]);
    expect(value('new Date(1710498600000)')).toEqual(canonical(new Date(1710498600000)));
    expect(value('new Date("2024-03-15T10:30:00+01:00")')).toEqual(canonical(new Date('2024-03-15T09:30:00.000Z')));
    expect(value('Timestamp(1700000000, 1)')).toEqual(everyType['timestamp']);
    expect(value('DBRef("users", 7, "shop")')).toEqual(everyType['dbRefWithDatabase']);
    expect(value('MD5("5d41402abc4b2a76b9719d911017c592")')).toHaveProperty('$binary.subType', '05');
  });

  it('keeps a key named __proto__ as a field', () => {
    const read = value('{ "__proto__": 1 }') as Record<string, Json>;
    expect(Object.keys(read)).toEqual(['__proto__']);
  });

  it('refuses an empty text, which is not a value', () => {
    expect(parsedValue('  // nothing\n', now, newId).ok).toBe(false);
  });
});
