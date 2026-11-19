import { describe, expect, it } from 'vitest';
import { balance } from '../../../src/features/monitor/balance';
import type { Shard, ShardedCollection, ShardData } from '../../../src/features/monitor/parts/sharding-records';
import { collectionRows } from '../../../src/features/monitor/parts/sharding-tables';

const megabyte = 1024 * 1024;
const gigabyte = 1024 * megabyte;

function shard(name: string, draining = false): Shard {
  return { name, host: name, members: [name], draining, zones: [], primaryOf: [], record: { _id: name } };
}

function collection(
  sizes?: readonly number[],
  verdict?: ShardedCollection['verdict'],
  namespace = 'shop.orders',
): ShardedCollection {
  const data: ShardData[] | undefined = sizes?.map((size, index) => ({
    shard: `shard0${String(index + 1)}`,
    size,
    count: 1,
  }));
  return {
    namespace,
    key: '{ _id: 1 }',
    unique: false,
    balancing: true,
    chunks: [],
    totalChunks: 0,
    jumbo: 0,
    zones: [],
    record: { _id: namespace },
    ...(data === undefined ? {} : { data }),
    ...(verdict === undefined ? {} : { verdict }),
  };
}

const two = [shard('shard01'), shard('shard02')];
const three = [...two, shard('shard03')];

describe('monitor.balance', () => {
  it('says uneven for 3 GB and 1 GB: the largest shard holds 75% of the data', () => {
    expect(balance(collection([3 * gigabyte, gigabyte]), two, 128)).toEqual({
      word: 'uneven',
      warning: true,
      tooltip: 'The largest shard holds 75% of the data',
    });
  });

  it('leaves 600 MB and 300 MB empty: 600 MB is under 675 MB', () => {
    expect(balance(collection([600 * megabyte, 300 * megabyte]), two, 128).word).toBe('');
  });

  it('says uneven for 500 MB, 100 MB and 100 MB: 71%', () => {
    expect(balance(collection([500 * megabyte, 100 * megabyte, 100 * megabyte]), three, 128)).toMatchObject({
      word: 'uneven',
      tooltip: 'The largest shard holds 71% of the data',
    });
  });

  it('leaves 400 MB, 100 MB and 100 MB empty: the gap is not over 384 MB', () => {
    expect(balance(collection([400 * megabyte, 100 * megabyte, 100 * megabyte]), three, 128).word).toBe('');
  });

  it('leaves 0 and 0 empty', () => {
    expect(balance(collection([0, 0]), two, 128).word).toBe('');
  });

  it('leaves 5 GB on one shard empty when the other drains', () => {
    expect(balance(collection([5 * gigabyte, 0]), [shard('shard01'), shard('shard02', true)], 128).word).toBe('');
  });

  it('says balanced for a compliant collection whatever its data per shard', () => {
    expect(balance(collection([5 * gigabyte, 0], { compliant: true }), two)).toEqual({
      word: 'balanced',
      warning: false,
      tooltip: 'balancerCollectionStatus: compliant',
    });
  });

  it('says zone violation as a warning for firstComplianceViolation: zoneViolation', () => {
    expect(balance(collection(undefined, { compliant: false, violation: 'zoneViolation' }), two)).toEqual({
      word: 'zone violation',
      warning: true,
      tooltip: 'balancerCollectionStatus: zoneViolation: the balancer has chunks of this collection to move or merge',
    });
  });

  it('names the other violations, the server’s own word, or not balanced', () => {
    const word = (violation?: string) =>
      balance(
        collection(undefined, violation === undefined ? { compliant: false } : { compliant: false, violation }),
        two,
      ).word;
    expect(word('chunksImbalance')).toBe('uneven chunks');
    expect(word('draining')).toBe('draining');
    expect(word('defragmentingChunks')).toBe('defragmenting');
    expect(word('somethingNew')).toBe('somethingNew');
    expect(word()).toBe('not balanced');
  });

  it('leaves the cell empty without data per shard and without a verdict', () => {
    expect(balance(collection(), two)).toEqual({ word: '', warning: false, tooltip: '' });
  });

  it('sorts the collections by this word', () => {
    const rows = collectionRows(
      [
        collection(undefined, { compliant: false, violation: 'zoneViolation' }, 'a.z'),
        collection(undefined, { compliant: true }, 'a.b'),
        collection([3 * gigabyte, gigabyte], undefined, 'a.u'),
      ],
      { shards: two, filter: '', sort: { column: 'balance', descending: false } },
    );
    expect(rows.map((row) => row.balance.word)).toEqual(['balanced', 'uneven', 'zone violation']);
  });
});
