import { describe, expect, it } from 'vitest';
import { collectionsArgs, nextRequests, parse, request } from '../../../src/features/search/collections';
import { firstInput } from '../../../src/features/search/types';
import type { ConnectionRequest, Json, MongoRequest } from '../../../src/shared/engine-request';
import type { ReadRequest } from '../../../src/shared/feature';
import { contextOn, int, local, recorded } from './context';

const context = contextOn('search.collections');

function mongo(each: ConnectionRequest): MongoRequest {
  if (each.request.engine !== 'mongodb') {
    throw new Error('Expected a MongoDB request');
  }
  return each.request;
}

function first(args: Json): MongoRequest {
  const read = request(context, args) as Extract<ReadRequest, { kind: 'engine' }>;
  const [only] = read.requests;
  if (only === undefined) {
    throw new Error('Expected a request');
  }
  return mongo(only);
}

const listed = [
  { name: 'fs.chunks', type: 'collection' },
  { name: 'fs.files', type: 'collection' },
  { name: 'orders', type: 'collection' },
  { name: 'system.views', type: 'collection' },
  { name: 'recent', type: 'view' },
];

function shopArgs(more: Readonly<Record<string, Json>> = {}): Json {
  return { connection: local.id, database: 'shop', collections: [], views: false, fallback: 'app', ...more };
}

function names(args: Json, replies: readonly unknown[]): readonly string[] {
  const read = parse(replies, args);
  return read.kind === 'collections' ? read.collections.map((each) => `${each.database}.${each.collection}`) : [];
}

