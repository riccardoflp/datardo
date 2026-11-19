/**
 * Values of every BSON type as canonical Extended JSON, made by the driver's own BSON library, so that the tests of
 * `query.parse` and `query.format` compare with the form the engine gives and takes.
 */
import { BSON } from 'mongodb';
import type { Json } from '../../../src/shared/engine-request';

/** A value of the driver as canonical Extended JSON. */
export function canonical(value: unknown): Json {
  return (BSON.EJSON.serialize({ value }, { relaxed: false }) as { value: Json }).value;
}

/** One value of every BSON type, by a name that says it. */
export const everyType: Readonly<Record<string, Json>> = {
  string: 'paid',
  multiline: 'line one\nline two',
  int32: canonical(new BSON.Int32(5)),
  int32Negative: canonical(new BSON.Int32(-2147483648)),
  int64: canonical(BSON.Long.fromNumber(5)),
  int64Big: canonical(BSON.Long.fromString('9007199254740993')),
  int64Negative: canonical(BSON.Long.fromString('-9223372036854775808')),
  double: canonical(new BSON.Double(5)),
  doubleFraction: canonical(new BSON.Double(42.5)),
  doubleBig: canonical(new BSON.Double(1e21)),
  doubleWhole: canonical(new BSON.Double(3000000000)),
  doubleSmall: canonical(new BSON.Double(1.5e-7)),
  doubleNegativeZero: canonical(new BSON.Double(-0)),
  doubleNaN: canonical(new BSON.Double(Number.NaN)),
  doubleInfinity: canonical(new BSON.Double(Number.POSITIVE_INFINITY)),
  doubleMinusInfinity: canonical(new BSON.Double(Number.NEGATIVE_INFINITY)),
  decimal: canonical(BSON.Decimal128.fromString('12.50')),
  decimalNaN: canonical(BSON.Decimal128.fromString('NaN')),
  boolean: true,
  null: null,
  objectId: canonical(new BSON.ObjectId('65f1c0de65f1c0de65f1c0de')),
  date: canonical(new Date('2024-03-15T10:30:00.000Z')),
  dateBefore1970: canonical(new Date(-1000)),
  dateFar: canonical(new Date(253402300800000)),
  dateBeyondJavaScript: { $date: { $numberLong: '9000000000000000000' } },
  regex: canonical(new BSON.BSONRegExp('^mario', 'i')),
  regexSlash: canonical(new BSON.BSONRegExp('a/b', 'i')),
  uuid: canonical(new BSON.UUID('0f8fad5b-d9cb-469f-a165-70867728950e')),
  binary: canonical(new BSON.Binary(new TextEncoder().encode('hello'), 0)),
  binaryUuidOld: canonical(new BSON.Binary(new Uint8Array(16).fill(7), 3)),
  binaryMd5: canonical(new BSON.Binary(new Uint8Array(16).fill(9), 5)),
  timestamp: canonical(new BSON.Timestamp({ t: 1700000000, i: 1 })),
  minKey: canonical(new BSON.MinKey()),
  maxKey: canonical(new BSON.MaxKey()),
  undefined: { $undefined: true },
  symbol: canonical(new BSON.BSONSymbol('x')),
  code: canonical(new BSON.Code('function () { return 1 }')),
  codeWithScope: canonical(new BSON.Code('x + 1', { x: new BSON.Int32(1) })),
  dbRef: canonical(new BSON.DBRef('users', new BSON.ObjectId('65f1c0de65f1c0de65f1c0de'))),
  dbRefWithDatabase: canonical(new BSON.DBRef('users', new BSON.Int32(7) as unknown as BSON.ObjectId, 'shop')),
  array: canonical([new BSON.Int32(1), BSON.Long.fromNumber(1), new BSON.Double(2)]),
  emptyArray: [],
  document: canonical({ city: 'Milano', zip: '20100', geo: { lat: new BSON.Double(41.9) } }),
  emptyDocument: {},
  keys: canonical({ status: new BSON.Int32(1), $gte: new BSON.Int32(5), 'address.city': 1, '2fa': true }),
};
