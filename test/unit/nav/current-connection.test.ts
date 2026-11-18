import { describe, expect, it } from 'vitest';
import { currentConnection } from '../../../src/features/nav/current-connection';
import { view as connectionIsland } from '../../../src/features/nav/connection-island';
import { view as emptyView } from '../../../src/features/nav/empty';
import { connectionId } from '../../../src/shared/ids';
import { cacheLocal, input, local, ordersTab, staging } from './inputs';

const connections = [local, staging, cacheLocal];
const keysOfCache = { kind: 'keys', connection: cacheLocal.id, database: 0, separator: ':' } as const;

describe('nav.current-connection', () => {
  it('the collection tab of orders on Local makes Local current', () => {
    expect(currentConnection(ordersTab, undefined, connections)?.name).toBe('Local');
  });

  it('Home with Cache local made current last keeps Cache local', () => {
    expect(currentConnection({ kind: 'app', page: 'home' }, cacheLocal.id, connections)?.name).toBe('Cache local');
  });

  it('Settings with Staging made current last, removed since, gives none', () => {
    expect(currentConnection({ kind: 'app', page: 'settings' }, connectionId('removed'), connections)).toBeUndefined();
  });

  it('a first start with three saved connections and only Home gives none', () => {
    expect(currentConnection({ kind: 'app', page: 'home' }, undefined, connections)).toBeUndefined();
  });

  it('making a tab of Cache local active while Local is current shows Cache local in the connection island', () => {
    const island = connectionIsland(input({ connections, activeTab: keysOfCache, nav: { current: local.id } }));
    expect(island).toMatchObject({ kind: 'current', name: 'Cache local' });
  });

  it('opening Settings from a tab of Local leaves Local in the explorer', () => {
    const island = connectionIsland(
      input({ connections, activeTab: { kind: 'app', page: 'settings' }, nav: { current: local.id } }),
    );
    expect(island).toMatchObject({ kind: 'current', name: 'Local' });
  });

  it('removing the current connection while Home is active leaves the explorer with no connection', () => {
    const nav = input({ connections: [staging, cacheLocal], nav: { current: local.id } });
    expect(connectionIsland(nav)).toMatchObject({ kind: 'none-current' });
    expect(emptyView(nav)?.kind).toBe('none-current');
  });

  it('with Local current and not connected shows Local as not connected: nothing connects it', () => {
    const notConnected = { ...local, status: { kind: 'not-connected' } as const };
    const island = connectionIsland(input({ connections: [notConnected], nav: { current: local.id } }));
    expect(island).toMatchObject({ kind: 'current', line: 'MongoDB · Not connected' });
  });
});
