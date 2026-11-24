/**
 * `table.match` gives MongoDB's answer (the exit criterion of M41): each filter is matched in the window by the
 * matcher and run by a real server's `find` on the same document, and the two answers are compared.
 */
import { BSON, MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { matcherOfFilter } from '../../../src/features/table/match';
import type { Document } from '../../../src/features/table/types';
import { value } from '../../unit/table/formatting';
import { people } from '../../unit/table/people';
import { testServers } from '../servers';

const servers = testServers();
const database = 'table_match';

/** Filters and documents in mongosh syntax: the worked examples of the card, its acceptance lines, and more. */
const cases: readonly (readonly [string, string])[] = [
  ['{ amount: { $gt: 5 } }', '{ amount: "10" }'],
  ['{ n: 5 }', '{ n: NumberDecimal("5.0") }'],
  ['{ n: { $type: "long" } }', '{ n: 5 }'],
  ['{ n: NumberLong("9007199254740993") }', '{ n: NumberLong("9007199254740992") }'],
  ['{ "items.sku": "b" }', '{ items: [ { sku: "a" }, { sku: "b" } ] }'],
  ['{ deletedAt: null }', '{ a: 1 }'],
  ['{ deletedAt: { $exists: true } }', '{ deletedAt: null }'],
  ['{ status: { $ne: "ok" } }', '{ other: 1 }'],
  ['{ scores: { $elemMatch: { $gt: 80, $lt: 85 } } }', '{ scores: [70, 95] }'],
  ['{ scores: { $gt: 80, $lt: 85 } }', '{ scores: [70, 95] }'],
  ['{ amount: { $gt: 1000 } }', '{ amount: 1500 }'],
  ['{ amount: { $gt: 1000 } }', '{ amount: 1000 }'],
  ['{ amount: { $gt: 1000 } }', '{ amount: "2000" }'],
  ['{ tags: "red" }', '{ tags: ["blue", "red"] }'],
  ['{ tags: { $ne: "red" } }', '{ tags: ["blue", "red"] }'],
  ['{ n: { $type: "number" } }', '{ n: NumberDecimal("5") }'],
  ['{ n: { $type: "double" } }', '{ n: Double(5) }'],
  ['{ n: { $type: "double" } }', '{ n: NumberLong(5) }'],
  ['{ name: /^a/i }', '{ name: "Ada" }'],
  ['{ name: { $regex: "^a", $options: "i" } }', '{ name: "Ada" }'],
  ['{ s: { $gt: "�" } }', '{ s: "😀" }'],
  ['{ n: { $gt: 9007199254740992.0 } }', '{ n: NumberLong("9007199254740993") }'],
  ['{ n: { $lt: 2.5 } }', '{ n: 2 }'],
  ['{ a: { b: 1, c: 2 } }', '{ a: { b: NumberLong(1), c: 2.0 } }'],
  ['{ a: { c: 2, b: 1 } }', '{ a: { b: 1, c: 2 } }'],
  ['{ a: [1, 2] }', '{ a: [[1, 2], 3] }'],
  ['{ a: { $all: [1, 2] } }', '{ a: [2, 3, 1] }'],
  ['{ a: { $all: [] } }', '{ a: [] }'],
  ['{ a: { $size: 2 } }', '{ a: [1, 2] }'],
  ['{ a: { $mod: [4, 1] } }', '{ a: 5.9 }'],
  ['{ a: { $mod: [4, -1] } }', '{ a: -5 }'],
  ['{ a: { $not: { $gt: 2 } } }', '{ b: 1 }'],
  ['{ a: { $nin: [1, 2] } }', '{ b: 1 }'],
  ['{ "a.b": null }', '{ a: [ { b: 1 }, { c: 1 } ] }'],
  ['{ "items.1.qty": 1 }', '{ items: [ { qty: 2 }, { qty: 1 } ] }'],
  ['{ d: { $gte: ISODate("2024-01-01") } }', '{ d: ISODate("2024-06-01") }'],
  ['{ t: { $gt: Timestamp(1, 2) } }', '{ t: Timestamp(1, 3) }'],
  ['{ b: { $gt: false } }', '{ b: true }'],
  ['{ $nor: [{ a: 1 }] }', '{ a: [1, 2] }'],
  ['{ a: { $elemMatch: { $or: [{ b: 1 }, { c: 1 }] } } }', '{ a: [ { c: 1 } ] }'],
  ['{ u: { $type: "binData" } }', '{ u: UUID("0f8fad5b-d9cb-469f-a165-70867728950e") }'],
];

const elemMatch = [
  '{ items: { $elemMatch: { sku: "A1", qty: { $gt: 1 } } } }',
  '{ items: { $elemMatch: { sku: "B2", qty: { $gt: 1 } } } }',
];

let client: MongoClient;

function bsonOf(written: Document): BSON.Document {
  return BSON.EJSON.deserialize(written, { relaxed: false }) as BSON.Document;
}

async function serverMatches(collection: string, filter: string, document: Document): Promise<boolean> {
  const into = client.db(database).collection(collection);
  await into.deleteMany({});
  await into.insertOne(bsonOf(document));
  return (await into.countDocuments(bsonOf(value(filter) as Document))) === 1;
}

function windowMatches(filter: string, document: Document): boolean {
  const matcher = matcherOfFilter(value(filter));
  if (!matcher.ok) {
    throw new Error(matcher.message);
  }
  return matcher.matches(document);
}

describe('table.match', () => {
  beforeAll(async () => {
    client = new MongoClient(servers.mongoStandalone);
    await client.connect();
    await client.db(database).dropDatabase();
  });

  afterAll(async () => {
    await client.db(database).dropDatabase();
    await client.close();
  });

  it("gives a real server's answer for every worked example and every operator it supports", async () => {
    const differences: string[] = [];
    for (const [index, [filter, written]] of cases.entries()) {
      const document = value(written) as Document;
      const server = await serverMatches(`case${String(index)}`, filter, document);
      if (server !== windowMatches(filter, document)) {
        differences.push(`${filter} on ${written}: the server says ${String(server)}`);
      }
    }
    expect(differences).toEqual([]);
  });

  it("gives a real server's answer for $elemMatch on the three people", async () => {
    for (const filter of elemMatch) {
      for (const person of people) {
        expect(windowMatches(filter, person), filter).toBe(await serverMatches('people', filter, person));
      }
    }
  });
});
