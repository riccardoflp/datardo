import { describe, expect, it } from 'vitest';
import {
  nextShardingRead,
  nothingSharded,
  shardingOf,
  withShardingReply,
  type ShardingProgress,
} from '../../../src/features/monitor/parts/sharding-reading';
import { parse } from '../../../src/features/monitor/read-sharding';
import type { Json } from '../../../src/shared/engine-request';
import { cluster, failed, now, recorded } from './context';
import { clusterReplies, compliant, helloMongos, imbalanced, shardingState, shardMap } from './sharding-replies';

const input = { connection: cluster.id, full: true, at: now };

/** The progress after answering `replies` to the step `args`. */
function answered(progress: ShardingProgress, args: Json | undefined, replies: readonly unknown[]): ShardingProgress {
  if (args === undefined) {
    throw new Error('Expected a step.');
  }
  return withShardingReply(progress, parse(replies, args));
}

describe('monitor.read-sharding', () => {
  it('stops after hello on a standalone server, and after shardingState in a replica set', () => {
    const first = nextShardingRead(input, nothingSharded);
    expect(first).toEqual({ connection: cluster.id, step: 'hello' });
    const standalone = answered(nothingSharded, first, [recorded('hello-standalone')]);
    expect(nextShardingRead(input, standalone)).toBeUndefined();
    expect(shardingOf(standalone).server).toMatchObject({ kind: 'read', value: { kind: 'standalone' } });

    const member = answered(nothingSharded, first, [recorded('hello-replica-set')]);
    const state = nextShardingRead(input, member);
    expect(state).toEqual({ connection: cluster.id, step: 'sharding-state', me: 'localhost:27017' });
    const shard = answered(member, state, [shardingState]);
    expect(nextShardingRead(input, shard)).toBeUndefined();
    expect(shardingOf(shard)).toEqual({
      server: {
        kind: 'read',
        value: { kind: 'shard-member', me: 'localhost:27017', shard: 'shard01', configServer: 'cfg/c1:27019,c2:27019' },
      },
    });
  });

  it('stops after hello when hello fails', () => {
    const progress = answered(nothingSharded, { step: 'hello' }, [failed('connection refused')]);
    expect(nextShardingRead(input, progress)).toBeUndefined();
    expect(shardingOf(progress).cluster).toBeUndefined();
  });

  it('reads the cluster through a mongos, then the collections of a full read, then nothing more', () => {
    const mongos = answered(nothingSharded, { step: 'hello' }, [helloMongos]);
    const clusterArgs = nextShardingRead(input, mongos);
    expect(clusterArgs).toEqual({ connection: cluster.id, step: 'cluster', at: now });
    const read = answered(mongos, clusterArgs, clusterReplies());
    const collections = nextShardingRead(input, read);
    expect(collections).toEqual({
      connection: cluster.id,
      step: 'collections',
      verdicts: ['logs.events', 'shop.orders', 'shop.users'],
      collStats: [],
    });
    const done = answered(read, collections, [compliant, imbalanced, compliant]);
    expect(nextShardingRead(input, done)).toBeUndefined();
    const orders = shardingOf(done).cluster?.collections?.find((each) => each.namespace === 'shop.orders');
    expect(orders?.verdict).toEqual({ compliant: false, violation: 'chunksImbalance' });
  });

  it('sends no collections step on a read that is not full', () => {
    const mongos = answered(nothingSharded, { step: 'hello' }, [helloMongos]);
    const read = answered(mongos, { step: 'cluster', at: now }, clusterReplies());
    expect(nextShardingRead({ ...input, full: false }, read)).toBeUndefined();
    expect(shardingOf(read).cluster?.collections).toHaveLength(3);
  });

  it('asks getShardMap last when serverStatus does not name the config servers, and keeps its answer', () => {
    const mongos = answered(nothingSharded, { step: 'hello' }, [helloMongos]);
    const read = answered(mongos, { step: 'cluster', at: now }, clusterReplies({ 8: { ok: 1 } }));
    const partial = { ...input, full: false };
    const map = nextShardingRead(partial, read);
    expect(map).toEqual({ connection: cluster.id, step: 'shard-map' });
    const done = answered(read, map, [shardMap]);
    expect(nextShardingRead(partial, done)).toBeUndefined();
    expect(shardingOf(done).cluster?.configServer).toBe('cfg/c1:27019,c2:27019,c3:27019');
  });
});
