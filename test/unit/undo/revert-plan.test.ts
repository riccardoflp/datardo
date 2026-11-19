import { describe, expect, it } from 'vitest';
import type { EngineStep } from '../../../src/shared/feature';
import type { Current } from '../../../src/features/undo/changed-since';
import { changedSince } from '../../../src/features/undo/changed-since';
import { keptRecords } from '../../../src/features/undo/kept';
import { revertSteps, undoTitle } from '../../../src/features/undo/revert-plan';
import {
  base64Bytes,
  fingerprint,
  type KeyImage,
  type KeyName,
  type OperationRecords,
  type OperationTarget,
} from '../../../src/features/undo/types';
import { cacheConnection, localConnection } from './harness';

const orders: OperationTarget = {
  kind: 'collection',
  connection: localConnection.id,
  database: 'shop',
  collection: 'orders',
};
const db0: OperationTarget = { kind: 'redis-database', connection: cacheConnection.id, database: 0 };
const session = 'c2Vzc2lvbjo5' as KeyName;
const order = 'b3JkZXJzOjQy' as KeyName;
const dumpOf = (text: string): string => btoa(text);
const image = (text: string, pttl: number): KeyImage => ({ dump: dumpOf(text), pttl, type: 'string' });

function revert(target: OperationTarget, records: OperationRecords, current: Current): ReturnType<typeof revertSteps> {
  return revertSteps({ target, records, current }, changedSince(records, current), undefined, 'Edit');
}

function bulk(step: EngineStep | undefined): unknown {
  return step?.request.engine === 'mongodb' ? step.request.arguments[0] : undefined;
}

function words(step: EngineStep | undefined): readonly string[] {
  const decoder = new TextDecoder();
  return step?.request.engine === 'redis' ? step.request.command.map((word) => decoder.decode(word)) : [];
}

describe('undo.revert-plan', () => {
  it('deletes an inserted document, and keeps it as it is now', () => {
    const result = revert(
      orders,
      { kind: 'documents', docs: [{ id: 1, before: null, after: fingerprint('a') }] },
      { kind: 'documents', docs: [{ id: 1, document: { _id: 1, a: 1 }, fingerprint: fingerprint('a') }] },
    );
    expect(bulk(result.steps[0])).toEqual([{ deleteOne: { filter: { _id: 1 } } }]);
    expect(result.keeps).toEqual({
      kind: 'documents',
      docs: [{ id: 1, before: { _id: 1, a: 1 }, beforeFingerprint: 'a', size: expect.any(Number) as number }],
    });
  });

  it('replaces an updated document with what it was, upserting', () => {
    const result = revert(
      orders,
      { kind: 'documents', docs: [{ id: 2, before: { _id: 2, a: 1 }, after: fingerprint('b') }] },
      { kind: 'documents', docs: [{ id: 2, document: { _id: 2, a: 2 }, fingerprint: fingerprint('c') }] },
    );
    expect(bulk(result.steps[0])).toEqual([
      { replaceOne: { filter: { _id: 2 }, replacement: { _id: 2, a: 1 }, upsert: true } },
    ]);
    expect(result.keeps).toMatchObject({ docs: [{ id: 2, before: { _id: 2, a: 2 } }] });
  });

  it('inserts a deleted document again, keeping its _id only', () => {
    const result = revert(
      orders,
      { kind: 'documents', docs: [{ id: 3, before: { _id: 3, a: 1 }, after: null }] },
      { kind: 'documents', docs: [] },
    );
    expect(bulk(result.steps[0])).toEqual([
      { replaceOne: { filter: { _id: 3 }, replacement: { _id: 3, a: 1 }, upsert: true } },
    ]);
    expect(result.keeps).toMatchObject({ docs: [{ id: 3, before: null, beforeFingerprint: null }] });
  });

  it('deletes a created key, keeping its dump', () => {
    const now = { key: session, image: image('x', -1), fingerprint: { sha1: fingerprint('x'), expiresAt: null } };
    const result = revert(
      db0,
      { kind: 'keys', keys: [{ key: session, before: null, after: now.fingerprint }] },
      { kind: 'keys', keys: [now] },
    );
    expect(words(result.steps[0])).toEqual(['DEL', 'session:9']);
    expect(result.keeps).toMatchObject({ keys: [{ key: session, before: image('x', -1) }] });
  });

  it('restores a changed persistent key with a ttl of 0, and a deleted one with its PTTL', () => {
    const now = { key: order, image: image('other', -1), fingerprint: { sha1: fingerprint('o'), expiresAt: null } };
    const changed = revert(
      db0,
      { kind: 'keys', keys: [{ key: order, before: image('a', -1), after: now.fingerprint }] },
      { kind: 'keys', keys: [now] },
    );
    expect(words(changed.steps[0])).toEqual(['RESTORE', 'orders:42', '0', 'a', 'REPLACE']);
    const deleted = revert(
      db0,
      { kind: 'keys', keys: [{ key: order, before: image('h', 90_000), after: null }] },
      { kind: 'keys', keys: [] },
    );
    expect(words(deleted.steps[0]).slice(0, 3)).toEqual(['RESTORE', 'orders:42', '90000']);
    expect(deleted.steps[0]?.text).toBe(
      `RESTORE orders:42 90000 <dump, ${String(base64Bytes(dumpOf('h')))} B> REPLACE`,
    );
    expect(deleted.keeps).toEqual({ kind: 'keys', keys: [{ key: order, before: null, beforeFingerprint: null }] });
  });

  it('leaves, undoing the undo, the documents as the operation had left them', () => {
    const operation: OperationRecords = {
      kind: 'documents',
      docs: [{ id: 2, before: { _id: 2, a: 1 }, after: fingerprint('a2') }],
    };
    const now: Current = {
      kind: 'documents',
      docs: [{ id: 2, document: { _id: 2, a: 2 }, fingerprint: fingerprint('a2') }],
    };
    const undo = revert(orders, operation, now);
    // The undo's own record, once kept, replaces the document with { _id: 2, a: 2 }: what the operation left.
    const keeps = undo.keeps;
    if (keeps.kind !== 'documents') {
      throw new Error('The undo keeps documents.');
    }
    const kept = keptRecords({
      kind: 'documents',
      docs: keeps.docs.map((each) => ({ ...each, after: fingerprint('a1') })),
    });
    const redo = revert(orders, kept.records, {
      kind: 'documents',
      docs: [{ id: 2, document: { _id: 2, a: 1 }, fingerprint: fingerprint('a1') }],
    });
    expect(bulk(redo.steps[0])).toEqual([
      { replaceOne: { filter: { _id: 2 }, replacement: { _id: 2, a: 2 }, upsert: true } },
    ]);
  });

  it('titles the undo of X Undo: X, of Undo: X Redo: X, and of Redo: X Undo: X, never Undo: Undo: X', () => {
    expect(undoTitle('X')).toBe('Undo: X');
    expect(undoTitle('Undo: X')).toBe('Redo: X');
    expect(undoTitle('Redo: X')).toBe('Undo: X');
    expect(undoTitle(undoTitle('X'))).not.toBe('Undo: Undo: X');
  });

  it('sends the documents in bulkWrite batches of 1,000, unordered', () => {
    const docs = Array.from({ length: 2500 }, (_, index) => ({
      id: index,
      before: null,
      after: fingerprint(String(index)),
    }));
    const result = revert(orders, { kind: 'documents', docs }, { kind: 'documents', docs: [] });
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0]?.request).toMatchObject({
      method: 'bulkWrite',
      arguments: [expect.any(Array), { ordered: false }],
    });
  });
});
