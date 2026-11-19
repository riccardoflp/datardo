import { describe, expect, it } from 'vitest';
import { oplogFilter, parse, request } from '../../../src/features/monitor/read-oplog';
import type { Json } from '../../../src/shared/engine-request';
import { contextOn, failed, local, recorded, requestsOf, timestamp } from './context';

const context = contextOn('monitor.read-oplog');

function entries(count: number): Json[] {
  return Array.from({ length: count }, (_, index) => ({
    ts: timestamp(1763366400, count - index),
    op: 'i',
    ns: 'shop.users',
    o: { _id: index },
  }));
}

/** Whether a filter of the oplog finds an entry, for the parts the filter uses. */
function finds(filter: Json, entry: { readonly ns: string; readonly applyOps?: readonly string[] }): boolean {
  const branches = (filter as { $or: readonly Record<string, Json>[] }).$or;
  const matches = (wanted: Json, ns: string): boolean =>
    typeof wanted === 'string' ? wanted === ns : new RegExp((wanted as { $regex: string }).$regex, 'u').test(ns);
  return branches.some((branch) =>
    'ns' in branch
      ? matches(branch['ns'] ?? null, entry.ns)
      : (entry.applyOps ?? []).some((ns) => matches(branch['o.applyOps.ns'] ?? null, ns)),
  );
}

describe('monitor.read-oplog', () => {
  it('gives the filters of the card’s table', () => {
    expect(oplogFilter('', 'all-but-noops')).toEqual({ op: { $ne: 'n' } });
    expect(oplogFilter('', 'everything')).toEqual({});
    expect(oplogFilter('', 'update')).toEqual({ op: 'u' });
    expect(oplogFilter('shop', 'all-but-noops')).toEqual({
      op: { $ne: 'n' },
      $or: [{ ns: { $regex: '^shop\\.' } }, { 'o.applyOps.ns': { $regex: '^shop\\.' } }],
    });
    expect(oplogFilter('shop.users', 'delete')).toEqual({
      op: 'd',
      $or: [{ ns: 'shop.users' }, { 'o.applyOps.ns': 'shop.users' }],
    });
    expect(oplogFilter('my.db', 'everything')).toEqual({ $or: [{ ns: 'my.db' }, { 'o.applyOps.ns': 'my.db' }] });
  });

  it('sends 201 with Last at 200, and 201 entries give 200 rows and the mark that there are more', () => {
    const [sent] = requestsOf(request(context, { connection: local.id, text: '', operation: 'everything', last: 200 }));
    expect(sent).toMatchObject({ database: 'local', collection: 'oplog.rs', limit: 201, timeLimitMs: 10_000 });
    expect(sent?.arguments[1]).toEqual({ sort: { $natural: { $numberInt: '-1' } }, limit: { $numberInt: '201' } });
    const read = parse([entries(201)], { last: 200 });
    expect(read.kind === 'read' ? [read.value.rows.length, read.value.more] : []).toEqual([200, true]);
    const fewer = parse([entries(12)], { last: 50 });
    expect(fewer.kind === 'read' ? [fewer.value.rows.length, fewer.value.more] : []).toEqual([12, false]);
  });

  it('finds an insert into shop.users inside a transaction by the text shop.users', () => {
    const filter = oplogFilter('shop.users', 'all-but-noops');
    expect(finds(filter, { ns: 'admin.$cmd', applyOps: ['shop.users'] })).toBe(true);
  });

  it('does not find a.bc with the text a.b', () => {
    const filter = oplogFilter('a.b', 'everything');
    expect(finds(filter, { ns: 'a.b' })).toBe(true);
    expect(finds(filter, { ns: 'a.bc' })).toBe(false);
  });

  it('escapes the characters of a regular expression in a database name', () => {
    expect(oplogFilter('a+b', 'everything')).toMatchObject({ $or: [{ ns: { $regex: '^a\\+b\\.' } }, {}] });
  });

  it('says that few entries match and the oplog is long when maxTimeMS stops the read', () => {
    const read = parse([failed('operation exceeded time limit', 50)], { last: 50 });
    expect(read.kind === 'failed' ? read.failure.message : '').toBe(
      'Few entries match and the oplog is long: reading it took more than 10 s. operation exceeded time limit',
    );
    const other = parse([failed('not authorized on local', 13)], { last: 50 });
    expect(other.kind === 'failed' ? other.failure.message : '').toBe('not authorized on local');
  });

  it('reads the recorded entries of shop, newest first', () => {
    const read = parse([recorded('oplog-recent')], { last: 50 });
    const rows = read.kind === 'read' ? read.value.rows : [];
    expect(rows.length).toBeGreaterThan(5);
    expect(read.kind === 'read' ? read.value.more : true).toBe(false);
    const times = rows.map((row) => row.time);
    expect([...times].sort((one, other) => other - one)).toEqual(times);
  });
});
