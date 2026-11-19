import { describe, expect, it } from 'vitest';
import { goCode } from '../../../src/features/codegen/go';
import { codeLanguages, written, type CodeLanguage } from '../../../src/features/codegen/types';
import type { Json } from '../../../src/shared/engine-request';
import { date, int, lines } from './queries';

const objectId: Json = { $oid: '65f1c0de9a1b2c3d4e5f6a7b' };
const long: Json = { $numberLong: '9007199254740993' };
const decimal: Json = { $numberDecimal: '0.10' };
const regex: Json = { $regularExpression: { pattern: '^ma', options: 'i' } };
const regexX: Json = { $regularExpression: { pattern: '^ma', options: 'x' } };
const uuid: Json = { $binary: { base64: 'OyQRAeK7QlWMr0E2xWapYg==', subType: '04' } };
const binary: Json = { $binary: { base64: 'AQID', subType: '00' } };
const timestamp: Json = { $timestamp: { t: 1700000000, i: 1 } };
const uuidText = '3b241101-e2bb-4255-8caf-4136c566a962';
const goUuid =
  'bson.Binary{Subtype: 0x04, Data: []byte{0x3b, 0x24, 0x11, 0x01, 0xe2, 0xbb, 0x42, 0x55, 0x8c, 0xaf, 0x41, 0x36, 0xc5, 0x66, 0xa9, 0x62}}';

/** A row of a table: the value typed, and what one language writes with what it needs. */
type Row = readonly [Json, string, (readonly string[])?];

const mongosh: readonly Row[] = [
  [objectId, 'ObjectId("65f1c0de9a1b2c3d4e5f6a7b")'],
  [date('2024-03-01'), 'ISODate("2024-03-01T00:00:00.000Z")'],
  [{ $numberLong: '5' }, 'NumberLong("5")'],
  [decimal, 'NumberDecimal("0.10")'],
  [regex, '/^ma/i'],
  [uuid, `UUID("${uuidText}")`],
  [binary, 'BinData(0, "AQID")'],
  [timestamp, 'Timestamp({ t: 1700000000, i: 1 })'],
  [{ $minKey: 1 }, 'MinKey()'],
  [{ $maxKey: 1 }, 'MaxKey()'],
  [null, 'null'],
  [{ $numberDouble: 'NaN' }, 'NaN'],
  [{ $numberDouble: 'Infinity' }, 'Infinity'],
  [{ a: int(1), 'a b': int(1) }, '{ a: 1, "a b": 1 }'],
];

const nodejs: readonly Row[] = [
  [objectId, 'new ObjectId("65f1c0de9a1b2c3d4e5f6a7b")', ['ObjectId']],
  [date('2024-03-01T10:20:30.123Z'), 'new Date("2024-03-01T10:20:30.123Z")', []],
  [long, 'Long.fromString("9007199254740993")', ['Long']],
  [decimal, 'Decimal128.fromString("0.10")', ['Decimal128']],
  [int(42), '42', []],
  [{ $numberDouble: '2.5' }, '2.5', []],
  [{ $numberDouble: '3000000000' }, '3000000000', []],
  [regex, '/^ma/i', []],
  [regexX, 'new BSONRegExp("^ma", "x")', ['BSONRegExp']],
  [uuid, `new UUID("${uuidText}")`, ['UUID']],
  [binary, 'new Binary(Buffer.from("AQID", "base64"), 0x00)', ['Binary']],
  [timestamp, 'new Timestamp({ t: 1700000000, i: 1 })', ['Timestamp']],
  [{ $minKey: 1 }, 'new MinKey()', ['MinKey']],
  [{ $maxKey: 1 }, 'new MaxKey()', ['MaxKey']],
  [null, 'null', []],
  [true, 'true', []],
  [{ $numberDouble: 'NaN' }, 'NaN', []],
  [{ $numberDouble: 'Infinity' }, 'Infinity', []],
  [{ $numberDouble: '-Infinity' }, '-Infinity', []],
  [[int(1), 'a'], '[1, "a"]', []],
  [[], '[]', []],
  [{ a: int(1) }, '{ a: 1 }', []],
  [{ 'a b': int(1), $gt: int(2) }, '{ "a b": 1, $gt: 2 }', []],
  [{}, '{}', []],
];

