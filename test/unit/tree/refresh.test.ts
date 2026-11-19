import { describe, expect, it } from 'vitest';
import { parse, refreshArgs, refreshReads, request } from '../../../src/features/tree/refresh';
import { freshIsland } from '../../../src/features/tree/types';
import { connectionId } from '../../../src/shared/ids';
import { contextOf, mongoConnection, recorded, redisConnection, stateOf } from './context';

const local = connectionId('c-local');
const island = { ...freshIsland, expanded: ['database:shop', 'database:media', 'collection:shop.orders'] };

describe('tree.refresh', () => {
  it('for the whole connection reads the databases, then what is under each expanded database; a collapsed one is not read', () => {
    const args = refreshArgs(stateOf(), island, local, { kind: 'connection' });
    expect(refreshReads(args)).toEqual([
      { read: 'tree.list-databases', args: { connection: 'c-local', fallback: 'app' } },
      { read: 'tree.list-collections', args: { connection: 'c-local', database: 'shop' } },
      { read: 'tree.list-collections', args: { connection: 'c-local', database: 'media' } },
    ]);
  });

  it('refreshing one database reads nothing about the others', () => {
    const args = refreshArgs(stateOf(), island, local, { kind: 'database', database: 'shop' });
    expect(refreshReads(args)).toEqual([
      { read: 'tree.list-collections', args: { connection: 'c-local', database: 'shop' } },
    ]);
  });

  it('Redis: refreshing a database scans it again from the cursor 0', () => {
    const cache = redisConnection();
    const state = stateOf({ connections: [cache] });
    const expanded = { ...freshIsland, expanded: ['redis-database:0', 'redis-database:2'] };
    const args = refreshArgs(state, expanded, cache.id, { kind: 'redis-database', database: 2 });
    expect(refreshReads(args)).toEqual([
      { read: 'tree.scan-namespaces', args: { connection: 'c-cache', database: 2, cursor: '0' } },
    ]);
    const whole = refreshReads(refreshArgs(state, expanded, cache.id, { kind: 'connection' }));
    expect(whole.map((each) => each.read)).toEqual([
      'tree.redis-databases',
      'tree.scan-namespaces',
      'tree.scan-namespaces',
    ]);
  });

  it('sends the requests of every read one after the other', () => {
    const args = refreshArgs(stateOf(), island, local, { kind: 'connection' });
    const read = request(contextOf('tree.refresh'), args);
    expect(
      read.kind === 'engine'
        ? read.requests.map((each) => (each.request.engine === 'mongodb' ? each.request.method : ''))
        : [],
    ).toEqual(['runCommand', 'listCollections', 'listCollections']);
  });

  it('refreshing a connection that is not connected connects it first', () => {
    const state = stateOf({ state: 'not-connected' });
    const outcome = request(
      contextOf('tree.refresh', state),
      refreshArgs(state, island, local, { kind: 'connection' }),
    );
    expect(outcome.kind === 'run' ? outcome.plan.after : []).toEqual([
      {
        kind: 'start',
        feature: 'connection.connect',
        target: { kind: 'connection', connection: 'c-local' },
        args: { connection: 'c-local' },
      },
    ]);
    expect(outcome.kind === 'run' ? outcome.plan.steps : ['a step']).toEqual([]);
  });

  it('gives each read its own result: one that fails does not touch the others', () => {
    const args = refreshArgs(stateOf(), island, local, { kind: 'connection' });
    const message = 'not authorized on media to execute command { listCollections: 1, … }';
    const results = parse(
      [
        recorded('mongodb-8.2-listDatabases-sizes.json'),
        recorded('mongodb-8.2-tree-listCollections.json'),
        { kind: 'error', message },
      ],
      args,
    );
    expect(results.map((each) => each.result.kind)).toEqual(['loaded', 'loaded', 'failed']);
    expect(results[2]?.result).toEqual({ kind: 'failed', message });
  });

  it('the args name the engine of the connection, and its expanded databases only', () => {
    const args = refreshArgs(stateOf({ connections: [mongoConnection()] }), island, local, { kind: 'connection' });
    expect(args).toMatchObject({ engine: 'mongodb', expanded: ['shop', 'media'] });
  });
});
