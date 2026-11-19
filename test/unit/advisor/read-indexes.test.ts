import { describe, expect, it } from 'vitest';
import { nextRead, nothingRead, withReply } from '../../../src/features/advisor/parts/reading';
import {
  collectionBatches,
  databasesOf,
  parse,
  request,
  scopeIndexes,
  type IndexesReply,
} from '../../../src/features/advisor/read-indexes';
import type { Json } from '../../../src/shared/engine-request';
import { contextOn, date, failed, local, long, requestsOf } from '../monitor/context';
import { recorded } from './context';

const connection = local.id;

function listed(names: readonly { readonly name: string; readonly type?: string }[]): Json {
  return names.map((each) => ({ name: each.name, type: each.type ?? 'collection' }));
}

function indexesOf(
  replies: readonly unknown[],
  collections: readonly Json[],
): Extract<IndexesReply, { step: 'indexes' }> {
  const reply = parse(replies, { connection, step: 'indexes', collections: [...collections] });
  if (reply.step !== 'indexes') {
    throw new Error('Expected the step indexes.');
  }
  return reply;
}

const orders = { database: 'shop', collection: 'orders' };
const recordedReplies = ['list-indexes', 'index-stats', 'coll-stats', 'estimated-document-count'].map(recorded);

describe('advisor.read-indexes', () => {
  it('sends listDatabases with nameOnly and authorizedDatabases for the scope of a connection', () => {
    const [sent] = requestsOf(request(contextOn('advisor.read-indexes'), { connection, step: 'databases' }));
    expect(sent).toMatchObject({
      database: 'admin',
      method: 'runCommand',
      arguments: [{ listDatabases: { $numberInt: '1' }, nameOnly: true, authorizedDatabases: true }],
    });
  });

  it('for Local with admin, config, crm, local and shop, the collections of crm and shop are read, crm first', () => {
    const reply = { databases: ['shop', 'local', 'crm', 'config', 'admin'].map((name) => ({ name })), ok: 1 };
    const databases = databasesOf(reply, 'test');
    expect(databases).toEqual(['crm', 'shop']);
    const sent = requestsOf(
      request(contextOn('advisor.read-indexes'), { connection, step: 'collections', databases: [...databases] }),
    );
    expect(sent.map((each) => [each.database, each.method, each.arguments])).toEqual([
      ['crm', 'listCollections', [{}, { authorizedCollections: true }]],
      ['shop', 'listCollections', [{}, { authorizedCollections: true }]],
    ]);
  });

  it('the recorded listDatabases of MongoDB 8.2 gives shop alone', () => {
    expect(parse([recorded('list-databases')], { connection, step: 'databases', fallback: 'test' })).toEqual({
      step: 'databases',
      databases: ['shop'],
    });
  });

  it('when listDatabases is refused and the connection string names shop, only shop is read', () => {
    const refused = failed('not authorized on admin to execute command { listDatabases: 1 }', 13);
    expect(parse([refused], { connection, step: 'databases', fallback: 'shop' })).toEqual({
      step: 'databases',
      databases: ['shop'],
    });
  });

  it('a view, system.views and system.profile are not in the result; a database with system.profile is profiled', () => {
    const shop = listed([
      { name: 'orders' },
      { name: 'paid', type: 'view' },
      { name: 'system.views' },
      { name: 'system.profile' },
    ]);
    const reply = parse([shop, listed([{ name: 'users' }])], {
      connection,
      step: 'collections',
      databases: ['shop', 'crm'],
    });
    expect(reply).toEqual({
      step: 'collections',
      collections: [orders, { database: 'crm', collection: 'users' }],
      profiled: ['shop'],
    });
    expect(parse([recorded('list-collections')], { connection, step: 'collections', databases: ['shop'] })).toEqual({
      step: 'collections',
      collections: [orders],
      profiled: ['shop'],
    });
  });

  it('for the scope shop.orders, listCollections is sent with { name: "orders" } and one collection is returned', () => {
    const args = { connection, step: 'collections', databases: ['shop'], collection: 'orders' };
    const sent = requestsOf(request(contextOn('advisor.read-indexes'), args));
    expect(sent.map((each) => each.arguments[0])).toEqual([{ name: 'orders' }, { name: 'system.profile' }]);
    expect(parse([listed([{ name: 'orders' }]), listed([{ name: 'system.profile' }])], args)).toEqual({
      step: 'collections',
      collections: [orders],
      profiled: ['shop'],
    });
  });

  it('sends getIndexes, $indexStats, $collStats and the count for each collection, eight collections at a time', () => {
    const sent = requestsOf(
      request(contextOn('advisor.read-indexes'), { connection, step: 'indexes', collections: [orders] }),
    );
    expect(sent.map((each) => [each.collection, each.method, each.arguments])).toEqual([
      ['orders', 'listIndexes', []],
      ['orders', 'aggregate', [[{ $indexStats: {} }]]],
      ['orders', 'aggregate', [[{ $collStats: { storageStats: {} } }]]],
      ['orders', 'estimatedDocumentCount', []],
    ]);
    const twenty = Array.from({ length: 20 }, (_, at) => ({ database: 'shop', collection: `c${String(at)}` }));
    expect(collectionBatches(twenty).map((batch) => batch.length)).toEqual([8, 8, 4]);
  });

  it('the recorded replies of MongoDB 8.2 give each index with its kind, its size and its uses', () => {
    const [collection] = indexesOf(recordedReplies, [orders]).collections;
    expect(collection?.documents).toBe(60);
    const byName = new Map(collection?.indexes.map((each) => [each.name, each]));
    expect(byName.get('email_1')).toMatchObject({ unique: true, size: 20_480 });
    expect(byName.get('expiresAt_1')).toMatchObject({ expireAfterSeconds: 86_400 });
    expect(byName.get('customerId_1')).toMatchObject({ partialFilterExpression: { active: true } });
    expect(byName.get('note_1')).toMatchObject({ sparse: true });
    expect(byName.get('total_1')).toMatchObject({ hidden: true });
    expect(byName.get('name_1')).toMatchObject({ collation: 'fr' });
    expect(byName.get('status_1')).toMatchObject({ uses: 1, building: false, key: [{ field: 'status', value: 1 }] });
    expect(byName.get('status_1_createdAt_-1')?.key).toEqual([
      { field: 'status', value: 1 },
      { field: 'createdAt', value: -1 },
    ]);
  });

  it('without the privilege for $indexStats the indexes have no uses and no start, and the read does not fail', () => {
    const replies = [recordedReplies[0], failed('not authorized', 13), recordedReplies[2], recordedReplies[3]];
    const read = indexesOf(replies, [orders]);
    expect(read.failed).toEqual([]);
    expect(read.collections[0]?.indexes.every((each) => each.uses === undefined && each.since === undefined)).toBe(
      true,
    );
    expect(read.collections[0]?.indexes[1]?.size).toBe(20_480);
  });

  it('an index with accesses { ops: NumberLong(0), since: 2026-11-06T09:00:00Z } has 0 uses since that time', () => {
    const definitions = [{ v: 2, key: { note: 1 }, name: 'note_1' }];
    const stats = [{ name: 'note_1', accesses: { ops: long(0), since: date('2026-11-06T09:00:00Z') } }];
    const [collection] = indexesOf([definitions, stats, [], 12], [orders]).collections;
    expect(collection?.indexes[0]).toMatchObject({ uses: 0, since: Date.UTC(2026, 10, 6, 9, 0, 0) });
  });

  it('a collection whose getIndexes fails is a failed collection, and the others are returned', () => {
    const audit = { database: 'shop', collection: 'audit' };
    const replies = [
      failed('not authorized on shop to execute command { listIndexes: "audit" }', 13),
      [],
      [],
      0,
      ...recordedReplies,
    ];
    const read = indexesOf(replies, [audit, orders]);
    expect(read.failed).toEqual([
      { namespace: 'shop.audit', message: 'not authorized on shop to execute command { listIndexes: "audit" }' },
    ]);
    expect(read.collections.map((each) => each.collection)).toEqual(['orders']);
  });

  it('the reads follow each other: databases, collections, the batches of indexes, then the slow operations', () => {
    const input = { connection, scope: { kind: 'connection' } as const, fallback: 'test' };
    expect(nextRead(input, nothingRead)?.args).toMatchObject({ step: 'databases', fallback: 'test' });
    let progress = withReply(nothingRead, { step: 'databases', databases: ['shop'] });
    expect(nextRead(input, progress)?.args).toMatchObject({ step: 'collections', databases: ['shop'] });
    progress = withReply(progress, { step: 'collections', collections: [orders], profiled: ['shop'] });
    expect(nextRead(input, progress)?.args).toMatchObject({ step: 'indexes', collections: [orders] });
    progress = withReply(progress, indexesOf(recordedReplies, [orders]));
    expect(nextRead(input, progress)).toMatchObject({
      key: 'slow',
      read: 'advisor.read-slow-operations',
      args: { connection, databases: ['shop'], profiled: ['shop'], collections: ['shop.orders'] },
    });
  });

  it('for the scope of a database, listDatabases is not sent', () => {
    const input = { connection, scope: { kind: 'database', database: 'shop' } as const, fallback: 'test' };
    expect(nextRead(input, nothingRead)?.args).toMatchObject({ step: 'collections', databases: ['shop'] });
  });

  it('puts the replies of the calls together', () => {
    const listedReply = { step: 'collections' as const, collections: [orders], profiled: ['shop'] };
    const read = indexesOf(recordedReplies, [orders]);
    expect(scopeIndexes(['shop'], listedReply, [read])).toEqual({
      databases: ['shop'],
      profiled: ['shop'],
      collections: read.collections,
      failed: [],
    });
  });
});
