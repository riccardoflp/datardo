/**
 * Builds the nav inputs and contexts the tests of the nav area start from: saved connections, an active tab, the nav
 * state, as M4 and M6 will give them.
 */
import type { Context } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState, type AppState } from '../../../src/shared/state';
import { initialNavState, type NavState } from '../../../src/shared/state/nav';
import type { ActiveTab, NavInput, SavedConnection, ConnectionStatus } from '../../../src/features/nav/types';

/** A connected MongoDB server: 8.0, replica set rs0. */
export const mongoConnected: ConnectionStatus = { kind: 'connected', server: { version: '8.0', topology: 'rs0' } };

/** A connected Redis server: 7.2, standalone. */
export const redisConnected: ConnectionStatus = {
  kind: 'connected',
  server: { version: '7.2', topology: 'standalone' },
};

/** A saved connection. */
export function connection(
  id: string,
  name: string,
  engine: 'mongodb' | 'redis',
  more: Partial<Omit<SavedConnection, 'id' | 'name' | 'engine'>> = {},
): SavedConnection {
  return { id: connectionId(id), name, engine, readOnly: false, status: { kind: 'not-connected' }, ...more };
}

/** Local (MongoDB), Staging (MongoDB), Production (MongoDB, in Live), Cache local (Redis). */
export const local = connection('local', 'Local', 'mongodb', { status: mongoConnected });
export const staging = connection('staging', 'Staging', 'mongodb');
export const production = connection('production', 'Production', 'mongodb', { folder: 'Live' });
export const cacheLocal = connection('cache-local', 'Cache local', 'redis', { status: redisConnected });

/** The Home page as the active tab. */
export const home: ActiveTab = { kind: 'app', page: 'home' };

/** The collection tab of `shop.orders` on Local. */
export const ordersTab: ActiveTab = {
  kind: 'collection',
  connection: local.id,
  database: 'shop',
  collection: 'orders',
  inspection: { selected: 0, emptyLine: 'Select a document to see it here.' },
};

/** A nav input: no connection, Home active, unless told otherwise. */
export function input(more: Partial<Omit<NavInput, 'nav'>> & { readonly nav?: Partial<NavState> } = {}): NavInput {
  return {
    connections: [],
    tabs: [],
    activeTab: home,
    work: [],
    zoom: 100,
    ...more,
    nav: { ...initialNavState, ...more.nav },
  };
}

/** A context on the app's state with the nav state given. */
export function context(nav: Partial<NavState> = {}, feature = 'nav.toggle-explorer'): Context {
  const state: AppState = { ...initialState, nav: { ...initialNavState, ...nav } };
  return {
    feature: featureId(feature),
    now: 0,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'app' },
    state,
  };
}