const dateImport = 'from datetime import datetime, timezone';
const python: readonly Row[] = [
  [objectId, 'ObjectId("65f1c0de9a1b2c3d4e5f6a7b")', ['from bson import ObjectId']],
  [date('2024-03-01T10:20:30.123Z'), 'datetime(2024, 3, 1, 10, 20, 30, 123000, tzinfo=timezone.utc)', [dateImport]],
  [date('2024-03-01T10:20:00Z'), 'datetime(2024, 3, 1, 10, 20, 0, tzinfo=timezone.utc)', [dateImport]],
  [date('2024-03-01'), 'datetime(2024, 3, 1, tzinfo=timezone.utc)', [dateImport]],
  [long, 'Int64(9007199254740993)', ['from bson.int64 import Int64']],
  [decimal, 'Decimal128("0.10")', ['from bson.decimal128 import Decimal128']],
  [int(42), '42', []],
  [{ $numberDouble: '2.5' }, '2.5', []],
  [{ $numberDouble: '3000000000' }, '3000000000', []],
  [regex, 'Regex("^ma", "i")', ['from bson.regex import Regex']],
  [uuid, `Binary.from_uuid(UUID("${uuidText}"))`, ['from bson.binary import Binary', 'from uuid import UUID']],
  [binary, 'Binary(base64.b64decode("AQID"), 0)', ['from bson.binary import Binary', 'import base64']],
  [timestamp, 'Timestamp(1700000000, 1)', ['from bson.timestamp import Timestamp']],
  [{ $minKey: 1 }, 'MinKey()', ['from bson.min_key import MinKey']],
  [{ $maxKey: 1 }, 'MaxKey()', ['from bson.max_key import MaxKey']],
  [null, 'None', []],
  [true, 'True', []],
  [false, 'False', []],
  [{ $numberDouble: 'NaN' }, 'float("nan")', []],
  [{ $numberDouble: 'Infinity' }, 'float("inf")', []],
  [{ $numberDouble: '-Infinity' }, 'float("-inf")', []],
  [[int(1), 'a'], '[1, "a"]', []],
  [[], '[]', []],
  [{ a: int(1) }, '{"a": 1}', []],
  [{}, '{}', []],
];

const java: readonly Row[] = [
  [objectId, 'new ObjectId("65f1c0de9a1b2c3d4e5f6a7b")', ['org.bson.types.ObjectId']],
  [
    date('2024-03-01T10:20:30.123Z'),
    'Date.from(Instant.parse("2024-03-01T10:20:30.123Z"))',
    ['java.time.Instant', 'java.util.Date'],
  ],
  [long, '9007199254740993L', []],
  [decimal, 'Decimal128.parse("0.10")', ['org.bson.types.Decimal128']],
  [int(42), '42', []],
  [{ $numberDouble: '2.5' }, '2.5', []],
  [{ $numberDouble: '3000000000' }, '3000000000L', []],
  [regex, 'new BsonRegularExpression("^ma", "i")', ['org.bson.BsonRegularExpression']],
  [uuid, `new BsonBinary(UUID.fromString("${uuidText}"))`, ['java.util.UUID', 'org.bson.BsonBinary']],
  [
    binary,
    'new Binary((byte) 0x00, Base64.getDecoder().decode("AQID"))',
    ['java.util.Base64', 'org.bson.types.Binary'],
  ],
  [timestamp, 'new BsonTimestamp(1700000000, 1)', ['org.bson.BsonTimestamp']],
  [{ $minKey: 1 }, 'new MinKey()', ['org.bson.types.MinKey']],
  [{ $maxKey: 1 }, 'new MaxKey()', ['org.bson.types.MaxKey']],
  [null, 'null', []],
  [true, 'true', []],
  [{ $numberDouble: 'NaN' }, 'Double.NaN', []],
  [{ $numberDouble: 'Infinity' }, 'Double.POSITIVE_INFINITY', []],
  [{ $numberDouble: '-Infinity' }, 'Double.NEGATIVE_INFINITY', []],
  [[int(1), 'a'], 'Arrays.asList(1, "a")', ['java.util.Arrays']],
  [[], 'Arrays.asList()', ['java.util.Arrays']],
  [{ a: int(1) }, 'new Document("a", 1)', []],
  [{ 'a b': int(1), $gt: int(2) }, 'new Document("a b", 1).append("$gt", 2)', []],
  [{}, 'new Document()', []],
];

