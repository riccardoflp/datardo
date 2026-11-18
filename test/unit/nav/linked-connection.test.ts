import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/nav/linked-connection';
import { cacheLocal, connection, input, local, staging } from './inputs';

const linkedLocal = { ...local, publishesTo: cacheLocal.id };

describe('nav.linked-connection', () => {
  it('with Local linked to Cache local, shows the row Cache local · Redis under Local', () => {
    const rows = view(input({ connections: [linkedLocal, cacheLocal], nav: { current: local.id } }));
    expect(rows).toMatchObject([
      {
        kind: 'connection',
        connection: 'cache-local',
        name: 'Cache local',
        engine: 'Redis',
        tooltip: 'Receives the writes of Local for redis-oplog.',
      },
    ]);
  });

  it('with Cache local current, shows the row Local · MongoDB', () => {
    const rows = view(input({ connections: [linkedLocal, cacheLocal], nav: { current: cacheLocal.id } }));
    expect(rows).toMatchObject([
      { name: 'Local', engine: 'MongoDB', tooltip: 'Publishes its writes to Cache local.', connection: 'local' },
    ]);
  });

  it('shows no row for a MongoDB connection with no linked connection', () => {
    expect(view(input({ connections: [local, cacheLocal], nav: { current: local.id } }))).toEqual([]);
  });

  it('with five MongoDB connections linked to Cache local, shows three rows and and 2 more', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) =>
      connection(id, id.toUpperCase(), 'mongodb', { publishesTo: cacheLocal.id }),
    );
    const rows = view(input({ connections: [...five, cacheLocal], nav: { current: cacheLocal.id } }));
    expect(rows.map((row) => (row.kind === 'more' ? row.label : row.name))).toEqual(['A', 'B', 'C', 'and 2 more']);
  });

  it('draws the dot as a ring while the linked connection is not connected', () => {
    const notConnected = { ...cacheLocal, status: { kind: 'not-connected' } as const };
    const rows = view(input({ connections: [linkedLocal, notConnected, staging], nav: { current: local.id } }));
    expect(rows[0]?.kind === 'connection' && rows[0].dot).toBe('ring');
  });
});
