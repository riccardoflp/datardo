import { describe, expect, it } from 'vitest';
import {
  notRefreshed,
  parse,
  refreshArgs,
  refreshed,
  refreshReads,
  request,
  scopeOf,
  whileRefreshing,
} from '../../../src/features/tree/refresh';
import { afterPage, freshScan } from '../../../src/features/tree/scan-namespaces';
import { freshIsland, type DatabaseContents, type TreeIsland } from '../../../src/features/tree/types';
import { connectionId } from '../../../src/shared/ids';
import { bytes, contextOf, mongoConnection, recorded, redisConnection, stateOf } from './context';

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
    expect(read).toMatchObject({ failedRequests: 'are-replies' });
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

  it('the scope comes from the args of the control that starts it; anything else refreshes the whole connection', () => {
    expect(scopeOf({ scope: { kind: 'database', database: 'shop' } })).toEqual({ kind: 'database', database: 'shop' });
    expect(scopeOf({ scope: { kind: 'redis-database', database: 3 } })).toEqual({
      kind: 'redis-database',
      database: 3,
    });
    expect(scopeOf({ scope: { kind: 'database', database: 3 } })).toEqual({ kind: 'connection' });
    expect(scopeOf(null)).toEqual({ kind: 'connection' });
  });
});

describe('tree.refresh in the island', () => {
  const shop: DatabaseContents = { buckets: [], entries: [{ name: 'orders', kind: 'collection', system: false }] };
  const databases = [{ name: 'shop' }, { name: 'media' }, { name: 'logs' }];
  const loaded: TreeIsland = {
    ...island,
    mongodb: {
      ...freshIsland.mongodb,
      databases: { kind: 'loaded', value: databases },
      contents: {
        shop: { kind: 'loaded', value: shop },
        logs: { kind: 'loaded', value: { buckets: [], entries: [] } },
      },
    },
  };
  const reads = refreshReads(refreshArgs(stateOf(), loaded, local, { kind: 'connection' }));

  it('while it reads, what was shown stays; what a collapsed database held is forgotten', () => {
    const during = whileRefreshing(loaded, reads, 1000);
    expect(during.mongodb.databases).toEqual({ kind: 'loading', since: 1000, previous: databases });
    expect(during.mongodb.contents['shop']).toEqual({ kind: 'loading', since: 1000, previous: shop });
    expect(during.mongodb.contents['media']).toEqual({ kind: 'loading', since: 1000 });
    expect(during.mongodb.contents['logs']).toBeUndefined();
  });

  it('each result goes under its node; a failed read shows its message there, the others their result', () => {
    const during = whileRefreshing(loaded, reads, 1000);
    const after = refreshed(during, [
      { read: reads[0]!, result: { kind: 'loaded', value: [{ name: 'shop' }] } },
      { read: reads[1]!, result: { kind: 'loaded', value: shop } },
      { read: reads[2]!, result: { kind: 'failed', message: 'not authorized on media' } },
    ]);
    expect(after.mongodb.databases).toEqual({ kind: 'loaded', value: [{ name: 'shop' }] });
    expect(after.mongodb.contents['shop']).toEqual({ kind: 'loaded', value: shop });
    expect(after.mongodb.contents['media']).toEqual({ kind: 'failed', message: 'not authorized on media' });
  });

  it('a refresh cancelled shows again what was shown; one that failed shows its message', () => {
    const during = whileRefreshing(loaded, reads, 1000);
    const cancelledOne = notRefreshed(during, reads);
    expect(cancelledOne.mongodb.contents['shop']).toEqual({ kind: 'loaded', value: shop });
    expect(cancelledOne.mongodb.contents['media']).toEqual({ kind: 'idle' });
    expect(notRefreshed(during, reads, 'connection refused').mongodb.databases).toEqual({
      kind: 'failed',
      message: 'connection refused',
    });
  });

  it('Redis: a scan starts again from the cursor 0, and stays scanning until its run ends', () => {
    const cache = redisConnection();
    const state = stateOf({ connections: [cache] });
    const seen = afterPage(freshScan, { cursor: '88', keys: bytes('old:1') });
    const scanned: TreeIsland = {
      ...freshIsland,
      expanded: ['redis-database:2'],
      redis: { ...freshIsland.redis, scans: { '2': { scan: seen } } },
    };
    const scans = refreshReads(refreshArgs(state, scanned, cache.id, { kind: 'redis-database', database: 2 }));
    const during = whileRefreshing(scanned, scans, 500);
    expect(during.redis.scans['2']).toEqual({ scan: freshScan, scanning: { since: 500 } });
    const going = refreshed(during, [
      { read: scans[0]!, result: { kind: 'loaded', value: { cursor: '12', keys: bytes('a:1') } } },
    ]);
    expect(going.redis.scans['2']?.scanning).toEqual({ since: 500 });
    expect(going.redis.scans['2']?.scan.keys).toEqual(bytes('a:1'));
    const ended = refreshed(during, [
      { read: scans[0]!, result: { kind: 'loaded', value: { cursor: '0', keys: [] } } },
    ]);
    expect(ended.redis.scans['2']).toEqual({ scan: afterPage(freshScan, { cursor: '0', keys: [] }) });
    const stopped = notRefreshed(during, scans, 'LOADING Redis is loading the dataset in memory');
    expect(stopped.redis.scans['2']).toMatchObject({
      scan: { ended: 'paused' },
      failed: 'LOADING Redis is loading the dataset in memory',
    });
  });
});
