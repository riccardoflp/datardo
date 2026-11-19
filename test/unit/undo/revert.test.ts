import { describe, expect, it } from 'vitest';
import type { EngineStep, Outcome } from '../../../src/shared/feature';
import { recordsJson } from '../../../src/features/undo/files/records';
import { revertReport } from '../../../src/features/undo/revert';
import { fingerprint, type KeyName, type OperationRecords, type UndoEntry } from '../../../src/features/undo/types';
import { cacheConnection, entry, keyEntry, localConnection, planOf, revert, stepsOf } from './harness';

const order = 'b3JkZXJzOjQy' as KeyName;
const session = 'c2Vzc2lvbjo5' as KeyName;

/** The answer of the read of the operation: its records and how they are now. */
function operation(records: OperationRecords, current: unknown): { readonly operation: unknown } {
  return { operation: { records: recordsJson(records), current } };
}

const updated: OperationRecords = {
  kind: 'documents',
  docs: [1, 2, 3].map((id) => ({
    id,
    before: { _id: id, n: { $numberInt: '1' } },
    after: fingerprint(`f${String(id)}`),
  })),
};

function documentsNow(changed: number[] = []): unknown {
  return {
    docs: [1, 2, 3].map((id) => ({
      id,
      document: { _id: id, n: { $numberInt: '2' } },
      fingerprint: changed.includes(id) ? 'since' : `f${String(id)}`,
    })),
  };
}

function bulkOf(outcome: Outcome): unknown {
  const step = stepsOf(outcome)[0] as EngineStep | undefined;
  return step?.request.engine === 'mongodb' ? step.request.arguments[0] : undefined;
}

function redisWords(outcome: Outcome): readonly string[] {
  const step = stepsOf(outcome)[0] as EngineStep | undefined;
  const decoder = new TextDecoder();
  return step?.request.engine === 'redis' ? step.request.command.map((word) => decoder.decode(word)) : [];
}

