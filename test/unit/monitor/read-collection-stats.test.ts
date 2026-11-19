import { describe, expect, it } from 'vitest';
import { collectionEntries, parse, request } from '../../../src/features/monitor/read-collection-stats';
import type { Json } from '../../../src/shared/engine-request';
import { contextOn, failed, int, local, long, recorded, requestsOf } from './context';

const context = contextOn('monitor.read-collection-stats');
const megabyte = 1024 * 1024;

function collStats(size: number): Json[] {
  return [
    {
      ns: 'shop.x',
      storageStats: {
        count: int(10),
        size: long(size),
        avgObjSize: int(100),
        storageSize: int(4096),
        nindexes: int(1),
        totalIndexSize: int(4096),
        capped: false,
      },
    },
  ];
}

const listed: Json = [
  { name: 'users', type: 'collection' },
  { name: 'orders', type: 'collection' },
  { name: 'recent', type: 'view' },
  { name: 'system.views', type: 'collection' },
  { name: 'system.profile', type: 'collection' },
];

function entriesArg(reply: Json): Json {
  return collectionEntries(reply).map((entry) => ({ name: entry.name, type: entry.type }));
}

describe('monitor.read-collection-stats', () => {
  it('gives orders, users and recent: the view without numbers and without a $collStats', () => {
    const collections = entriesArg(listed);
    const sent = requestsOf(request(context, { connection: local.id, step: 'stats', database: 'shop', collections }));
    expect(sent.map((each) => each.collection)).toEqual(['users', 'orders']);
    expect(sent[0]?.arguments[0]).toEqual([{ $collStats: { storageStats: {} } }]);
    const result = parse([collStats(10 * megabyte), collStats(2048 * megabyte)], { step: 'stats', collections });
    const stats = result.step === 'stats' ? result.stats : [];
    expect(stats.map((each) => each.name)).toEqual(['orders', 'users', 'recent']);
    expect(stats[2]).toEqual({ name: 'recent', type: 'view' });
  });

  it('leaves out system.views and system.profile', () => {
    expect(collectionEntries(listed).map((entry) => entry.name)).toEqual(['users', 'orders', 'recent']);
  });

  it('takes the numbers of the first document $collStats returns (one shard’s, through a mongos)', () => {
    const result = parse([[...collStats(100), ...collStats(999)]], {
      step: 'stats',
      collections: [{ name: 'orders', type: 'collection' }],
    });
    expect(result.step === 'stats' ? result.stats[0]?.numbers?.size : undefined).toBe(100);
  });

  it('keeps the row of a collection whose $collStats is refused, with the error', () => {
    const result = parse([failed('not authorized on shop')], {
      step: 'stats',
      collections: [{ name: 'orders', type: 'collection' }],
    });
    expect(result.step === 'stats' ? result.stats[0] : undefined).toEqual({
      name: 'orders',
      type: 'collection',
      failure: { message: 'not authorized on shop' },
    });
  });

  it('reads the recorded listCollections and $collStats of shop', () => {
    const entries = collectionEntries(recorded('list-collections'));
    expect(entries.map((entry) => `${entry.name}:${entry.type}`).sort()).toEqual([
      'events:collection',
      'orders:collection',
      'paid:view',
    ]);
    const collections = entriesArg(recorded('list-collections'));
    const replies = recorded('coll-stats') as readonly Json[];
    const result = parse(replies, { step: 'stats', collections });
    const stats = result.step === 'stats' ? result.stats : [];
    expect(stats.find((each) => each.name === 'orders')?.numbers?.count).toBe(40);
    expect(stats.find((each) => each.name === 'events')?.numbers?.capped).toBe(true);
    expect(stats.at(-1)?.name).toBe('paid');
  });
});
