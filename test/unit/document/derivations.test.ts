/**
 * The derivations of the document area: the numeric type an edited value keeps, the documents of the insert dialog's
 * text, and the template of the insert dialog.
 */
import { describe, expect, it } from 'vitest';
import { formattedValue } from '../../../src/features/aggregate/mongosh/format';
import type { Makers } from '../../../src/features/aggregate/mongosh/helpers';
import { templateText, type SampledField } from '../../../src/features/document/insert-template';
import { editedValueOf, withKeptTypes } from '../../../src/features/document/keep-numeric-types';
import { documentsOfText } from '../../../src/features/document/parse-insert-text';
import type { Json } from '../../../src/shared/engine-request';
import { double, int, long, objectId } from './context';

const makers: Makers = { now: Date.UTC(2026, 10, 18, 9), newId: () => '6afe48bc6ece4e0d19cc4293' };

/** The value to write when `typed` is typed where `prev` is stored. */
function kept(prev: Json | undefined, typed: string): Json {
  const read = editedValueOf(typed, makers);
  if (!read.ok) {
    throw new Error(read.message);
  }
  return withKeptTypes(read.edited, prev);
}

/** A document of every BSON type, as canonical Extended JSON. */
const everyType: Json = {
  _id: objectId('65f1c0de9a7b4e00012f3a2c'),
  int: int(42),
  whole: double('5.0'),
  fraction: double('0.1'),
  negative: double('-2.5'),
  long: long('9007199254740993'),
  smallLong: long('7'),
  decimal: { $numberDecimal: '1.10' },
  text: 'line one\nline "two"',
  yes: true,
  nothing: null,
  date: { $date: { $numberLong: '1710496800000' } },
  pattern: { $regularExpression: { pattern: '^a/b', options: 'i' } },
  bytes: { $binary: { base64: 'aGVsbG8=', subType: '00' } },
  uuid: { $binary: { base64: 'D4+tW9nLRp+hZXCGdyiVDg==', subType: '04' } },
  stamp: { $timestamp: { t: 1700000000, i: 1 } },
  least: { $minKey: 1 },
  most: { $maxKey: 1 },
  code: { $code: 'function () { return 1 }' },
  symbol: { $symbol: 'x' },
  gone: { $undefined: true },
  items: [{ qty: int(1) }, { qty: long('2') }, double('3.0')],
  address: { city: 'Rome', zip: int(100), geo: { lat: double('41.9'), lng: double('12.5') } },
};

describe('document.keep-numeric-types', () => {
  const rows: readonly (readonly [Json, string, Json])[] = [
    [double('5.5'), '6', double('6.0')],
    [long('5'), '7', long('7')],
    [int(1), '1.5', double('1.5')],
    [int(1), 'NumberLong(2)', long('2')],
    [int(1), '5000000000', long('5000000000')],
    [double('5.5'), '5000000000', double('5000000000.0')],
    [double('5.5'), 'NumberInt(5)', int(5)],
    [long('5'), '7.5', double('7.5')],
    ['5', '5', int(5)],
    [{ a: double('1.0'), b: [long('2')] }, '{ a: 2, b: [3], c: 4 }', { a: double('2.0'), b: [long('3')], c: int(4) }],
  ];

  it.each(rows)('gives each row of the table its result: %j and %s', (prev, typed, result) => {
    expect(kept(prev, typed)).toEqual(result);
  });

  it('keeps the exact BSON value of a value that is not changed, whatever its type', () => {
    const text = formattedValue(everyType, { kind: 'pretty', width: 76 });
    expect(kept(everyType, text)).toEqual(everyType);
  });

  it('keeps a number typed as it reads in the database: 5 in Double(5) stays that Double', () => {
    expect(kept(double('5.0'), '5')).toEqual(double('5.0'));
    expect(kept(long('9007199254740993'), '9007199254740993')).toEqual(long('9007199254740993'));
  });

  it('gives Double(5000000000), not a Long, for 5000000000 typed in a Double field', () => {
    expect(kept(double('5.5'), '5000000000')).toEqual(double('5000000000.0'));
  });

  it('gives Int32(5) for NumberInt(5) typed in a Double field', () => {
    expect(kept(double('5.5'), 'NumberInt(5)')).toEqual(int(5));
  });

  it('makes a Decimal128 edited to 1.5 a Double, and keeps one edited to NumberDecimal("1.5")', () => {
    expect(kept({ $numberDecimal: '1.10' }, '1.5')).toEqual(double('1.5'));
    expect(kept({ $numberDecimal: '1.10' }, 'NumberDecimal("1.5")')).toEqual({ $numberDecimal: '1.5' });
  });

  it('reads a number with its type when there is no value stored at its place', () => {
    expect(kept(undefined, '{ a: 1, b: 1.5, c: 5000000000 }')).toEqual({
      a: int(1),
      b: double('1.5'),
      c: long('5000000000'),
    });
  });

  it('takes Extended JSON written by hand as explicit', () => {
    expect(kept(double('5.5'), '{ "$numberInt": "7" }')).toEqual(int(7));
  });
});

