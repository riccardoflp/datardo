import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/nav/rail';
import { cacheLocal, input, local, ordersTab } from './inputs';

describe('nav.rail', () => {
  it('shows six entries, five from the top and Settings at the bottom', () => {
    const entries = view(input()).entries;
    expect(entries.map((entry) => entry.label)).toEqual([
      'Home',
      'Explorer',
      'Search',
      'Undo history',
      'Scheduled tasks',
      'Settings',
    ]);
    expect(entries.map((entry) => entry.position)).toEqual(['top', 'top', 'top', 'top', 'top', 'bottom']);
  });

  it('marks Settings while the Settings page is shown, and not on a collection tab', () => {
    const settings = view(input({ activeTab: { kind: 'app', page: 'settings' } })).entries.find(
      (e) => e.name === 'settings',
    );
    expect(settings?.marked).toBe(true);
    const onOrders = view(input({ connections: [local], activeTab: ordersTab })).entries.find(
      (e) => e.name === 'settings',
    );
    expect(onOrders?.marked).toBe(false);
  });

  it('opens Search documents for a MongoDB connection, the keys of db0 with the focus in the pattern for Redis', () => {
    const mongo = view(input({ connections: [local], nav: { current: local.id } })).entries[2];
    expect(mongo).toMatchObject({ disabled: false, feature: 'search.show', element: 'search.show@rail' });
    const redis = view(input({ connections: [cacheLocal], nav: { current: cacheLocal.id } })).entries[2];
    expect(redis).toMatchObject({
      feature: 'key.show',
      element: 'key.show@rail',
      args: { connection: 'cache-local', database: 0, focus: 'pattern' },
    });
  });

  it('disables Search with no connection current, and says why', () => {
    expect(view(input()).entries[2]).toMatchObject({ disabled: true, tooltip: 'Choose a connection first.' });
  });

  it('gives each entry its name and its key for the pointer', () => {
    const entries = view(input()).entries;
    expect(entries[1]?.tooltip).toBe('Explorer (Ctrl+B)');
    expect(entries[3]?.tooltip).toBe('Undo history');
  });
});
