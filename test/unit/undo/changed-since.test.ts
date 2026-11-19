import { describe, expect, it } from 'vitest';
import type { Json } from '../../../src/shared/engine-request';
import { changedSince, undoButton, type Current } from '../../../src/features/undo/changed-since';
import { keyFingerprintOf } from '../../../src/features/undo/kept';
import { fingerprint, type KeyImage, type KeyName, type OperationRecords } from '../../../src/features/undo/types';

const key = 'b3JkZXJzOjQy' as KeyName;
const image: KeyImage = { dump: 'AAEC', pttl: -1, type: 'string' };
const recordedAt = 1_800_000_000_000;

function documents(after: string | null, before: Json | null = { _id: 1, status: 'a' }): OperationRecords {
  return { kind: 'documents', docs: [{ id: 1, before, after: after === null ? null : fingerprint(after) }] };
}

function now(found: string | undefined): Current {
  return {
    kind: 'documents',
    docs: found === undefined ? [] : [{ id: 1, document: { _id: 1 }, fingerprint: fingerprint(found) }],
  };
}

function keyRecords(
  after: ReturnType<typeof keyFingerprintOf> | null,
  before: KeyImage | null = image,
): OperationRecords {
  return { kind: 'keys', keys: [{ key, before, after }] };
}

function keysNow(found: ReturnType<typeof keyFingerprintOf> | undefined): Current {
  return { kind: 'keys', keys: found === undefined ? [] : [{ key, image, fingerprint: found }] };
}

describe('undo.changed-since', () => {
  it.each<[string, OperationRecords, Current, boolean]>([
    ['updated, nothing since', documents('sha-b'), now('sha-b'), false],
    ['updated, someone set status: "c"', documents('sha-b'), now('sha-c'), true],
    ['updated, then replaced with the same fields in another order', documents('sha-b'), now('sha-b-reordered'), true],
    ['inserted, then someone deleted it', documents('sha-new', null), now(undefined), true],
    ['deleted, nothing since', documents(null), now(undefined), false],
    ['deleted, then someone inserted the same _id', documents(null), now('sha-other'), true],
    [
      'SET orders:42 "b", nothing since',
      keyRecords(keyFingerprintOf(fingerprint('b'), -1, recordedAt)),
      keysNow(keyFingerprintOf(fingerprint('b'), -1, recordedAt + 9000)),
      false,
    ],
    [
      'SET orders:42 "b", then APPEND',
      keyRecords(keyFingerprintOf(fingerprint('b'), -1, recordedAt)),
      keysNow(keyFingerprintOf(fingerprint('bc'), -1, recordedAt)),
      true,
    ],
    [
      'SET orders:42 "b" EX 60, 61 seconds passed',
      keyRecords(keyFingerprintOf(fingerprint('b'), 60_000, recordedAt)),
      keysNow(undefined),
      true,
    ],
    [
      'SET orders:42 "b" EX 60, 20 seconds passed',
      keyRecords(keyFingerprintOf(fingerprint('b'), 60_000, recordedAt)),
      keysNow(keyFingerprintOf(fingerprint('b'), 40_000, recordedAt + 20_000)),
      false,
    ],
    [
      'DEL orders:42, then SET orders:42 "z"',
      keyRecords(null),
      keysNow(keyFingerprintOf(fingerprint('z'), -1, recordedAt)),
      true,
    ],
  ])('%s', (_name, records, current, changed) => {
    expect(changedSince(records, current).changed.length > 0).toBe(changed);
  });

  it('asks Undo all or Undo unchanged only for an Update many of 3 of which 1 changed since', () => {
    const records: OperationRecords = {
      kind: 'documents',
      docs: [1, 2, 3].map((id) => ({ id, before: { _id: id }, after: fingerprint(`sha-${String(id)}`) })),
    };
    const current: Current = {
      kind: 'documents',
      docs: [1, 2, 3].map((id) => ({
        id,
        document: { _id: id },
        fingerprint: fingerprint(id === 2 ? 'sha-x' : `sha-${String(id)}`),
      })),
    };
    const found = changedSince(records, current);
    expect(found.question).toBe('all-or-unchanged');
    expect(found.line).toBe('1 of them changed after the operation: undoing overwrites those changes too.');
  });

  it('confirms with Undo anyway the undo of a deletion of a document someone inserted again', () => {
    const found = changedSince(documents(null), now('sha-other'));
    expect(found.question).toBe('none');
    expect(found.line).toBe('The document changed after the operation: undoing overwrites those changes too.');
    expect(undoButton(found, undefined)).toBe('Undo anyway');
  });

  it('confirms with Undo anyway the undo of DEL orders:42 after someone set the key again', () => {
    const found = changedSince(keyRecords(null), keysNow(keyFingerprintOf(fingerprint('z'), -1, recordedAt)));
    expect(found.line).toBe('The key changed after the operation: undoing overwrites those changes too.');
    expect(undoButton(found, undefined)).toBe('Undo anyway');
  });
});
