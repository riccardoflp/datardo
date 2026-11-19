import { describe, expect, it } from 'vitest';
import type { DocumentCandidate, KeyCandidate } from '../../../src/features/undo/kept';
import { isNothingKept, keptRecords, keyFingerprintOf } from '../../../src/features/undo/kept';
import { fingerprint, type KeyImage, type KeyName } from '../../../src/features/undo/types';

const a = fingerprint('sha-a');
const b = fingerprint('sha-b');
const key = 'b3JkZXJzOjQy' as KeyName;
const image: KeyImage = { dump: 'AAEC', pttl: -1, type: 'string' };
const readAt = 1_000_000;

function doc(before: unknown, beforeFingerprint: string | null, after: string | null): DocumentCandidate {
  return {
    id: 1,
    before: before as DocumentCandidate['before'],
    beforeFingerprint: beforeFingerprint === null ? null : fingerprint(beforeFingerprint),
    after: after === null ? null : fingerprint(after),
  };
}

function keyOf(
  before: KeyImage | null,
  was: KeyCandidate['beforeFingerprint'],
  after: KeyCandidate['after'],
): KeyCandidate {
  return { key, before, beforeFingerprint: was, after };
}

function documentsKept(docs: readonly DocumentCandidate[]): ReturnType<typeof keptRecords> {
  return keptRecords({ kind: 'documents', docs });
}

function keysKept(keys: readonly KeyCandidate[]): ReturnType<typeof keptRecords> {
  return keptRecords({ kind: 'keys', keys });
}

describe('undo.kept', () => {
  it('keeps a document updated, and not one already as the write left it', () => {
    expect(documentsKept([doc({ status: 'a' }, 'sha-a', 'sha-b')])).toMatchObject({ updated: 1 });
    expect(isNothingKept(documentsKept([doc({ status: 'a' }, 'sha-a', 'sha-a')]))).toBe(true);
  });

  it('keeps neither an insert deleted before the read after, and keeps a deletion', () => {
    expect(isNothingKept(documentsKept([doc(null, null, null)]))).toBe(true);
    expect(documentsKept([doc({ _id: 1 }, 'sha-a', null)])).toMatchObject({ deleted: 1, inserted: 0, updated: 0 });
  });

  it('records 3 updated for an Update many that matches 5 and modifies 3', () => {
    const docs = [
      doc({ n: 1 }, 'sha-1', 'sha-1b'),
      doc({ n: 2 }, 'sha-2', 'sha-2b'),
      doc({ n: 3 }, 'sha-3', 'sha-3b'),
      doc({ n: 4 }, 'sha-4', 'sha-4'),
      doc({ n: 5 }, 'sha-5', 'sha-5'),
    ];
    const kept = documentsKept(docs);
    expect(kept).toMatchObject({ inserted: 0, updated: 3, deleted: 0 });
    expect(kept.records.kind === 'documents' ? kept.records.docs : []).toHaveLength(3);
  });

  it('records nothing for an update that changes nothing', () => {
    expect(isNothingKept(documentsKept([doc({ n: 1 }, 'sha-1', 'sha-1')]))).toBe(true);
  });

  it('counts a reordered replacement and an Int32 that became a Double as changes: their BSON bytes differ', () => {
    // { a: 1, b: 2 } and { b: 2, a: 1 }, or Int32 1 and Double 1, have different BSON bytes, so different SHA-1s.
    expect(documentsKept([doc({ a: 1, b: 2 }, 'sha-ab', 'sha-ba')])).toMatchObject({ updated: 1 });
  });

  it('keeps keys changed, created and deleted, and not one with the same dump and expiry', () => {
    const persistent = { sha1: a, expiresAt: null };
    expect(keysKept([keyOf(image, persistent, { sha1: b, expiresAt: null })])).toMatchObject({ updated: 1 });
    expect(isNothingKept(keysKept([keyOf(image, persistent, persistent)]))).toBe(true);
    expect(keysKept([keyOf(image, persistent, null)])).toMatchObject({ deleted: 1 });
    expect(keysKept([keyOf(null, null, persistent)])).toMatchObject({ inserted: 1 });
  });

  it('keeps a key whose expiry is gone, or appeared, with the same dump', () => {
    const expiring = keyFingerprintOf(a, 60_000, readAt);
    expect(keysKept([keyOf(image, expiring, { sha1: a, expiresAt: null })])).toMatchObject({ updated: 1 });
    expect(keysKept([keyOf(image, { sha1: a, expiresAt: null }, expiring)])).toMatchObject({ updated: 1 });
  });

  it('records 1 changed for EXPIRE on a persistent key and nothing for PERSIST on one already persistent', () => {
    const persistent = keyFingerprintOf(a, -1, readAt);
    expect(keysKept([keyOf(image, persistent, keyFingerprintOf(a, 60_000, readAt + 5))]).updated).toBe(1);
    expect(isNothingKept(keysKept([keyOf(image, persistent, keyFingerprintOf(a, -1, readAt + 5))]))).toBe(true);
  });

  it('does not count two reads of an untouched key with 60 seconds left, 300 ms apart, as a change', () => {
    const first = keyFingerprintOf(a, 60_000, readAt);
    const second = keyFingerprintOf(a, 59_700, readAt + 300);
    expect(isNothingKept(keysKept([keyOf(image, first, second)]))).toBe(true);
  });
});
