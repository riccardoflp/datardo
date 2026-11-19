import { describe, expect, it } from 'vitest';
import { parseImport } from '../../../src/features/transfer/import-files';
import { canonical } from '../../../src/features/transfer/values/canonical';
import { readMongosh } from '../../../src/features/transfer/values/mongosh';

describe('transfer.import-files', () => {
  it('reads each text of the table of examples as its documents', () => {
    expect(parseImport('[{ "_id": { "$oid": "64b000000000000000000001" } }]', 'a.json')).toEqual([
      { _id: { $oid: '64b000000000000000000001' } },
    ]);
    expect(parseImport('{ "a": 1 }\n{ "a": 2 }', 'a.jsonl')).toEqual([
      { a: { $numberInt: '1' } },
      { a: { $numberInt: '2' } },
    ]);
    expect(parseImport('{ when: ISODate("2024-01-01T00:00:00Z") }', 'a.json')).toEqual([
      { when: { $date: { $numberLong: '1704067200000' } } },
    ]);
    expect(parseImport('{"price":{"$numberDouble":"42.0"}}', 'a.json')).toEqual([{ price: { $numberDouble: '42.0' } }]);
    expect(parseImport('{ "n": 3000000000 }', 'a.json')).toEqual([{ n: { $numberLong: '3000000000' } }]);
    expect(parseImport('{\n  "a": 1,\n  "b": [\n    2\n  ]\n}', 'a.json')).toEqual([
      { a: { $numberInt: '1' }, b: [{ $numberInt: '2' }] },
    ]);
    expect(() => parseImport('[1, 2]', 'a.json')).toThrow('Document 1 is not an object');
    expect(() => parseImport('{ "a": 1 }\n{ oops', 'a.json')).toThrow(/^Line 2: /u);
    expect(parseImport('{ "a": 1 }', 'DATA.CSV')).toEqual([]);
  });

  it('reads a file that starts with a byte order mark as one without it', () => {
    expect(parseImport('﻿[{ "a": 1 }]', 'a.json')).toEqual([{ a: { $numberInt: '1' } }]);
  });

  it('skips blank lines between the documents of a JSON Lines file', () => {
    expect(parseImport('{"a":1}\n\n   \n{"a":2}\n', 'a.jsonl')).toHaveLength(2);
  });

  it('says an array that is not one, and gives no documents for empty text', () => {
    expect(parseImport('  \n ', 'a.json')).toEqual([]);
    expect(() => parseImport('[', 'a.json')).toThrow();
  });

  it('keeps every type of canonical Extended JSON, a whole Double included', () => {
    const line = JSON.stringify({
      i: { $numberInt: '42' },
      d: { $numberDouble: '42.0' },
      big: { $numberDouble: '5000000000.0' },
      l: { $numberLong: '9007199254740993' },
      m: { $numberDecimal: '1.10' },
      r: { $regularExpression: { pattern: '^a', options: 'i' } },
    });
    expect(parseImport(line, 'a.jsonl')).toEqual([JSON.parse(line)]);
  });

  it('refuses a document nested deeper than 100 levels', () => {
    const deep = `${'{"a":'.repeat(150)}1${'}'.repeat(150)}`;
    expect(() => parseImport(deep, 'a.json')).toThrow('A document is nested deeper than 100 levels');
    const deepShell = `${'{a:'.repeat(150)}1${'}'.repeat(150)}`;
    expect(() => parseImport(deepShell, 'a.json')).toThrow(/^Line 1: /u);
  });

  it('reads mongosh helpers, regular expressions, comments and trailing commas, and runs nothing', () => {
    const text = `{
      // a comment
      _id: ObjectId("64b000000000000000000001"), n: NumberLong("5"), i: NumberInt(3), d: Double(2),
      m: NumberDecimal("1.5"), r: /^a\\/b/i, u: UUID("00112233-4455-6677-8899-aabbccddeeff"),
      t: Timestamp(1, 2), k: MinKey(), s: 'it\\'s', list: [1, 2,], when: new Date("2024-01-01"),
    }`;
    expect(canonical(readMongosh(text))).toEqual({
      _id: { $oid: '64b000000000000000000001' },
      n: { $numberLong: '5' },
      i: { $numberInt: '3' },
      d: { $numberDouble: '2.0' },
      m: { $numberDecimal: '1.5' },
      r: { $regularExpression: { pattern: '^a\\/b', options: 'i' } },
      u: { $binary: { base64: 'ABEiM0RVZneImaq7zN3u/w==', subType: '04' } },
      t: { $timestamp: { t: 1, i: 2 } },
      k: { $minKey: 1 },
      s: "it's",
      list: [{ $numberInt: '1' }, { $numberInt: '2' }],
      when: { $date: { $numberLong: '1704067200000' } },
    });
    expect(() => readMongosh('{ a: process.exit() }')).toThrow('Unknown name process');
  });
});