describe('search.collections', () => {
  it('lists the databases with nameOnly and authorizedDatabases for Every database', () => {
    const sent = first({ connection: local.id, collections: [], views: false, fallback: 'app' });
    expect(sent).toMatchObject({ database: 'admin', method: 'runCommand' });
    expect(sent.arguments).toEqual([{ listDatabases: int(1), nameOnly: true, authorizedDatabases: true }]);
  });

  it('reads the collections of crm and then of shop, and sends nothing to admin, config and local', () => {
    const args = { connection: local.id, collections: [], views: false, fallback: 'app' };
    const databases = ['admin', 'config', 'local', 'shop', 'crm'].map((name) => ({ name }));
    const next = nextRequests(args, [{ databases, ok: int(1) }]).map(mongo);
    expect(next.map((each) => `${each.method} ${each.database}`)).toEqual([
      'listCollections crm',
      'listCollections shop',
    ]);
  });

  it('leaves out system. collections, the chunks of a bucket and the views when Views is off', () => {
    expect(names(shopArgs(), [listed])).toEqual(['shop.fs.files', 'shop.orders']);
  });

  it('reads recent too with Views on, after orders, as a view without an estimated count', () => {
    const args = shopArgs({ views: true });
    const counts = nextRequests(args, [listed]).map(mongo);
    expect(counts.map((each) => `${each.method} ${each.collection ?? ''}`)).toEqual([
      'estimatedDocumentCount fs.files',
      'estimatedDocumentCount orders',
    ]);
    const read = parse([listed, int(1), int(5000)], args);
    expect(read).toEqual({
      kind: 'collections',
      collections: [
        { database: 'shop', collection: 'fs.files', view: false, estimate: 1 },
        { database: 'shop', collection: 'orders', view: false, estimate: 5000 },
        { database: 'shop', collection: 'recent', view: true },
      ],
      excluded: 0,
    });
  });

  it('reads exactly the collections ticked, a view and the chunks of a bucket included', () => {
    expect(names(shopArgs({ collections: ['recent', 'fs.chunks'] }), [listed])).toEqual([
      'shop.fs.chunks',
      'shop.recent',
    ]);
  });

  it('searches the database of the connection string alone when the user may not list the databases', () => {
    const args = { connection: local.id, collections: [], views: false, fallback: 'shop' };
    const refused = { kind: 'error', message: 'not authorized on admin to execute command { listDatabases: 1 }' };
    expect(
      nextRequests(args, [refused])
        .map(mongo)
        .map((each) => each.database),
    ).toEqual(['shop']);
    expect(names(args, [refused, [{ name: 'orders', type: 'collection' }]])).toEqual(['shop.orders']);
  });

  it('takes the database the connection string names for that fallback', () => {
    expect(collectionsArgs(context.state, local.id, firstInput)).toEqual({
      connection: local.id,
      views: false,
      fallback: 'app',
      exclusions: [],
    });
    expect(
      collectionsArgs(context.state, local.id, { ...firstInput, database: 'shop', collections: ['orders'] }),
    ).toMatchObject({
      database: 'shop',
      collections: ['orders'],
    });
  });

  it('still reads a collection whose estimatedDocumentCount fails, without a total', () => {
    const read = parse([[{ name: 'orders', type: 'collection' }], { kind: 'error', message: 'timed out' }], shopArgs());
    expect(read).toEqual({
      kind: 'collections',
      collections: [{ database: 'shop', collection: 'orders', view: false }],
      excluded: 0,
    });
  });

  it('ends with the server message when the collections of a database cannot be listed', () => {
    const failed = { kind: 'error', message: 'not authorized on shop to execute command { listCollections: 1 }' };
    expect(parse([failed], shopArgs())).toEqual({ kind: 'error', message: failed.message });
    expect(nextRequests(shopArgs(), [failed])).toEqual([]);
  });

  it('reads the replies recorded from MongoDB 8.2', () => {
    const args = { connection: local.id, collections: [], views: false, fallback: 'app' };
    expect(names(args, recorded('listDatabases'))).toEqual(['search-record.fs.files', 'search-record.orders']);
    const one = { connection: local.id, database: 'search-record', collections: [], views: true, fallback: 'app' };
    expect(parse(recorded('collections'), one)).toEqual({
      kind: 'collections',
      collections: [
        { database: 'search-record', collection: 'fs.files', view: false, estimate: 1 },
        { database: 'search-record', collection: 'orders', view: false, estimate: 4 },
        { database: 'search-record', collection: 'recent', view: true },
      ],
      excluded: 0,
    });
  });

  it('sends nothing more once the counts have answered', () => {
    expect(nextRequests(shopArgs(), [listed, int(1), int(2)])).toEqual([]);
  });

  it('with exclusions crm and shop.orders and Every database, sends nothing to crm, reads fs.files of shop alone, and leaves 2 out', () => {
    const args = {
      connection: local.id,
      collections: [],
      views: false,
      fallback: 'app',
      exclusions: ['crm', 'shop.orders'],
    };
    const databases = ['admin', 'crm', 'shop'].map((name) => ({ name }));
    const sent = nextRequests(args, [{ databases, ok: int(1) }]).map(mongo);
    expect(sent.map((each) => `${each.method} ${each.database}`)).toEqual(['listCollections shop']);
    const read = parse([{ databases, ok: int(1) }, listed, int(1)], args);
    expect(read).toEqual({
      kind: 'collections',
      collections: [{ database: 'shop', collection: 'fs.files', view: false, estimate: 1 }],
      excluded: 2,
    });
  });

  it('with In at crm, excluded, reads the collections of crm and leaves none out', () => {
    const args = {
      connection: local.id,
      database: 'crm',
      collections: [],
      views: false,
      fallback: 'app',
      exclusions: ['crm'],
    };
    expect(first(args)).toMatchObject({ database: 'crm', method: 'listCollections' });
    const read = parse([[{ name: 'users', type: 'collection' }], int(3)], args);
    expect(read).toEqual({
      kind: 'collections',
      collections: [{ database: 'crm', collection: 'users', view: false, estimate: 3 }],
      excluded: 0,
    });
  });

  it('counts a view left out by Views before its exclusion as not excluded', () => {
    const args = shopArgs({ exclusions: ['shop.fs.files', 'shop.recent'] });
    const read = parse([listed, int(5)], args);
    expect(read).toEqual({
      kind: 'collections',
      collections: [{ database: 'shop', collection: 'orders', view: false, estimate: 5 }],
      excluded: 1,
    });
  });

  it('reads a ticked collection whatever its exclusion, and leaves nothing out', () => {
    const read = parse([listed, int(5)], shopArgs({ collections: ['orders'], exclusions: ['shop.orders'] }));
    expect(read).toEqual({
      kind: 'collections',
      collections: [{ database: 'shop', collection: 'orders', view: false, estimate: 5 }],
      excluded: 0,
    });
  });

  it('takes the exclusions of the connection as the search starts', () => {
    const state = {
      ...context.state,
      connections: {
        ...context.state.connections,
        saved: context.state.connections.saved.map((each) =>
          each.id === local.id ? { ...each, exclusions: ['archive', 'shop.logs'] } : each,
        ),
      },
    };
    expect(collectionsArgs(state, local.id, firstInput)).toMatchObject({ exclusions: ['archive', 'shop.logs'] });
  });
});
