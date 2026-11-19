/**
 * What the tests of the schema area read: the replies recorded from MongoDB 8.2 (`test/fixtures/replies/`, R11.3) for
 * the samples of `test/integration/schema/record-replies.test.ts`, and the contexts of `shop.orders` on Local, on the
 * read-only Production, or in a collection tab of a view.
 */
import type { Json } from '../../../src/shared/engine-request';
import type { Context } from '../../../src/shared/feature';
import { featureId, tabId } from '../../../src/shared/ids';
import { mongoConnection, stateWith } from '../connection/context';
import { mongoReply } from '../connection/replies';

/** A recorded reply of the schema area: `worked-example-documents`, `paid-count`, `every-type-documents`, … */
export function schemaReply(name: string): Json {
  return mongoReply(`mongodb-8.2-schema-${name}`);
}

/** The documents of a recorded sample. */
export function schemaDocuments(name: string): readonly Json[] {
  const reply: Json = schemaReply(`${name}-documents`);
  if (!Array.isArray(reply)) {
    throw new Error(`The recorded documents of ${name} are not a list`);
  }
  return reply as readonly Json[];
}

/** An Int32 of canonical Extended JSON. */
export function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** A Double of canonical Extended JSON. */
export function double(value: number): Json {
  return { $numberDouble: String(value) };
}

/** Local, a MongoDB connection that writes. */
export const local = mongoConnection();

/** Production, a read-only MongoDB connection. */
export const production = mongoConnection({ name: 'Production', readOnly: true });

/** A context of the feature on `shop.orders` of Local, or of Production when `readOnly`, without a tab. */
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

/** A context of the feature with the collection tab `t1` active, of `shop.orders`, or of a view when `view`. */
export function contextInTab(feature: string, view = false): Context {
  const tab = {
    id: tabId('t1'),
    shows: { kind: 'collection' as const, connection: local.id, database: 'shop', collection: 'orders', view },
    lastActive: 0,
    loaded: true,
  };
  const state = stateWith([local]);
  return {
    feature: featureId(feature),
    now: Date.UTC(2026, 10, 18, 9),
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'app' },
    state: { ...state, tabs: { ...state.tabs, tabs: [tab], active: tab.id } },
  };
}
