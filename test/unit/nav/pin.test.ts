import { describe, expect, it } from 'vitest';
import {
  pinLabels,
  pinOfTab,
  planFor,
  textOfHex,
  hexOfText,
  withPin,
  withPinMoved,
  withoutPin,
} from '../../../src/features/nav/pin';
import { view as scopeBar } from '../../../src/features/nav/scope-bar';
import type { Pin } from '../../../src/shared/state/nav';
import { cacheLocal, input, local, ordersTab } from './inputs';

const orders: Pin = { kind: 'collection', database: 'shop', collection: 'orders' };
const crmOrders: Pin = { kind: 'collection', database: 'crm', collection: 'orders' };
const users: Pin = { kind: 'collection', database: 'shop', collection: 'users' };
const connections = [local, cacheLocal];

describe('nav.pin', () => {
  it('Pin on the collection tab of shop.orders of Local adds orders at the end of the pins of Local', () => {
    const nav = input({ connections, activeTab: ordersTab, nav: { pins: { local: [users] } } });
    const outcome = planFor(nav, { args: { action: 'pin', connection: 'local', pin: orders } });
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: { steps: [{ text: 'pin shop.orders on Local', action: 'nav.add-pin' }] },
    });
    expect(withPin([users], orders)).toEqual([users, orders]);
  });

  it('the scope bar reads Unpin once it is pinned, Pin before', () => {
    const before = scopeBar(input({ connections, activeTab: ordersTab }));
    expect(before.pin?.label).toBe('Pin');
    const after = scopeBar(input({ connections, activeTab: ordersTab, nav: { pins: { local: [orders] } } }));
    expect(after.pin?.label).toBe('Unpin');
    expect(after.pin?.args).toMatchObject({ action: 'unpin', connection: 'local' });
  });

  it('keeps the pins of each connection apart', () => {
    const pins = { local: [orders], 'cache-local': [{ kind: 'namespace', database: 0, namespace: 'orders:' } as Pin] };
    const keysTab = { kind: 'keys', connection: cacheLocal.id, database: 0, separator: ':' } as const;
    const nav = input({ connections, activeTab: keysTab, nav: { pins } });
    expect(nav.nav.pins[cacheLocal.id]).toHaveLength(1);
    expect(nav.nav.pins[cacheLocal.id]?.[0]).toMatchObject({ namespace: 'orders:' });
  });

  it('with shop.orders and crm.orders both pinned, the two read orders shop and orders crm', () => {
    expect(pinLabels([orders, crmOrders, users])).toEqual([
      { name: 'orders', rest: 'shop' },
      { name: 'orders', rest: 'crm' },
      { name: 'users' },
    ]);
  });

  it('moving the third pin above the first makes it the first', () => {
    const third: Pin = { kind: 'page', page: 'monitor', title: 'Monitor' };
    expect(withPinMoved([orders, users, third], third, 0)).toEqual([third, orders, users]);
    const nav = input({ connections, nav: { pins: { local: [orders, users, third] } } });
    const outcome = planFor(nav, { args: { action: 'move', connection: 'local', pin: third, to: 0 } });
    expect(outcome).toMatchObject({ plan: { steps: [{ text: 'move Monitor to place 1 of the pins of Local' }] } });
  });

  it('Alt+Up on the first pin changes nothing', () => {
    expect(withPinMoved([orders, users], orders, -1)).toEqual([orders, users]);
    const nav = input({ connections, nav: { pins: { local: [orders, users] } } });
    const outcome = planFor(nav, { args: { action: 'move', connection: 'local', pin: orders, to: -1 } });
    expect(outcome).toMatchObject({ kind: 'run', plan: { steps: [] } });
  });

  it('Unpin on the last pin leaves no pin, so the Pinned section is not shown', () => {
    expect(withoutPin([orders], orders)).toEqual([]);
    const outcome = planFor(input({ connections, nav: { pins: { local: [orders] } } }), {
      args: { action: 'unpin', connection: 'local', pin: orders },
    });
    expect(outcome).toMatchObject({
      plan: { steps: [{ text: 'unpin shop.orders on Local', action: 'nav.remove-pin' }] },
    });
  });

  it('a read-only connection can pin and unpin', () => {
    const readOnly = { ...local, readOnly: true };
    const outcome = planFor(input({ connections: [readOnly] }), {
      args: { action: 'pin', connection: 'local', pin: orders },
    });
    expect(outcome.kind).toBe('run');
  });

  it('refuses the 51st pin of Local', () => {
    const fifty: Pin[] = Array.from({ length: 50 }, (_each, index) => ({
      kind: 'collection',
      database: 'shop',
      collection: `c${String(index)}`,
    }));
    const outcome = planFor(input({ connections, nav: { pins: { local: fifty } } }), {
      args: { action: 'pin', connection: 'local', pin: orders },
    });
    expect(outcome).toMatchObject({ kind: 'refuse', code: 'nav.pin/too-many' });
    expect(outcome.kind === 'refuse' && outcome.message).toBe('Local already has 50 pinned items. Unpin one first.');
  });

  it('is not offered on a database, on a document tab or on Home', () => {
    const databaseKeys = { kind: 'keys', connection: cacheLocal.id, database: 0, separator: ':' } as const;
    const document = {
      kind: 'document',
      connection: local.id,
      database: 'shop',
      collection: 'orders',
      id: '65f1…a2c',
    } as const;
    expect(pinOfTab(databaseKeys)).toBeUndefined();
    expect(pinOfTab(document)).toBeUndefined();
    expect(pinOfTab({ kind: 'app', page: 'home' })).toBeUndefined();
    expect(scopeBar(input({ connections, activeTab: document })).pin).toBeUndefined();
    expect(scopeBar(input({ connections })).pin).toBeUndefined();
  });

  it('keeps the bytes of a pinned key whose name is not text', () => {
    expect(textOfHex(hexOfText('orders:2026:42'))).toBe('orders:2026:42');
    expect(textOfHex('ff00')).toBe('\\xff\\x00');
  });
});
