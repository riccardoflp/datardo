import { describe, expect, it } from 'vitest';
import { navInput } from '../../../src/features/nav/types';
import { view as islandView } from '../../../src/features/nav/connection-island';
import type { ServerInfo } from '../../../src/shared/connection';
import { mongoConnection, redisConnection, stateWith } from './context';

const replicaSet: ServerInfo = {
  engine: 'mongodb',
  version: '8.2.1',
  topology: { kind: 'replica-set', name: 'rs0' },
  hosts: [{ host: 'db1:27017', role: 'primary' }],
};

describe('connection.state', () => {
  it('gives the nav area the saved connections with their states and what the server is', () => {
    const local = mongoConnection({ folder: 'Work' });
    const cache = redisConnection({ readOnly: true });
    const state = stateWith([local, cache], { [cache.id]: 'failed' });
    const connections = {
      ...state.connections,
      live: { ...state.connections.live, [local.id]: { state: 'connected' as const, server: replicaSet } },
    };
    const input = navInput({ ...state, connections });
    expect(input.connections).toEqual([
      {
        id: local.id,
        name: 'Local',
        engine: 'mongodb',
        readOnly: false,
        folder: 'Work',
        status: { kind: 'connected', server: { version: '8.2', topology: 'rs0' } },
      },
      { id: cache.id, name: 'Cache local', engine: 'redis', readOnly: true, status: { kind: 'failed', reason: '' } },
    ]);
  });

  it('is shown on the connection island of the current connection', () => {
    const local = mongoConnection();
    const state = stateWith([local], { [local.id]: 'connecting' });
    const island = islandView(navInput({ ...state, nav: { ...state.nav, current: local.id } }));
    expect(island.kind).toBe('current');
    expect(island.kind === 'current' ? island.name : '').toBe('Local');
  });
});