describe('document.parse-insert-text', () => {
  const documents = (text: string): unknown => {
    const read = documentsOfText(text, makers);
    return read.ok ? read.documents : read.message;
  };

  it.each([
    ['{ name: "Ada" }', [{ name: 'Ada' }]],
    ['[ { a: 1 }, { a: 2 } ]', [{ a: int(1) }, { a: int(2) }]],
    ['{"a":1}\n{"a":2}', [{ a: int(1) }, { a: int(2) }]],
    ['db.people.insertMany([ { a: 1 } ], { ordered: false })', [{ a: int(1) }]],
    ['db.getCollection("my-people").insertOne({ a: 1 });', [{ a: int(1) }]],
    ['[ { a: 1 }, 2 ]', 'Item 2 is not a document: each must be an object { … }'],
    ['{ $oid: "65a1b2c3d4e5f60718293a4b" }', 'A document must be an object { … }'],
    ['[]', 'The array is empty: add the documents to insert'],
  ])('gives each row of the table its result: %s', (text, result) => {
    expect(documents(text)).toEqual(result);
  });

  it('says what to enter when the text is empty', () => {
    expect(documents('   \n ')).toBe('Enter a document, e.g. { name: "Ada" }');
  });

  it('reads db["…"].insert(…) and keeps the documents of an insertMany without its options', () => {
    expect(documents('db["people"].insert({ a: 1 })')).toEqual([{ a: int(1) }]);
    expect(documents("db.people.insertMany([{ s: ')' }, { s: '(' }])")).toEqual([{ s: ')' }, { s: '(' }]);
  });

  it('reads back what Copy as writes as mongosh, Extended JSON, JSON Lines or an insert command, with the same types', () => {
    const first = {
      _id: objectId('65f1c0de9a7b4e00012f3a2c'),
      i: int(1),
      l: long('9007199254740993'),
      d: { $numberDecimal: '12.50' },
    };
    const second = { _id: objectId('65f1c0de9a7b4e00012f3a2d'), i: int(2), l: long('5'), d: double('5.0') };
    const mongosh = formattedValue([first, second], { kind: 'pretty', width: 76 });
    expect(documents(mongosh)).toEqual([first, second]);
    expect(documents(JSON.stringify([first, second], null, 2))).toEqual([first, second]);
    expect(documents(`${JSON.stringify(first)}\n${JSON.stringify(second)}`)).toEqual([first, second]);
    expect(documents(`db.people.insertMany(${mongosh})`)).toEqual([first, second]);
  });

  it('reads one line { a: 1 }, alone as the reader reads it, not as a document: the rule of lines needs two', () => {
    const read = documentsOfText('{ a: 1 },', makers);
    expect(read.ok).toBe(false);
    expect(read.ok ? '' : read.message).toMatch(/^JSON5: invalid character ','/u);
  });

  it('reads ISODate() as the time of the insert', () => {
    expect(documents('{ at: ISODate() }')).toEqual([{ at: { $date: { $numberLong: String(makers.now) } } }]);
  });
});

describe('document.insert-template', () => {
  const field = (path: string, type: string, share: number): SampledField => ({ path, types: [type], share });

  it('gives the fields of the example, without _id, address.city and nickname, on several lines', () => {
    const fields = [
      field('_id', 'objectId', 1),
      field('name', 'string', 1),
      field('age', 'int', 0.9),
      field('address.city', 'string', 0.8),
      field('nickname', 'string', 0.2),
      field('createdAt', 'date', 1),
    ];
    expect(templateText(fields)).toBe('{\n  name: "",\n  age: 0,\n  createdAt: ISODate()\n}');
  });

  it('has a field present in exactly half of the documents, and not one present in 49%', () => {
    expect(templateText([field('half', 'bool', 0.5), field('less', 'bool', 0.49)])).toBe('{\n  half: false\n}');
  });

  it('gives the first 30 fields of a collection of 40 fields that every document has', () => {
    const fields = Array.from({ length: 40 }, (_, index) => field(`f${String(index)}`, 'array', 1));
    const lines = templateText(fields).split('\n');
    expect(lines).toHaveLength(32);
    expect(lines[30]).toBe('  f29: []');
  });

  it('gives the empty document for a collection without fields in half of its documents, and an empty one', () => {
    expect(templateText([field('rare', 'string', 0.1)])).toBe('{\n  \n}');
    expect(templateText([])).toBe('{\n  \n}');
  });

  it('writes an empty value of each type, and null for the others', () => {
    const types = ['double', 'long', 'decimal', 'object', 'objectId'];
    const text = templateText(types.map((type) => field(type, type, 1)));
    expect(text).toBe('{\n  double: 0,\n  long: 0,\n  decimal: 0,\n  object: {},\n  objectId: null\n}');
  });
});