describe('undo.revert', () => {
  it('reads the operation first, then puts back every changed field with its BSON type', () => {
    expect(revert(entry())).toMatchObject({ kind: 'read', need: { key: 'operation', args: { operation: 'op-1' } } });
    const outcome = revert(entry(), operation(updated, documentsNow()));
    expect(bulkOf(outcome)).toEqual(
      [1, 2, 3].map((id) => ({
        replaceOne: { filter: { _id: id }, replacement: { _id: id, n: { $numberInt: '1' } }, upsert: true },
      })),
    );
  });

  it('inserts the deleted documents again with their _ids, and deletes inserted ones', () => {
    const deleted: OperationRecords = { kind: 'documents', docs: [{ id: 7, before: { _id: 7 }, after: null }] };
    expect(bulkOf(revert(entry(), operation(deleted, { docs: [] })))).toEqual([
      { replaceOne: { filter: { _id: 7 }, replacement: { _id: 7 }, upsert: true } },
    ]);
    const inserted: OperationRecords = { kind: 'documents', docs: [{ id: 8, before: null, after: fingerprint('i') }] };
    const now = { docs: [{ id: 8, document: { _id: 8 }, fingerprint: 'i' }] };
    expect(bulkOf(revert(entry(), operation(inserted, now)))).toEqual([{ deleteOne: { filter: { _id: 8 } } }]);
  });

  it('restores a deleted hash with the 90 seconds it had left, in db0', () => {
    const records: OperationRecords = {
      kind: 'keys',
      keys: [{ key: order, before: { dump: btoa('hash'), pttl: 90_000, type: 'hash' }, after: null }],
    };
    const outcome = revert(keyEntry(), operation(records, { keys: [] }));
    expect(redisWords(outcome)).toEqual(['RESTORE', 'orders:42', '90000', 'hash', 'REPLACE']);
    const step = stepsOf(outcome)[0] as EngineStep;
    expect(step.request).toMatchObject({ engine: 'redis', database: 0 });
  });

  it('sends DEL for a key the operation created', () => {
    const records: OperationRecords = {
      kind: 'keys',
      keys: [{ key: session, before: null, after: { sha1: fingerprint('x'), expiresAt: null } }],
    };
    const now = {
      keys: [
        {
          key: session,
          image: { dump: btoa('x'), pttl: -1, type: 'string' },
          fingerprint: { sha1: 'x', expiresAt: null },
        },
      ],
    };
    expect(redisWords(revert(keyEntry(), operation(records, now)))).toEqual(['DEL', 'session:9']);
  });

  it('asks Undo all or Undo unchanged only, and the second leaves what changed and still marks the operation undone', () => {
    const answers = operation(updated, documentsNow([2]));
    expect(revert(entry(), answers)).toMatchObject({
      kind: 'ask',
      question: { title: 'Undo "Update many in shop.orders" in Local › shop.orders?' },
    });
    const outcome = revert(entry(), { ...answers, choice: 'unchanged' });
    expect((bulkOf(outcome) as unknown[]).length).toBe(2);
    expect(stepsOf(outcome).at(-1)).toMatchObject({
      kind: 'app',
      action: 'undo.mark-undone',
      args: { operation: 'op-1' },
    });
    expect(planOf(outcome).danger).toMatchObject({ button: 'Undo' });
  });

  it('says what it undid, in which connection and target', () => {
    const outcome = planOf(revert(entry(), operation(updated, documentsNow())));
    expect(outcome.after).toContainEqual({
      kind: 'notify',
      level: 'success',
      text: 'Undid "Update many in shop.orders": 3 documents in Local › shop.orders.',
    });
    expect(revertReport(keyEntry(), 'Cache local', { taken: 5, failed: 0 }).text).toBe(
      'Undid "Delete the key orders:42": 5 keys in Cache local › db0.',
    );
  });

  it('says an undo is incomplete when some failed', () => {
    expect(revertReport(entry(), 'Local', { taken: 5, failed: 2, error: 'E11000' })).toEqual({
      text: 'Undo of "Update many in shop.orders" incomplete: 2 documents of 5 failed: E11000',
      failed: true,
    });
  });

  it('titles the undo Undo: X, and that of Undo: X Redo: X', () => {
    expect(planOf(revert(entry(), operation(updated, documentsNow()))).title).toBe('Undo: Update many in shop.orders');
    const again: UndoEntry = entry({ title: 'Undo: Update many in shop.orders' });
    expect(planOf(revert(again, operation(updated, documentsNow()))).title).toBe('Redo: Update many in shop.orders');
  });

  it('publishes the undo of documents like any other write, and refreshes the open tabs', () => {
    const result = planOf(revert(entry(), operation(updated, documentsNow())));
    expect(result.publishes).toBe(true);
    expect(result.after).toContainEqual({ kind: 'refresh', connection: localConnection.id });
  });

  it('says the undo itself cannot be undone with Stop keeping undo history on, or over the limit', () => {
    const stopped = [{ ...localConnection, keepsUndo: false }, cacheConnection];
    const off = planOf(revert(entry(), operation(updated, documentsNow()), undefined, { connections: stopped }));
    expect(off.undo).toEqual({ cannot: "The undo history is off for this connection: this can't be undone." });
    const recorded = planOf(revert(entry(), operation(updated, documentsNow())));
    expect('keeps' in recorded.undo).toBe(true);
    const limited = { 'datardo.undo.maxDocumentsPerOperation': 2 };
    const over = planOf(revert(entry(), operation(updated, documentsNow()), undefined, { stored: limited }));
    expect(over.undo).toEqual({
      cannot: "This can't be undone: the undo history keeps operations of up to 2 documents.",
    });
  });

  it('shows the message in the page when started from it, and no notification', () => {
    const result = planOf(revert(entry(), operation(updated, documentsNow()), 'table'));
    expect(result.after.some((each) => each.kind === 'notify')).toBe(false);
    expect(result.steps.at(-1)).toMatchObject({ args: { pageMessage: expect.any(String) as string } });
  });

  it('is refused on a connection made read-only since, and sends nothing', () => {
    const readOnly = [{ ...localConnection, readOnly: true }, cacheConnection];
    expect(revert(entry(), {}, undefined, { connections: readOnly })).toEqual({
      kind: 'refuse',
      code: 'undo.revert/read-only',
      message: 'The connection Local is read-only: nothing can be undone through it.',
    });
  });
});
