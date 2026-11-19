/**
 * What the tests of the explain area read: the explains recorded from MongoDB 8.2 (`test/fixtures/replies/`, R11.3),
 * as the engine gives them back in canonical Extended JSON, and the context of `shop.orders` on Local or on the
 * read-only Production. `test/integration/explain/record-replies.test.ts` says the collection and the query of each.
 * The sharded explains and the worked examples of the cards are written by hand in the tests, from the shapes the
 * cards and MongoDB's documentation give: no sharded cluster is started to record them.
 */
import type { Json } from '../../../src/shared/engine-request';
import type { Context } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import { mongoConnection, stateWith } from '../connection/context';
import { mongoReply } from '../connection/replies';

/** A recorded explain: `find-collscan`, `find-ixscan-sort`, `aggregate-group`, … */
export function explainReply(name: string): Json {
  return mongoReply(`mongodb-8.2-explain-${name}`);
}

/** An Int32 of canonical Extended JSON. */
export function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** Local, a MongoDB connection that writes. */
export const local = mongoConnection();

/** Production, a read-only MongoDB connection. */
export const production = mongoConnection({ name: 'Production', readOnly: true });

/** A context of the feature on `shop.orders` of Local, or of Production when `readOnly`. */
export function contextOn(feature: string, readOnly = false): Context {
  const saved = readOnly ? production : local;
  return {
    feature: featureId(feature),
    now: Date.UTC(2026, 10, 18, 9),
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'collection', connection: saved.id, database: 'shop', collection: 'orders' },
    state: stateWith([saved]),
  };
}
