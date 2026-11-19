import { describe, expect, it } from 'vitest';
import type { Json } from '../../../src/shared/engine-request';
import type { Current } from '../../../src/features/undo/changed-since';
import { detailsBox, fieldRows, keyCell, loadingBox, request } from '../../../src/features/undo/details';
import { operationRead, type OperationRead } from '../../../src/features/undo/reads/operation';
import {
  fingerprint,
  type DocumentRecord,
  type KeyName,
  type OperationRecords,
} from '../../../src/features/undo/types';
import { appStateWith, cacheConnection, contextOf, entry, keyEntry, undoWith } from './harness';

function read(records: OperationRecords, current: Current, total?: number): OperationRead {
  const count = records.kind === 'documents' ? records.docs.length : records.keys.length;
  return { kind: 'read', records, current, total: total ?? count };
}

function doc(id: number, before: Json | null, after: string | null): DocumentRecord {
  return { id, before, after: after === null ? null : fingerprint(after) };
}

const key = 'b3JkZXJzOjQy' as KeyName;

describe('undo.details', () => {
  it('shows at most 100, and says how many there are', () => {
    const docs = Array.from({ length: 100 }, (_, index) => doc(index, { _id: index }, `sha-${String(index)}`));
    const box = detailsBox(entry(), read({ kind: 'documents', docs }, { kind: 'documents', docs: [] }, 2500));
    expect(box).toMatchObject({ kind: 'shown', first: 'First 100 of 2,500 documents.' });
    const keys = detailsBox(
      keyEntry(),
      read({ kind: 'keys', keys: [{ key, before: null, after: null }] }, { kind: 'keys', keys: [] }, 2500),
    );
    expect(keys).toMatchObject({ first: 'First 1 of 2,500 keys.' });
  });

  it('shows each document by its _id and what the operation did, and marks one changed since', () => {
    const records: OperationRecords = {
      kind: 'documents',
      docs: [doc(1, null, 'sha-1'), doc(2, { _id: 2, a: 1 }, 'sha-2'), doc(3, { _id: 3, a: 1 }, null)],
    };
    const current: Current = {
      kind: 'documents',
      docs: [
        { id: 1, document: { _id: 1, a: 1 }, fingerprint: fingerprint('sha-1') },
        { id: 2, document: { _id: 2, a: 2 }, fingerprint: fingerprint('sha-2-since') },
      ],
    };
    const box = detailsBox(entry(), read(records, current));
    if (box.kind !== 'shown') {
      throw new Error('not shown');
    }
    expect(box.items.map((item) => [item.name, item.what, item.changedSince])).toEqual([
      ['1', 'inserted: the undo deletes it', false],
      ['2', 'updated: the undo restores it', true],
      ['3', 'deleted: the undo inserts it again', false],
    ]);
    expect(box.changed).toBe('1 document changed after the operation: undoing overwrites those changes too.');
  });

  it('shows each key and what the operation did', () => {
    const records: OperationRecords = {
      kind: 'keys',
      keys: [
        { key, before: null, after: { sha1: fingerprint('x'), expiresAt: null } },
        {
          key: 'YQ==' as KeyName,
          before: { dump: 'AAEC', pttl: -1, type: 'string' },
          after: { sha1: fingerprint('y'), expiresAt: null },
        },
        { key: 'Yg==' as KeyName, before: { dump: 'AAEC', pttl: -1, type: 'string' }, after: null },
      ],
    };
    const box = detailsBox(keyEntry(), read(records, { kind: 'keys', keys: [] }));
    expect(box.kind === 'shown' ? box.items.map((item) => [item.name, item.what]) : []).toEqual([
      ['orders:42', 'created: the undo deletes it'],
      ['a', 'changed: the undo restores it'],
      ['b', 'deleted: the undo creates it again'],
    ]);
  });

  it('compares the fields by type, with — for a value missing on one side, and a missing document as one row', () => {
    expect(
      fieldRows({ _id: 1, n: { $numberInt: '1' }, gone: 1 }, { _id: 1, n: { $numberDouble: '1.0' }, back: 2 }),
    ).toEqual([
      { field: 'n', now: expect.any(String) as string, after: expect.any(String) as string },
      { field: 'gone', now: '1', after: '—', afterTooltip: 'Missing after the undo' },
      { field: 'back', now: '—', after: '2', nowTooltip: 'Missing now' },
    ]);
    const box = detailsBox(
      entry(),
      read({ kind: 'documents', docs: [doc(3, { _id: 3 }, null)] }, { kind: 'documents', docs: [] }),
    );
    expect(box.kind === 'shown' ? box.items[0]?.fields : []).toEqual([
      { field: '(document)', now: '—', after: '{ _id: 3 }', nowTooltip: 'Missing now' },
    ]);
  });

  it('shows a key as its type, the size of its dump and its expiry, never its value', () => {
    expect(keyCell({ dump: 'A'.repeat(1640), pttl: -1, type: 'string' }, 'now')).toEqual({
      text: 'string · 1.2 KB · no expiry',
    });
    expect(keyCell(undefined, 'after')).toEqual({ text: '—', tooltip: 'Missing after the undo' });
  });

  it('says a document already as the undo leaves it, or an insert already deleted', () => {
    const records: OperationRecords = {
      kind: 'documents',
      docs: [doc(2, { _id: 2, a: 1 }, 'sha-2'), doc(1, null, 'sha-1')],
    };
    const current: Current = {
      kind: 'documents',
      docs: [{ id: 2, document: { _id: 2, a: 1 }, fingerprint: fingerprint('sha-old') }],
    };
    const box = detailsBox(entry(), read(records, current));
    expect(box.kind === 'shown' ? box.items.map((item) => item.note) : []).toEqual([
      'Already as it was: the undo changes nothing.',
      'Already deleted.',
    ]);
  });

  it('says Loading… while the reads run, and shows a refusal in the box', () => {
    expect(detailsBox(entry(), undefined)).toEqual(loadingBox);
    expect(loadingBox).toMatchObject({ text: 'Loading…' });
    const gone = request(contextOf('undo.details', appStateWith()), { operation: 'op-1' });
    expect(gone).toMatchObject({ kind: 'refuse', code: 'undo.details/gone' });
    const undone = request(contextOf('undo.details', appStateWith(undoWith([entry({ undone: 1 })]))), {
      operation: 'op-1',
    });
    expect(undone).toMatchObject({ kind: 'refuse', code: 'undo.details/already-undone' });
    const orphan = request(contextOf('undo.details', appStateWith(undoWith([entry()]), [cacheConnection])), {
      operation: 'op-1',
    });
    expect(orphan).toMatchObject({ kind: 'refuse', code: 'undo.details/no-connection' });
    expect(request(contextOf('undo.details', appStateWith(undoWith([entry()]))), { operation: 'op-1' })).toEqual({
      kind: 'app',
      action: operationRead,
      args: { operation: 'op-1', first: 100 },
    });
  });
});
