import { describe, expect, it } from 'vitest';
import { eventsFilter, parse, request, shardingEvent } from '../../../src/features/monitor/read-sharding-events';
import type { Json } from '../../../src/shared/engine-request';
import { cluster, contextOn, date, failed, int, requestsOf } from './context';
import { actionlog, changelog } from './sharding-replies';

const context = contextOn('monitor.read-sharding-events', cluster);
const balancerWhat = {
  what: { $regex: '^(moveChunk|moveRange|split|multi-split|merge|autoMerge|balancer|rangeDeletion|cleanUpOrphaned)' },
};

function many(count: number, start: number): Json[] {
  return Array.from({ length: count }, (_, index) => ({
    _id: `e${String(start + index)}`,
    time: { $date: { $numberLong: String(Date.parse('2026-11-17T10:00:00Z') + (start + index) * 1000) } },
    what: 'split',
    ns: 'shop.orders',
    details: {},
  }));
}

describe('monitor.read-sharding-events', () => {
  it('reads both collections with the limit 100 and keeps at most 100 events, newest first', () => {
    const sent = requestsOf(request(context, { connection: cluster.id, text: '', show: 'balancer' }));
    expect(sent.map((each) => each.collection)).toEqual(['changelog', 'actionlog']);
    expect(sent[0]).toMatchObject({ database: 'config', limit: 100, timeLimitMs: 15_000 });
    expect(sent[0]?.arguments).toEqual([
      balancerWhat,
      { sort: { time: { $numberInt: '-1' } }, limit: { $numberInt: '100' } },
    ]);
    expect(sent[1]?.arguments[0]).toEqual({});
    const read = parse([many(100, 0), many(100, 100)]);
    const events = read.kind === 'read' ? read.value : [];
    expect(events).toHaveLength(100);
    expect(events[0]?.key).toBe('"e199"');
    expect(events.map((event) => event.time)).toEqual([...events.map((event) => event.time)].sort((a, b) => b - a));
  });

  it('filters by ns: "shop.orders" with that text, and does not read config.actionlog', () => {
    const sent = requestsOf(request(context, { connection: cluster.id, text: 'shop.orders', show: 'balancer' }));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.arguments[0]).toEqual({ ...balancerWhat, ns: 'shop.orders' });
    expect(eventsFilter('shop', 'every')).toEqual({ ns: { $regex: '^shop\\.' } });
    expect(eventsFilter('', 'every')).toEqual({});
  });

  it('summarizes a moveChunk.commit as { a: 0 } → { a: 100 } · shard01 → shard02 · 12,400 documents copied', () => {
    const event = shardingEvent((changelog as Json[])[0] ?? null);
    expect(event).toMatchObject({
      what: 'moveChunk.commit',
      namespace: 'shop.orders',
      shard: 'shard01',
      summary: '{ a: 0 } → { a: 100 } · shard01 → shard02 · 12,400 documents copied',
      failure: false,
    });
  });

  it('makes a moveChunk.from with the note aborted a failure, with aborted in its summary', () => {
    const event = shardingEvent((changelog as Json[])[1] ?? null);
    expect(event.failure).toBe(true);
    expect(event.summary).toBe('{ a: 100 } → { a: 200 } · shard01 → shard02 · aborted');
  });

  it('summarizes a balancer.round as 1 chunk moved · 5 candidates · 340 ms', () => {
    const event = shardingEvent((actionlog as Json[])[0] ?? null, true);
    expect(event).toMatchObject({ summary: '1 chunk moved · 5 candidates · 340 ms', failure: false, action: true });
    expect(event.shard).toBe('cfg1');
  });

  it('summarizes a split, a multi-split, another event and an error message', () => {
    expect(shardingEvent((changelog as Json[])[2] ?? null).summary).toBe('at { a: 50 } · { a: 0 } → { a: 100 }');
    const multi = shardingEvent({
      what: 'multi-split',
      time: date('2026-11-17T13:00:00Z'),
      details: { number: int(2), of: int(5), chunk: { min: { a: int(0) }, max: { a: int(10) } } },
    });
    expect(multi.summary).toBe('2 of 5 · { a: 0 } → { a: 10 }');
    const other = shardingEvent({ what: 'dropCollection', details: { note: 'x' } });
    expect(other.summary).toBe('{ note: "x" }');
    const error = shardingEvent({ what: 'moveChunk.error', details: { errmsg: 'boom' } });
    expect(error).toMatchObject({ summary: 'boom', failure: true });
    const round = shardingEvent({ what: 'balancer.round', details: { errorOccurred: true } });
    expect(round.failure).toBe(true);
  });

  it('shows config.changelog: <the server’s message> when the read fails', () => {
    const read = parse([failed('not authorized on config to execute command { find: "changelog" }', 13), []]);
    expect(read).toEqual({
      kind: 'failed',
      failure: { message: 'config.changelog: not authorized on config', code: 13 },
    });
  });
});
