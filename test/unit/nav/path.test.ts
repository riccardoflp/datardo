import { describe, expect, it } from 'vitest';
import { pathSegments, shortenedPath, view } from '../../../src/features/nav/path';
import { cacheLocal, input, local, ordersTab } from './inputs';

const connections = [local, cacheLocal];
const labels = (segments: readonly { label: string }[]): string => segments.map((segment) => segment.label).join(' / ');

describe('nav.path', () => {
  it('the collection tab of orders in shop on Local shows Local / shop / orders', () => {
    expect(view(input({ connections, activeTab: ordersTab })).label).toBe('Local / shop / orders');
  });

  it('the key tab of orders:2026:42 in db0 shows Cache local / db0 / orders: / 2026: / 42', () => {
    const segments = pathSegments(
      { kind: 'key', connection: cacheLocal.id, database: 0, key: 'orders:2026:42', separator: ':' },
      connections,
    );
    expect(labels(segments)).toBe('Cache local / db0 / orders: / 2026: / 42');
    expect(segments.map((segment) => segment.menu)).toEqual([
      'connection',
      'redis-database',
      'namespace',
      'namespace',
      'none',
    ]);
  });

  it('writes each kind of tab as the card says', () => {
    expect(
      labels(pathSegments({ kind: 'keys', connection: cacheLocal.id, database: 0, separator: ':' }, connections)),
    ).toBe('Cache local / db0');
    expect(
      labels(pathSegments({ kind: 'page', connection: local.id, page: 'monitor', title: 'Monitor' }, connections)),
    ).toBe('Local / Monitor');
    expect(labels(pathSegments({ kind: 'console', connection: cacheLocal.id }, connections))).toBe(
      'Cache local / Console',
    );
    expect(labels(pathSegments({ kind: 'app', page: 'home' }, connections))).toBe('Home');
  });

  it('a click on the connection segment opens the connection switcher; the segment of an app tab is no button', () => {
    expect(view(input({ connections, activeTab: ordersTab })).segments[0]?.menu).toBe('connection');
    expect(view(input()).segments).toEqual([{ label: 'Home', menu: 'none' }]);
  });

  it('a view shows the view’s icon before its name', () => {
    const segments = pathSegments(
      { kind: 'collection', connection: local.id, database: 'shop', collection: 'orders', view: true },
      connections,
    );
    expect(segments[2]).toMatchObject({ view: true });
  });

  it('too narrow, reads Local / … / orders and the … lists shop', () => {
    const { shown, hidden } = shortenedPath(pathSegments(ordersTab, connections));
    expect(labels(shown)).toBe('Local / orders');
    expect(labels(hidden)).toBe('shop');
  });
});
