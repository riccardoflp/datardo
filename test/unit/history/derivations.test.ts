import { describe, expect, it } from 'vitest';
import { versionDiff } from '../../../src/features/history/diff';
import { documentWrites, idKey } from '../../../src/features/history/document-writes';
import { ownWrites, recordedSpan } from '../../../src/features/history/own-writes';
import type { DocumentWrite, JsonObject } from '../../../src/features/history/types';
import { unknownValue, writeKind } from '../../../src/features/history/types';
import { updateChanges, updateChangesText } from '../../../src/features/history/update-changes';
import { documentHistory } from '../../../src/features/history/versions';
import type { Json } from '../../../src/shared/engine-request';
import { recordedCollection, recordedEntries, recordedId, recordedWrites } from './recorded';

const int = (value: number): Json => ({ $numberInt: String(value) });
const ts = (t: number, i = 1): Json => ({ $timestamp: { t, i } });
const key = idKey(int(7));

function write(overrides: Partial<DocumentWrite> & Pick<DocumentWrite, 'op' | 'o'>): DocumentWrite {
  return { t: 100, i: 1, position: -1, ...overrides };
}

function changesOf(o: JsonObject): string {
  const changes = updateChanges(o);
  return changes === undefined ? '' : updateChangesText(changes);
}

describe('history.document-writes', () => {
  it('reads the writes of the recorded document, in every way it was written', () => {
    const writes = recordedWrites();
    expect(writes.map(writeKind)).toEqual(['delete', 'update', 'replace', 'update', 'update', 'update', 'insert']);
    expect(writes.every((each) => each.wall !== undefined)).toBe(true);
  });

  it('marks the update made inside a transaction with its session and its transaction number', () => {
    const inTransaction = recordedWrites()[1];
    expect(inTransaction?.group).toBe('transaction');
    expect(inTransaction?.position).toBe(0);
    expect(inTransaction?.session).toMatch(/^UUID\("/u);
    expect(inTransaction?.transactionNumber).toBe('NumberLong(6)');
    expect(inTransaction?.partial).toBeUndefined();
  });

  it('leaves out the other document written by the same transaction', () => {
    const transaction = recordedEntries()[1] as Json;
    expect(documentWrites(transaction, recordedCollection, idKey(recordedId))).toHaveLength(1);
  });

  it('tells a batch, a large and a prepared transaction, and a chunk migration', () => {
    const operation = { op: 'u', ns: 'shop.orders', o: { $v: int(2), diff: { u: { a: 1 } } }, o2: { _id: int(7) } };
    const batch = {
      op: 'c',
      ns: 'admin.$cmd',
      ts: ts(5),
      o: { applyOps: [{ ...operation, stmtId: int(0) }] },
      lsid: { id: 1 },
    };
    expect(documentWrites(batch, 'shop.orders', key)[0]?.group).toBe('batch');
    const large = { ...batch, o: { applyOps: [operation] }, partialTxn: true, txnNumber: { $numberLong: '3' } };
    expect(documentWrites(large, 'shop.orders', key)[0]).toMatchObject({ group: 'transaction', partial: true });
    const prepared = { ...batch, o: { applyOps: [operation], prepare: true } };
    expect(documentWrites(prepared, 'shop.orders', key)[0]?.prepared).toBe(true);
    const migration = { ...operation, ts: ts(6), fromMigrate: true };
    expect(documentWrites(migration, 'shop.orders', key)[0]?.migration).toBe(true);
  });

  it('reads a drop and the renames of the collection, and nothing of another collection', () => {
    expect(
      documentWrites({ op: 'c', ns: 'shop.$cmd', ts: ts(1), o: { drop: 'orders' } }, 'shop.orders', key)[0]?.command,
    ).toEqual({ kind: 'collection-dropped' });
    const renamedAway = { op: 'c', ns: 'shop.$cmd', ts: ts(2), o: { renameCollection: 'shop.orders', to: 'shop.old' } };
    expect(documentWrites(renamedAway, 'shop.orders', key)[0]?.command).toEqual({ kind: 'renamed-to', to: 'shop.old' });
    const renamedInto = { op: 'c', ns: 'shop.$cmd', ts: ts(3), o: { renameCollection: 'shop.new', to: 'shop.orders' } };
    const into = documentWrites(renamedInto, 'shop.orders', key)[0];
    expect(into === undefined ? undefined : writeKind(into)).toBe('renamed');
    expect(documentWrites({ op: 'c', ns: 'shop.$cmd', ts: ts(4), o: { drop: 'others' } }, 'shop.orders', key)).toEqual(
      [],
    );
  });

  it('tells the _id apart by value, not by the type of a number', () => {
    expect(idKey(int(7))).toBe(idKey({ $numberLong: '7' }));
    expect(idKey(int(7))).not.toBe(idKey('7'));
  });
});

describe('history.update-changes', () => {
  it('reads the fields an update set and unset, and the arrays it resized', () => {
    expect(changesOf({ $v: int(2), diff: { d: { note: false }, u: { status: 'paid' } } })).toBe(
      'set status · unset note',
    );
    expect(changesOf({ $v: int(2), diff: { sitems: { a: true, l: int(2) } } })).toBe('resized items to 2');
    expect(
      changesOf({
        $v: int(2),
        diff: { i: { address: { city: 'Rome' } }, sitems: { a: true, s1: { u: { qty: int(5) } } } },
      }),
    ).toBe('set address, items.1.qty');
  });

  it('reads the update operators of the oldest servers, and says when nothing changed', () => {
    expect(changesOf({ $set: { status: 'paid' }, $unset: { note: true } })).toBe('set status · unset note');
    expect(changesOf({ $v: int(2), diff: {} })).toBe('no change');
  });
});

describe('history.versions', () => {
  it('rebuilds every version from the insert, all exact, the last no document', () => {
    const history = documentHistory(recordedWrites(), undefined);
    expect(history.versions.map((each) => each.state)).toEqual([
      'exact',
      'exact',
      'exact',
      'exact',
      'exact',
      'exact',
      'absent',
    ]);
    expect(history.before.state).toBe('absent');
    expect(history.conflict).toBe(false);
    expect(history.versions[1]?.document).toMatchObject({ status: 'paid' });
    expect(history.versions[1]?.document).not.toHaveProperty('note');
    expect(history.versions[3]?.document?.['items']).toHaveLength(2);
    expect(history.versions[4]?.document).toEqual({
      _id: recordedId,
      status: 'replaced',
      qty: { $numberDouble: '1.0' },
    });
  });

  it('marks partial the versions before the replacement when the insert is no longer in the oplog', () => {
    const writes = recordedWrites().filter((each) => each.op !== 'i' && each.op !== 'd');
    const current = { _id: recordedId, status: 'shipped', qty: { $numberDouble: '1.0' } };
    const history = documentHistory(writes, current);
    const states = history.versions.map((each) => each.state);
    expect(states.slice(-2)).toEqual(['exact', 'exact']);
    expect(states.slice(0, 3).every((state) => state === 'partial' || state === 'unknown')).toBe(true);
  });

  it('says why an update does not fit the version before', () => {
    const writes = [
      write({ t: 1, op: 'i', o: { _id: int(7), a: int(1) } }),
      write({ t: 2, op: 'd', o: { _id: int(7) } }),
      write({ t: 3, op: 'u', o: { $v: int(2), diff: { u: { a: int(2) } } }, o2: { _id: int(7) } }),
    ];
    expect(documentHistory(writes, undefined).versions[2]?.mismatch).toBe('An update of a document that was deleted');
  });
});

describe('history.diff', () => {
  const doc = (document: JsonObject) => ({ kind: 'document', document }) as const;

  it('gives the fields added, removed and changed, with ? for what is not known', () => {
    const rows = versionDiff(
      doc({ _id: int(7), a: int(1), b: 'x', c: unknownValue }),
      doc({ _id: int(7), a: int(2), c: 'y', d: true }),
    );
    expect(rows.map((row) => row.path)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.find((row) => row.path === 'b')?.after).toBeUndefined();
    expect(rows.find((row) => row.path === 'c')?.before).toEqual({ kind: 'unknown' });
  });

  it('says the two types when values look the same', () => {
    const rows = versionDiff(doc({ qty: int(1) }), doc({ qty: { $numberDouble: '1.0' } }));
    expect(rows).toEqual([
      {
        path: 'qty',
        before: { kind: 'value', value: int(1) },
        after: { kind: 'value', value: { $numberDouble: '1.0' } },
        types: ['int', 'double'],
      },
    ]);
  });

  it('gives the rows of each example of the card', () => {
    const paths = (before: Parameters<typeof versionDiff>[0], after: Parameters<typeof versionDiff>[1]) =>
      versionDiff(before, after).map((row) => row.path);
    expect(paths({ kind: 'absent' }, doc({ _id: int(1), a: int(1) }))).toEqual(['_id', 'a']);
    expect(paths(doc({ _id: int(1), a: int(1) }), { kind: 'absent' })).toEqual(['_id', 'a']);
    expect(paths({ kind: 'unknown' }, doc({ _id: int(1), a: int(5) }))).toEqual(['_id', 'a']);
    expect(paths(doc({ _id: int(1) }), { kind: 'unknown' })).toEqual([]);
    expect(paths(doc({ _id: int(1), a: int(1), b: int(2) }), doc({ _id: int(1), b: int(2), a: int(1) }))).toEqual([]);
    expect(paths(doc({ _id: int(1), tags: ['a'] }), doc({ _id: int(1), tags: ['a', 'b'] }))).toEqual(['tags']);
    const unknownBoth = doc({ _id: int(1), status: unknownValue, qty: unknownValue, note: unknownValue });
    expect(paths(unknownBoth, doc({ _id: int(1), status: 'paid', qty: unknownValue, note: unknownValue }))).toEqual([
      'status',
    ]);
    expect(
      paths(doc({ _id: int(1), qty: unknownValue, note: unknownValue }), doc({ _id: int(1), qty: int(3) })),
    ).toEqual(['qty', 'note']);
  });

  it('walks arrays of the same length element by element, and stops at 200 rows', () => {
    const items = (qty: number) => [{ qty: int(1) }, { qty: int(1) }, { qty: int(qty) }];
    expect(versionDiff(doc({ items: items(1) }), doc({ items: items(2) })).map((row) => row.path)).toEqual([
      'items.2.qty',
    ]);
    const many = (value: number) =>
      Object.fromEntries(Array.from({ length: 300 }, (_, index) => [`f${String(index)}`, int(value)]));
    expect(versionDiff(doc(many(1)), doc(many(2)))).toHaveLength(200);
  });
});

describe('history.own-writes', () => {
  it('matches the writes with the operations of the undo history nearest in time that did the same', () => {
    const history = documentHistory(recordedWrites(), undefined);
    const update = history.versions[1];
    const wall = update?.write.wall ?? 0;
    const titles = ownWrites(history.versions, [
      { title: 'Edit status of 65f1c0de', time: wall + 2000, did: 'updated' },
      { title: 'Delete a document', time: wall - 10 * 60_000, did: 'deleted' },
    ]);
    expect(titles.get(update?.key ?? '')).toBe('Edit status of 65f1c0de');
    expect([...titles.values()]).toEqual(['Edit status of 65f1c0de']);
  });

  it('asks the undo history for the times around the writes', () => {
    const history = documentHistory(recordedWrites(), undefined);
    const walls = history.versions.map((each) => each.write.wall ?? 0);
    expect(recordedSpan(history.versions)).toEqual({
      from: Math.min(...walls) - 60_000,
      to: Math.max(...walls) + 300_000,
    });
    expect(recordedSpan([])).toBeUndefined();
  });
});