const csharp: readonly Row[] = [
  [objectId, 'new ObjectId("65f1c0de9a1b2c3d4e5f6a7b")'],
  [date('2024-03-01T10:20:30.123Z'), 'new DateTime(2024, 3, 1, 10, 20, 30, DateTimeKind.Utc).AddMilliseconds(123)'],
  [date('2024-03-01'), 'new DateTime(2024, 3, 1, 0, 0, 0, DateTimeKind.Utc)'],
  [long, '9007199254740993L'],
  [decimal, 'Decimal128.Parse("0.10")'],
  [int(42), '42'],
  [{ $numberDouble: '2.5' }, '2.5'],
  [{ $numberDouble: '3000000000' }, '3000000000L'],
  [regex, 'new BsonRegularExpression("^ma", "i")'],
  [uuid, `new BsonBinaryData(Guid.Parse("${uuidText}"), GuidRepresentation.Standard)`],
  [binary, 'new BsonBinaryData(Convert.FromBase64String("AQID"), (BsonBinarySubType)0x00)'],
  [timestamp, 'new BsonTimestamp(1700000000, 1)'],
  [{ $minKey: 1 }, 'BsonMinKey.Value'],
  [{ $maxKey: 1 }, 'BsonMaxKey.Value'],
  [null, 'BsonNull.Value'],
  [true, 'true'],
  [{ $numberDouble: 'NaN' }, 'double.NaN'],
  [{ $numberDouble: 'Infinity' }, 'double.PositiveInfinity'],
  [{ $numberDouble: '-Infinity' }, 'double.NegativeInfinity'],
  [[int(1), 'a'], 'new BsonArray { 1, "a" }'],
  [[], 'new BsonArray()'],
  [{ a: int(1) }, 'new BsonDocument("a", 1)'],
  [{ 'a b': int(1), $gt: int(2) }, 'new BsonDocument { { "a b", 1 }, { "$gt", 2 } }'],
  [{}, 'new BsonDocument()'],
];

const go: readonly Row[] = [
  [objectId, 'objectID("65f1c0de9a1b2c3d4e5f6a7b")', ['objectID']],
  [
    date('2024-03-01T10:20:30.123Z'),
    'bson.NewDateTimeFromTime(time.Date(2024, time.March, 1, 10, 20, 30, 123000000, time.UTC))',
    ['import "time"'],
  ],
  [long, 'int64(9007199254740993)', []],
  [decimal, 'decimal128("0.10")', ['decimal128']],
  [int(42), '42', []],
  [{ $numberDouble: '2.5' }, '2.5', []],
  [{ $numberDouble: '3000000000' }, '3000000000', []],
  [regex, 'bson.Regex{Pattern: "^ma", Options: "i"}', []],
  [uuid, goUuid, []],
  [binary, 'bson.Binary{Subtype: 0x00, Data: []byte{0x01, 0x02, 0x03}}', []],
  [timestamp, 'bson.Timestamp{T: 1700000000, I: 1}', []],
  [{ $minKey: 1 }, 'bson.MinKey{}', []],
  [{ $maxKey: 1 }, 'bson.MaxKey{}', []],
  [null, 'nil', []],
  [true, 'true', []],
  [{ $numberDouble: 'NaN' }, 'math.NaN()', ['import "math"']],
  [{ $numberDouble: 'Infinity' }, 'math.Inf(1)', ['import "math"']],
  [{ $numberDouble: '-Infinity' }, 'math.Inf(-1)', ['import "math"']],
  [[int(1), 'a'], 'bson.A{1, "a"}', []],
  [[], 'bson.A{}', []],
  [{ a: int(1) }, 'bson.D{{Key: "a", Value: 1}}', []],
  [{}, 'bson.D{}', []],
];

