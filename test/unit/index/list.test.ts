import { describe, expect, it } from 'vitest';
import { listRequests, listTimeLimitMs, parse } from '../../../src/features/index/list';
import type { Json } from '../../../src/shared/engine-request';
import { recordedReplies } from './harness';

function long(value: number): Json {
  return { $numberLong: String(value) };
}

function date(iso: string): Json {
  return { $date: { $numberLong: String(Date.parse(iso)) } };
}

const statusIndex = { v: { $numberInt: '2' }, key: { status: { $numberInt: '1' } }, name: 'status_1' };

function stat(uses: number, since: string, host: string, shard?: string): Json {
  return {
    name: 'status_1',
    key: { status: { $numberInt: '1' } },
    host,
    ...(shard === undefined ? {} : { shard }),
    accesses: { ops: long(uses), since: date(since) },
    spec: statusIndex,
  };
}

function storage(size: number, shard: string, building: readonly string[] = []): Json {
  return {
    shard,
    storageStats: {
      count: long(10),
      size: long(100),
      totalIndexSize: long(size),
      indexSizes: { status_1: long(size) },
      indexBuilds: [...building],
    },
  };
}

describe('index.list', () => {
  it('asks getIndexes, $indexStats and $collStats, and currentOp only during a build', () => {
    const args = { connection: 'c-local', database: 'shop', collection: 'orders' };
    const requests = listRequests(args);
    expect(requests.map((request) => request.method)).toEqual(['listIndexes', 'aggregate', 'aggregate']);
    expect(requests[0]?.timeLimitMs).toBe(listTimeLimitMs);
    const building = listRequests({ ...args, building: true });
    expect(building[3]?.arguments).toEqual([
      { currentOp: 1, 'command.createIndexes': 'orders', 'command.$db': 'shop' },
    ]);
    expect(listRequests({ ...args, definitionsOnly: true })).toHaveLength(1);
  });

  it('returns an index used on the member read from with its uses and no list of members', () => {
    const list = parse(recordedReplies());
    const email = list.indexes.find((index) => index.name === 'email_1');
    expect(email?.uses).toBe(1);
    expect(email?.members).toBeUndefined();
    expect(email?.size).toBe(4096);
    expect(email?.options).toEqual({ v: 2, unique: true });
    expect(list.indexes.map((index) => index.name)).toEqual([
      '_id_',
      'email_1',
      'createdAt_1',
      'title_text_body_text',
      'status_1',
      'total_-1',
      'name_1',
    ]);
    expect(list.totals).toEqual({ documents: 2, dataSize: 240, indexSize: 28_672 });
  });

  it('sums the uses and the sizes of two shards, and lists the members', () => {
    const list = parse([
      [statusIndex],
      [
        stat(300, '2026-03-01T00:00:00Z', 'db1:27018', 'shard01'),
        stat(500, '2026-03-05T00:00:00Z', 'db2:27018', 'shard02'),
      ],
      [storage(1_048_576, 'shard01'), storage(2_097_152, 'shard02')],
    ]);
    const [index] = list.indexes;
    expect(index?.uses).toBe(800);
    expect(index?.size).toBe(3_145_728);
    expect(index?.members?.map(({ shard, host, uses }) => ({ shard, host, uses }))).toEqual([
      { shard: 'shard01', host: 'db1:27018', uses: 300 },
      { shard: 'shard02', host: 'db2:27018', uses: 500 },
    ]);
  });

  it('gives since the most recent start of the counters', () => {
    const list = parse([
      [statusIndex],
      [stat(1, '2026-03-01T00:00:00Z', 'db1:27017'), stat(1, '2026-03-05T00:00:00Z', 'db2:27017')],
      [],
    ]);
    expect(list.indexes[0]?.since).toBe(Date.parse('2026-03-05T00:00:00Z'));
  });

  it('marks building without a progress for a user without the inprog privilege', () => {
    const list = parse([
      [statusIndex],
      [],
      [storage(4096, 'shard01', ['status_1'])],
      new Error('not authorized on admin'),
    ]);
    expect(list.indexes[0]?.building).toBe(true);
    expect(list.indexes[0]?.progress).toBeUndefined();
  });

  it('returns the indexes with no size and unknown totals when $collStats fails, and no error', () => {
    const replies = recordedReplies();
    const list = parse([replies[0], replies[1], { ok: 0, errmsg: 'not authorized', code: 13 }]);
    expect(list.indexes).toHaveLength(7);
    expect(list.indexes.every((index) => index.size === undefined)).toBe(true);
    expect(list.totals).toEqual({});
    expect(() => parse([new Error('not authorized on shop')])).toThrow('not authorized on shop');
  });

  it('adds an index being built that getIndexes does not list, marked building', () => {
    const building = { ...(stat(0, '2026-03-05T00:00:00Z', 'db1:27017') as object), building: true } as Json;
    const list = parse([[], [building], []]);
    expect(list.indexes.map((index) => [index.name, index.building])).toEqual([['status_1', true]]);
  });
});
