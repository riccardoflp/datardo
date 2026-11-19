/**
 * What the tests of the search area start the features from: the connection Local (and the read-only Production),
 * values of every BSON type as canonical Extended JSON, the replies recorded from MongoDB 8.2, and readers of what a
 * feature returns.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Json } from '../../../src/shared/engine-request';
import type { Context, Outcome, Plan } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import type { Target } from '../../../src/shared/target';
import { mongoConnection, redisConnection, stateWith } from '../connection/context';

/** Local, a MongoDB connection whose connection string names the database `app`. */
export const local = mongoConnection();

/** Production, a read-only MongoDB connection. */
export const production = mongoConnection({ id: connectionId('c-prod'), name: 'Production', readOnly: true });

/** A Redis connection, which has no Search documents page. */
export const cache = redisConnection();

/** A context of the feature on a target (the connection Local unless given), at a fixed time. */
export function contextOn(feature: string, target?: Target, startedBy: Context['startedBy'] = 'user'): Context {
  return {
    feature: featureId(feature),
    now: Date.UTC(2026, 10, 19, 9),
    platform: 'windows',
    startedBy,
    target: target ?? { kind: 'connection', connection: local.id },
    state: stateWith([local, production, cache]),
  };
}

/** `Int32` as canonical Extended JSON. */
export function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** `Int64` as canonical Extended JSON. */
export function long(digits: string): Json {
  return { $numberLong: digits };
}

/** `Decimal128` as canonical Extended JSON. */
export function decimal(digits: string): Json {
  return { $numberDecimal: digits };
}

/** An `ObjectId` as canonical Extended JSON. */
export function objectId(hex: string): Json {
  return { $oid: hex };
}

/** A date as canonical Extended JSON. */
export function date(iso: string): Json {
  return { $date: { $numberLong: String(Date.parse(iso)) } };
}

/** A UUID (binary of subtype 4) as canonical Extended JSON. */
export function uuid(text: string): Json {
  const hex = text.replace(/-/gu, '');
  const bytes = Uint8Array.from(hex.match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16));
  return { $binary: { base64: Buffer.from(bytes).toString('base64'), subType: '04' } };
}

/** The plan of an outcome, which must be one. */
export function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

/** The replies of MongoDB 8.2 recorded by `test/integration/search/record-replies.test.ts`. */
export function recorded(name: string): readonly unknown[] {
  const path = join(import.meta.dirname, '..', '..', 'fixtures', 'replies', `mongodb-8.2-search-${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as readonly unknown[];
}