const tables: Readonly<Record<CodeLanguage, readonly Row[]>> = { mongosh, nodejs, python, java, csharp, go };

describe('codegen.types', () => {
  for (const { language } of codeLanguages) {
    it(`gives each row of the table of ${language} exactly its text and what it needs`, () => {
      for (const [value, text, needs] of tables[language]) {
        const result = written(value, language);
        expect(result.text, JSON.stringify(value)).toBe(text);
        if (needs !== undefined) {
          expect(result.needs, JSON.stringify(value)).toEqual([...needs].sort());
        }
      }
    });
  }

  it('keeps every digit of the Long 9007199254740993 in every language', () => {
    for (const { language } of codeLanguages) {
      const { text } = written({ n: long }, language);
      expect(text, language).toContain('9007199254740993');
      expect(text, language).not.toContain('9007199254740992');
    }
  });

  it('keeps the last zero of NumberDecimal("0.10") in every language', () => {
    for (const { language } of codeLanguages) {
      expect(written(decimal, language).text, language).toContain('"0.10"');
    }
  });

  it('writes /^ma/i as a literal in Node.js, /^ma/x as a BSONRegExp, and two strings in the drivers', () => {
    expect(written(regex, 'nodejs').text).toBe('/^ma/i');
    expect(written(regexX, 'nodejs').text).toBe('new BSONRegExp("^ma", "x")');
    for (const language of ['python', 'java', 'csharp', 'go'] as const) {
      expect(written(regexX, language).text, language).toMatch(/"\^ma".*"x"/u);
    }
  });

  it('escapes a double quote, a backslash and a line break in every language', () => {
    for (const { language } of codeLanguages) {
      expect(written('say "hi"\\\n', language).text, language).toBe('"say \\"hi\\"\\\\\\n"');
    }
  });

  it('writes 2.0 as 2, and a date in UTC to the millisecond', () => {
    expect(written({ $numberDouble: '2.0' }, 'nodejs').text).toBe('2');
    expect(written(date('2024-03-01T10:20:30.123+02:00'), 'nodejs').text).toBe('new Date("2024-03-01T08:20:30.123Z")');
  });

  it('keeps the order of the fields of a document', () => {
    expect(written({ b: int(1), a: int(2) }, 'python').text).toBe('{"b": 1, "a": 2}');
  });

  it('writes objectID after Go code with an ObjectId, and not decimal128', () => {
    const code = goCode({ kind: 'find', filter: { _id: objectId } }, lines);
    expect(code).toContain('\nfunc objectID(hex string) bson.ObjectID {\n');
    expect(code).not.toContain('decimal128');
  });

  it('writes decimal128 before objectID when Go code uses both', () => {
    const code = goCode({ kind: 'find', filter: { _id: objectId, d: decimal } }, lines);
    expect(code.indexOf('func decimal128')).toBeLessThan(code.indexOf('func objectID'));
  });

  it('writes a Python date at 10:20 with 10, 20, 0 and without microseconds', () => {
    expect(written(date('2024-03-01T10:20:00.000Z'), 'python').text).toBe(
      'datetime(2024, 3, 1, 10, 20, 0, tzinfo=timezone.utc)',
    );
  });
});
