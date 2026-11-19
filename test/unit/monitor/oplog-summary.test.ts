import { describe, expect, it } from 'vitest';
import { oplogRow } from '../../../src/features/monitor/oplog-summary';
import type { Json } from '../../../src/shared/engine-request';
import { date, int, recorded, timestamp } from './context';

function row(entry: Record<string, Json>): ReturnType<typeof oplogRow> {
  return oplogRow({ ts: timestamp(1763366400, 1), ...entry });
}

describe('monitor.oplog-summary', () => {
  it('summarizes an update in the diff format: set status, address.city · unset tempToken', () => {
    const found = row({
      op: 'u',
      ns: 'shop.orders',
      o2: { _id: int(7) },
      o: { $v: int(2), diff: { u: { status: 'paid' }, d: { tempToken: false }, saddress: { u: { city: 'Rome' } } } },
    });
    expect(found).toMatchObject({ kind: 'update', id: '7', summary: 'set status, address.city · unset tempToken' });
  });

  it('summarizes $set and $unset: set a · unset b', () => {
    expect(row({ op: 'u', o: { $set: { a: int(1) }, $unset: { b: '' } } }).summary).toBe('set a · unset b');
  });

  it('writes the elements and the length of an array: set items.0, items (length)', () => {
    const found = row({ op: 'u', o: { $v: int(2), diff: { sitems: { a: true, u0: { qty: int(2) }, l: int(3) } } } });
    expect(found.summary).toBe('set items.0, items (length)');
  });

  it('writes a whole document as replace with', () => {
    const found = row({ op: 'u', o2: { _id: int(7) }, o: { _id: int(7), status: 'new' } });
    expect(found.summary).toBe('replace with { _id: 7, status: "new" }');
  });

  it('writes a command with its namespace and the rest of o', () => {
    const found = row({
      op: 'c',
      ns: 'shop.$cmd',
      o: { create: 'orders', idIndex: { v: int(2), key: { _id: int(1) }, name: '_id_' } },
    });
    expect(found).toMatchObject({
      kind: 'command',
      summary: 'create shop.orders { idIndex: { v: 2, key: { _id: 1 }, name: "_id_" } }',
    });
  });

  it('counts the operations of a transaction: 3 operations: 2 × insert shop.orders, update shop.users', () => {
    const found = row({
      op: 'c',
      ns: 'admin.$cmd',
      o: {
        applyOps: [
          { op: 'i', ns: 'shop.orders', o: { _id: int(1) } },
          { op: 'i', ns: 'shop.orders', o: { _id: int(2) } },
          { op: 'u', ns: 'shop.users', o2: { _id: int(3) }, o: { $set: { a: int(1) } } },
        ],
      },
    });
    expect(found).toMatchObject({
      kind: 'transaction',
      summary: '3 operations: 2 × insert shop.orders, update shop.users',
    });
  });

  it('gives a no-op its msg', () => {
    expect(row({ op: 'n', o: { msg: 'periodic noop' } })).toMatchObject({ kind: 'noop', summary: 'periodic noop' });
  });

  it('cuts an inserted document of 2,000 characters at 300 characters and …, and keeps the whole entry', () => {
    const entry = { op: 'i', ns: 'shop.notes', o: { _id: int(1), text: 'x'.repeat(2000) } };
    const found = row(entry);
    expect(Array.from(found.summary)).toHaveLength(301);
    expect(found.summary.endsWith('…')).toBe(true);
    expect(found.entry).toMatchObject(entry);
  });

  it('keys an entry with Timestamp(1763366400, 3) as 1763366400:3', () => {
    expect(oplogRow({ ts: timestamp(1763366400, 3), op: 'n', o: {} }).key).toBe('1763366400:3');
  });

  it('gives an entry without wall the time of its timestamp’s seconds, and one with wall its wall', () => {
    expect(oplogRow({ ts: timestamp(1763366400, 3), op: 'n', o: {} }).time).toBe(1763366400 * 1000);
    const walled = oplogRow({ ts: timestamp(1763366400, 3), wall: date('2026-11-17T14:00:00.250Z'), op: 'n', o: {} });
    expect(walled.time).toBe(Date.parse('2026-11-17T14:00:00.250Z'));
  });

  it('reads the recorded entries: an insert, an update, a delete, a transaction and a create', () => {
    const rows = (recorded('oplog-recent') as readonly Json[]).map(oplogRow);
    const kinds = new Set(rows.map((each) => each.kind));
    for (const kind of ['insert', 'update', 'delete', 'transaction', 'command']) {
      expect(kinds).toContain(kind);
    }
    expect(rows.find((each) => each.kind === 'transaction')?.summary).toBe('2 operations: 2 × insert shop.customers');
    expect(rows.find((each) => each.kind === 'update')?.summary).toBe('set tier · unset name');
  });
});
