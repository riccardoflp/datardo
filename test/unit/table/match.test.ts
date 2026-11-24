import { describe, expect, it } from 'vitest';
import type { Json } from '../../../src/shared/engine-request';
import { parsedValue } from '../../../src/features/query/parse';
import { matcherOfFilter } from '../../../src/features/table/match';
import type { Document } from '../../../src/features/table/types';
import { people } from './people';

const newId = (): string => '000000000000000000000000';

/** A value written in mongosh syntax, as `query.parse` reads it: canonical Extended JSON. */
function value(written: string): Json {
  const parsed = parsedValue(written, 0, newId);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

/** Whether the filter, written in mongosh syntax, matches the document, written the same way. */
function matches(filter: string, document: string | Document): boolean {
  const matcher = matcherOfFilter(value(filter));
  if (!matcher.ok) {
    throw new Error(matcher.message);
  }
  return matcher.matches(typeof document === 'string' ? (value(document) as Document) : document);
}

/** The message a refused filter gives. */
function refusal(filter: string): string | undefined {
  const matcher = matcherOfFilter(value(filter));
  return matcher.ok ? undefined : matcher.message;
}

describe('table.match', () => {
  it('gives the answer of each worked example', () => {
    const examples: readonly (readonly [string, string, boolean])[] = [
      ['{ amount: { $gt: 5 } }', '{ amount: "10" }', false],
      ['{ n: 5 }', '{ n: NumberDecimal("5.0") }', true],
      ['{ n: { $type: "long" } }', '{ n: 5 }', false],
      ['{ n: NumberLong("9007199254740993") }', '{ n: NumberLong("9007199254740992") }', false],
      ['{ "items.sku": "b" }', '{ items: [ { sku: "a" }, { sku: "b" } ] }', true],
      ['{ deletedAt: null }', '{ a: 1 }', true],
      ['{ deletedAt: { $exists: true } }', '{ deletedAt: null }', true],
      ['{ status: { $ne: "ok" } }', '{ other: 1 }', true],
      ['{ scores: { $elemMatch: { $gt: 80, $lt: 85 } } }', '{ scores: [70, 95] }', false],
      ['{ scores: { $gt: 80, $lt: 85 } }', '{ scores: [70, 95] }', true],
    ];
    for (const [filter, document, expected] of examples) {
      expect(matches(filter, document), `${filter} on ${document}`).toBe(expected);
    }
  });

  it('matches { amount: { $gt: 1000 } } on 1500, not on 1000 nor on "2000"', () => {
    expect(matches('{ amount: { $gt: 1000 } }', '{ amount: 1500 }')).toBe(true);
    expect(matches('{ amount: { $gt: 1000 } }', '{ amount: 1000 }')).toBe(false);
    expect(matches('{ amount: { $gt: 1000 } }', '{ amount: "2000" }')).toBe(false);
  });

  it('matches an element of an array, and $ne is its negation', () => {
    expect(matches('{ tags: "red" }', '{ tags: ["blue", "red"] }')).toBe(true);
    expect(matches('{ tags: { $ne: "red" } }', '{ tags: ["blue", "red"] }')).toBe(false);
  });

  it('matches $type by the exact type, and "number" any of the four', () => {
    const numbers = ['5', 'NumberLong(5)', 'Double(5)', 'NumberDecimal("5")'];
    expect(numbers.map((number) => matches('{ n: { $type: "number" } }', `{ n: ${number} }`))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(numbers.map((number) => matches('{ n: { $type: "double" } }', `{ n: ${number} }`))).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(matches('{ n: { $type: 18 } }', '{ n: NumberLong(5) }')).toBe(true);
    expect(matches('{ n: { $type: ["string", "int"] } }', '{ n: 5 }')).toBe(true);
  });

  it('matches a regular expression as a value and as $regex with $options', () => {
    expect(matches('{ name: /^a/i }', '{ name: "Ada" }')).toBe(true);
    expect(matches('{ name: { $regex: "^a", $options: "i" } }', '{ name: "Ada" }')).toBe(true);
    expect(matches('{ name: { $regex: "^a" } }', '{ name: "Ada" }')).toBe(false);
    expect(matches('{ name: { $regex: "a d a", $options: "ix" } }', '{ name: "Ada" }')).toBe(true);
    expect(matches('{ name: { $in: [/^b/, "Ada"] } }', '{ name: "Ada" }')).toBe(true);
  });

  it('compares strings by code point', () => {
    expect(matches('{ s: { $gt: "�" } }', '{ s: "😀" }')).toBe(true);
    expect(matches('{ s: { $lt: "�" } }', '{ s: "😀" }')).toBe(false);
  });

  it('matches $elemMatch with a sub-filter on Ada of the three people', () => {
    const a1 = people.map((person) => matches('{ items: { $elemMatch: { sku: "A1", qty: { $gt: 1 } } } }', person));
    const b2 = people.map((person) => matches('{ items: { $elemMatch: { sku: "B2", qty: { $gt: 1 } } } }', person));
    expect(a1).toEqual([true, false, false]);
    expect(b2).toEqual([false, false, false]);
  });

  it('refuses what needs the server, unknown operators and operands MongoDB refuses', () => {
    expect(refusal('{ $expr: { $gt: ["$a", "$b"] } }')).toBe('$expr is not supported in a formatting rule.');
    expect(refusal('{ a: { $foo: 1 } }')).toBe('Unknown operator $foo.');
    expect(refusal('{ a: { $mod: [0, 1] } }')).toBe('$mod: the divisor can not be 0.');
    expect(refusal('{ a: { $where: 1 } }')).toBe('$where is not supported in a formatting rule.');
    expect(refusal('{ a: { $near: [0, 0] } }')).toBe('$near is not supported in a formatting rule.');
    expect(refusal('[1]')).toBe('The condition must be a document: { field: value }.');
    expect(refusal('{ a: { $in: 1 } }')).toBe('$in needs an array.');
    expect(refusal('{ a: { $all: 1 } }')).toBe('$all needs an array.');
    expect(refusal('{ a: { $size: 1.5 } }')).toBe('$size needs a whole number.');
    expect(refusal('{ a: { $mod: [1] } }')).toBe('$mod needs an array of two numbers: [ divisor, remainder ].');
    expect(refusal('{ a: { $type: "text" } }')).toBe('$type: unknown type "text".');
    expect(refusal('{ a: { $options: "i" } }')).toBe('$options needs $regex.');
    expect(refusal('{ a: { $elemMatch: 1 } }')).toBe('$elemMatch needs a document.');
    expect(refusal('{ a: { $not: 1 } }')).toBe('$not needs an operator such as { $gt: 1 } or a regular expression.');
    expect(refusal('{ $and: [] }')).toBe('$and needs a non-empty array of conditions.');
    expect(refusal('{ a: { $gt: /x/ } }')).toBe("$gt can't compare with a regular expression.");
    expect(refusal('{ a: { $or: [{ b: 1 }] } }')).toBe(
      '$or goes at the top of the condition or inside $elemMatch, not on a field.',
    );
    expect(refusal('{ a: { $regex: "(" } }')).toMatch(/^Invalid regular expression \/\(\/: /u);
  });

  it('compares numbers exactly across Int32, Int64 and Double, and a Decimal128 as a JavaScript number', () => {
    expect(matches('{ n: 5 }', '{ n: NumberLong(5) }')).toBe(true);
    expect(matches('{ n: 5 }', '{ n: Double(5) }')).toBe(true);
    expect(matches('{ n: NumberLong("9007199254740993") }', '{ n: 9007199254740992.0 }')).toBe(false);
    expect(matches('{ n: { $gt: 9007199254740992.0 } }', '{ n: NumberLong("9007199254740993") }')).toBe(true);
    expect(matches('{ n: { $gt: 2.5 } }', '{ n: 3 }')).toBe(true);
    expect(matches('{ n: { $lt: 2.5 } }', '{ n: 2 }')).toBe(true);
    expect(matches('{ n: { $lt: NaN } }', '{ n: 1 }')).toBe(false);
    expect(matches('{ n: { $gt: NaN } }', '{ n: 1 }')).toBe(true);
  });

  it('follows paths into sub-documents, arrays and indexes', () => {
    expect(matches('{ "address.city": "Milano" }', people[0]!)).toBe(true);
    expect(matches('{ "items.1.qty": 1 }', people[0]!)).toBe(true);
    expect(matches('{ "items.0.qty": 1 }', people[0]!)).toBe(false);
    expect(matches('{ "address.city": null }', people[1]!)).toBe(true);
  });

  it('compares sub-documents field by field in their order, and arrays whole or by element', () => {
    expect(matches('{ a: { b: 1, c: 2 } }', '{ a: { b: NumberLong(1), c: 2.0 } }')).toBe(true);
    expect(matches('{ a: { c: 2, b: 1 } }', '{ a: { b: 1, c: 2 } }')).toBe(false);
    expect(matches('{ a: [1, 2] }', '{ a: [1, 2] }')).toBe(true);
    expect(matches('{ a: [1, 2] }', '{ a: [[1, 2], 3] }')).toBe(true);
    expect(matches('{ a: { $size: 2 } }', '{ a: [1, 2] }')).toBe(true);
  });

  it('matches $in, $nin, $all, $exists, $mod, $not and the logic operators', () => {
    expect(matches('{ a: { $in: [1, 2] } }', '{ a: 2 }')).toBe(true);
    expect(matches('{ a: { $nin: [1, 2] } }', '{ a: 2 }')).toBe(false);
    expect(matches('{ a: { $all: [1, 2] } }', '{ a: [2, 3, 1] }')).toBe(true);
    expect(matches('{ a: { $all: [] } }', '{ a: [] }')).toBe(false);
    expect(matches('{ a: { $exists: false } }', '{ b: 1 }')).toBe(true);
    expect(matches('{ a: { $mod: [4, 1] } }', '{ a: 5.9 }')).toBe(true);
    expect(matches('{ a: { $mod: [4, -1] } }', '{ a: -5 }')).toBe(true);
    expect(matches('{ a: { $not: { $gt: 2 } } }', '{ a: 1 }')).toBe(true);
    expect(matches('{ a: { $not: /^x/ } }', '{ a: "xy" }')).toBe(false);
    expect(matches('{ $or: [{ a: 1 }, { b: 1 }], $comment: "x" }', '{ b: 1 }')).toBe(true);
    expect(matches('{ $nor: [{ a: 1 }] }', '{ a: 1 }')).toBe(false);
    expect(matches('{ a: { $elemMatch: { $or: [{ b: 1 }, { c: 1 }] } } }', '{ a: [{ c: 1 }] }')).toBe(true);
  });

  it('compares dates, ObjectIds, booleans and timestamps within their own type', () => {
    expect(matches('{ d: { $gte: ISODate("2024-01-01") } }', '{ d: ISODate("2024-06-01") }')).toBe(true);
    expect(matches('{ d: { $gte: ISODate("2024-01-01") } }', '{ d: "2025" }')).toBe(false);
    expect(matches('{ _id: { $lt: ObjectId("ffffffffffffffffffffffff") } }', '{ _id: ObjectId() }')).toBe(true);
    expect(matches('{ b: { $gt: false } }', '{ b: true }')).toBe(true);
    expect(matches('{ t: { $gt: Timestamp(1, 2) } }', '{ t: Timestamp(1, 3) }')).toBe(true);
    expect(
      matches('{ u: UUID("0f8fad5b-d9cb-469f-a165-70867728950e") }', '{ u: UUID("0f8fad5bd9cb469fa16570867728950e") }'),
    ).toBe(true);
  });

  it('does not match a document of a form it does not expect', () => {
    const odd = { n: { $numberLong: 'twelve' } } as unknown as Document;
    expect(matches('{ n: { $gt: 1 } }', odd)).toBe(false);
  });
});
