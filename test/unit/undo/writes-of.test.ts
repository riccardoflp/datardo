import { describe, expect, it } from 'vitest';
import { connectionId } from '../../../src/shared/ids';
import { fingerprint, operationId, type OperationRecords, type UndoEntry } from '../../../src/features/undo/types';
import { writesOf, type RecordsByOperation } from '../../../src/features/undo/writes-of';
import { entry } from './harness';

const place = { connection: connectionId('c-local'), database: 'shop', collection: 'orders' };
const range = { from: 0, to: Number.MAX_SAFE_INTEGER };
const doc = { _id: 1, status: 'a' };

function one(before: unknown, after: string | null): OperationRecords {
  return {
    kind: 'documents',
    docs: [{ id: 1, before: before as null, after: after === null ? null : fingerprint(after) }],
  };
}

function op(id: string, title: string, more: Partial<UndoEntry> = {}): UndoEntry {
  return entry({ id: operationId(id), title, time: 1000, ...more });
}

function writes(
  operations: readonly UndoEntry[],
  records: RecordsByOperation,
  within = range,
): ReturnType<typeof writesOf> {
  return writesOf({ operations, records }, place, 1, within);
}

describe('undo.writes-of', () => {
  it('reads an operation not undone from its own file: Delete document 1 is deleted', () => {
    expect(writes([op('d', 'Delete document 1')], { d: one(doc, null) })).toEqual([
      { title: 'Delete document 1', time: 1000, kind: 'deleted' },
    ]);
  });

  it('reads an undone operation from its undo: Insert document is inserted, Edit status of 1 is updated', () => {
    const insert = op('i', 'Insert document', { undone: 2000, size: 0 });
    const undoInsert = op('ui', 'Undo: Insert document', { undoOf: operationId('i'), time: 2000 });
    expect(
      writes([undoInsert, insert], { ui: one(doc, null) }).find((each) => each.title === 'Insert document'),
    ).toEqual({
      title: 'Insert document',
      time: 1000,
      kind: 'inserted',
    });
    const edit = op('e', 'Edit status of 1', { undone: 2000, size: 0 });
    const undoEdit = op('ue', 'Undo: Edit status of 1', { undoOf: operationId('e'), time: 2000 });
    expect(
      writes([undoEdit, edit], { ue: one(doc, 'sha') }).find((each) => each.title === 'Edit status of 1')?.kind,
    ).toBe('updated');
  });

  it('leaves out an operation whose undo was undone too', () => {
    const many = op('m', 'Update many', { undone: 2000, size: 0 });
    const undoMany = op('um', 'Undo: Update many', { undoOf: operationId('m'), undone: 3000, size: 0, time: 2000 });
    expect(writes([undoMany, many], {}).filter((each) => each.title === 'Update many')).toEqual([]);
  });

  it('shows a deletion restored by an undo as Datardo’s, and the undo as Datardo’s too', () => {
    const deletion = op('d', 'Delete document 1', { undone: 2000, size: 0 });
    const undo = op('u', 'Undo: Delete document 1', { undoOf: operationId('d'), time: 2000 });
    expect(writes([undo, deletion], { u: one(null, 'sha') })).toEqual([
      { title: 'Undo: Delete document 1', time: 2000, kind: 'inserted' },
      { title: 'Delete document 1', time: 1000, kind: 'deleted' },
    ]);
  });

  it('does not count an operation on the same collection of another connection', () => {
    expect(writes([op('d', 'Delete', { connection: connectionId('c-other') })], { d: one(doc, null) })).toEqual([]);
  });

  it('does not count an operation one millisecond after the range', () => {
    expect(writes([op('d', 'Delete', { time: 1001 })], { d: one(doc, null) }, { from: 0, to: 1000 })).toEqual([]);
  });
});
