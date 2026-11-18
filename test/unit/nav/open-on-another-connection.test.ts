import { describe, expect, it } from 'vitest';
import {
  decide,
  disabledReason,
  otherConnections,
  parseSide,
  planFor,
  sideReadId,
  sideRequests,
} from '../../../src/features/nav/open-on-another-connection';
import { view as scopeBar } from '../../../src/features/nav/scope-bar';
import type { ActiveTab } from '../../../src/features/nav/types';
import { cacheLocal, connection, input, local, ordersTab, production, staging } from './inputs';

const cacheStaging = connection('cache-staging', 'Cache staging', 'redis');
const keyTab: ActiveTab = {
  kind: 'key',
  connection: cacheLocal.id,
  database: 0,
  key: 'orders:2026:42',
  separator: ':',
};
const keysTab: ActiveTab = { kind: 'keys', connection: cacheLocal.id, database: 3, separator: ':' };
const all = [local, staging, production, cacheLocal, cacheStaging];

describe('nav.open-on-another-connection', () => {
  it('asks which connection, offering the others of the same engine and never the tab’s own', () => {
    const nav = input({ connections: all, activeTab: ordersTab });
    expect(otherConnections(nav).map((each) => each.name)).toEqual(['Staging', 'Production']);
    const outcome = planFor(nav, { args: null });
    expect(outcome).toMatchObject({ kind: 'ask', question: { title: 'Open on which connection?' } });
    const keys = input({ connections: all, activeTab: keyTab });
    expect(otherConnections(keys).map((each) => each.name)).toEqual(['Cache staging']);
  });

  it('reads the collections of shop on the connection chosen, then opens shop.orders there', () => {
    const nav = input({ connections: all, activeTab: ordersTab });
    expect(planFor(nav, { args: null, connection: 'staging' })).toEqual({
      kind: 'read',
      need: { key: 'found', read: sideReadId, args: { connection: 'staging' } },
    });
    expect(sideRequests(ordersTab, staging)).toMatchObject([
      {
        connection: 'staging',
        request: { database: 'shop', method: 'getCollectionInfos', arguments: [{}, { nameOnly: true }] },
      },
    ]);
    const found = parseSide([[{ name: 'orders' }, { name: 'users' }]]);
    expect(planFor(nav, { args: null, connection: 'staging', found })).toMatchObject({
      kind: 'run',
      plan: { steps: [{ text: 'open shop.orders on Staging', action: 'tab.open' }] },
    });
  });

  it('carries over the section shown', () => {
    const outcome = decide({ ...ordersTab, section: 'Indexes' }, staging, { kind: 'collections', names: ['orders'] });
    expect(outcome).toMatchObject({
      plan: { steps: [{ args: { shows: { section: 'Indexes', connection: 'staging' } } }] },
    });
  });

  it('refuses when Staging has shop without orders, and when it has no collection in shop', () => {
    expect(decide(ordersTab, staging, { kind: 'collections', names: ['users'] })).toMatchObject({
      kind: 'refuse',
      code: 'nav.open-on-another-connection/no-collection',
      message: 'Staging has no collection orders in shop.',
    });
    expect(decide(ordersTab, staging, { kind: 'collections', names: [] })).toMatchObject({
      kind: 'refuse',
      code: 'nav.open-on-another-connection/no-database',
      message: 'Staging has no database shop.',
    });
  });

  it('on the key tab of orders:2026:42 refuses when EXISTS returns 0', () => {
    expect(sideRequests(keyTab, cacheStaging)[0]?.request).toMatchObject({ engine: 'redis', database: 0 });
    expect(decide(keyTab, cacheStaging, parseSide([0]))).toMatchObject({
      kind: 'refuse',
      code: 'nav.open-on-another-connection/no-key',
      message: 'Cache staging has no key orders:2026:42 in db0.',
    });
    expect(decide(keyTab, cacheStaging, parseSide([1]))).toMatchObject({
      plan: { steps: [{ text: 'open the key orders:2026:42 in db0 on Cache staging' }] },
    });
  });

  it('on a keys tab of db3 refuses a server where the database is not there', () => {
    expect(decide(keysTab, cacheStaging, { kind: 'exists', exists: false })).toMatchObject({
      kind: 'refuse',
      code: 'nav.open-on-another-connection/no-database',
      message: 'Cache staging has no database db3.',
    });
  });

  it('sends nothing but reads, on a read-only connection too', () => {
    const readOnly = { ...staging, readOnly: true };
    const requests = sideRequests(ordersTab, readOnly);
    expect(
      requests.every((each) => each.request.engine === 'mongodb' && each.request.method === 'getCollectionInfos'),
    ).toBe(true);
  });

  it('with Local the only MongoDB connection, is disabled and says why', () => {
    const nav = input({ connections: [local, cacheLocal], activeTab: ordersTab });
    expect(disabledReason(nav)).toBe('No other MongoDB connection.');
    expect(scopeBar(nav).openOnAnother).toMatchObject({ disabled: true, tooltip: 'No other MongoDB connection.' });
  });

  it('is not shown on Home', () => {
    expect(scopeBar(input({ connections: all })).openOnAnother).toBeUndefined();
  });
});
