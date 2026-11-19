/**
 * What the unit tests of the query and table areas build their contexts from: a collection tab on `shop.orders`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Json } from '../../../src/shared/engine-request';
import type { Context } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState, type AppState } from '../../../src/shared/state';
import type { Target } from '../../../src/shared/target';

/** The time of the tests: 2026-11-17, in ms. */
export const now = 1_763_400_000_000;

/** The collection `shop.orders` of the connection Local. */
export const orders: Target = {
  kind: 'collection',
  connection: connectionId('c-local'),
  database: 'shop',
  collection: 'orders',
};

/** The app's state with these settings changed. */
export function stateWithSettings(stored: Readonly<Record<string, Json>> = {}): AppState {
  return { ...initialState, settings: { ...initialState.settings, stored } };
}

/** A context of the feature on `shop.orders`. */
export function contextOf(feature: string, state: AppState = initialState, target: Target = orders): Context {
  return { feature: featureId(feature), now, platform: 'windows', startedBy: 'user', target, state };
}

/** A reply recorded from a real server (R11.3). */
export function recorded(name: string): Json {
  return JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'replies', name), 'utf8')) as Json;
}
