import { describe, expect, it } from 'vitest';
import { copiedText, notified, planFor } from '../../../src/features/nav/copy-path';
import { view as scopeBar } from '../../../src/features/nav/scope-bar';
import type { ActiveTab } from '../../../src/features/nav/types';
import { cacheLocal, input, local, ordersTab } from './inputs';

describe('nav.copy-path', () => {
  it('on the collection tab of orders in shop copies shop.orders and says Copied shop.orders', () => {
    const outcome = planFor(input({ connections: [local], activeTab: ordersTab }));
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: {
        steps: [
          { kind: 'app', text: 'copy shop.orders to the clipboard', action: 'nav.copy', args: { text: 'shop.orders' } },
        ],
        after: [{ kind: 'notify', text: 'Copied shop.orders' }],
      },
    });
  });

  it('on the document tab of a document of shop.orders copies shop.orders', () => {
    const tab: ActiveTab = {
      kind: 'document',
      connection: local.id,
      database: 'shop',
      collection: 'orders',
      id: '65f1…a2c',
    };
    expect(copiedText(tab)).toBe('shop.orders');
  });

  it('on the keys tab of orders:2026: copies orders:2026:*, on the key tab of orders:2026:42 the name', () => {
    expect(
      copiedText({ kind: 'keys', connection: cacheLocal.id, database: 0, namespace: 'orders:2026:', separator: ':' }),
    ).toBe('orders:2026:*');
    expect(copiedText({ kind: 'keys', connection: cacheLocal.id, database: 3, separator: ':' })).toBe('db3');
    expect(
      copiedText({ kind: 'key', connection: cacheLocal.id, database: 0, key: 'orders:2026:42', separator: ':' }),
    ).toBe('orders:2026:42');
  });

  it('on the Monitor page of Local copies Monitor, on a page of a database the path without the connection', () => {
    expect(copiedText({ kind: 'page', connection: local.id, page: 'monitor', title: 'Monitor' })).toBe('Monitor');
    expect(
      copiedText({
        kind: 'page',
        connection: local.id,
        page: 'diagram',
        title: 'Relationship diagram',
        database: 'shop',
      }),
    ).toBe('shop / Relationship diagram');
  });

  it('on Home is not shown, and copies nothing', () => {
    expect(scopeBar(input()).copyPath).toBeUndefined();
    expect(planFor(input())).toMatchObject({ kind: 'run', plan: { steps: [] } });
  });

  it('cuts the notification at 80 characters', () => {
    expect(notified('x'.repeat(100))).toBe(`${'x'.repeat(80)}…`);
  });
});
