/**
 * Feature: undo.kept — after the write, an operation keeps only what the write really changed, and counts it as
 * inserted, updated or deleted.
 */
import type { DocumentRecord, Fingerprint, KeyFingerprint, KeyRecord, OperationRecords } from './types';

/** Two expiry times closer than this are the same: two reads of an untouched key are not a change (Datardo's choice). */
export const expiryToleranceMs = 1000;

/** A document read before and after the write, with the fingerprint of what it was before. */
export interface DocumentCandidate extends DocumentRecord {
  readonly beforeFingerprint: Fingerprint | null;
}

/** A key read before and after the write, with the fingerprint and expiry of what it was before. */
export interface KeyCandidate extends KeyRecord {
  readonly beforeFingerprint: KeyFingerprint | null;
}

/** The records of a write before they are kept. */
export type Candidates =
  | { readonly kind: 'documents'; readonly docs: readonly DocumentCandidate[] }
  | { readonly kind: 'keys'; readonly keys: readonly KeyCandidate[] };

/** What an operation keeps, and how many it inserted, updated and deleted (created, changed, deleted for keys). */
export interface Kept {
  readonly records: OperationRecords;
  readonly inserted: number;
  readonly updated: number;
  readonly deleted: number;
}

/** Whether two key fingerprints differ: their dumps, or their expiries by more than {@link expiryToleranceMs}. */
export function keysDiffer(one: KeyFingerprint | null, other: KeyFingerprint | null): boolean {
  if (one === null || other === null) {
    return one !== other;
  }
  if (one.sha1 !== other.sha1) {
    return true;
  }
  if (one.expiresAt === null || other.expiresAt === null) {
    return one.expiresAt !== other.expiresAt;
  }
  return Math.abs(one.expiresAt - other.expiresAt) > expiryToleranceMs;
}

function isDocumentKept(record: DocumentCandidate): boolean {
  return record.before === null ? record.after !== null : record.after !== record.beforeFingerprint;
}

function isKeyKept(record: KeyCandidate): boolean {
  return record.before === null ? record.after !== null : keysDiffer(record.beforeFingerprint, record.after);
}

function counts(records: readonly { readonly before: unknown; readonly after: unknown }[]): Omit<Kept, 'records'> {
  return {
    inserted: records.filter((each) => each.before === null).length,
    updated: records.filter((each) => each.before !== null && each.after !== null).length,
    deleted: records.filter((each) => each.before !== null && each.after === null).length,
  };
}

/** Feature: undo.kept. The records kept and their numbers; no record kept means no operation. */
export function keptRecords(records: Candidates): Kept {
  if (records.kind === 'documents') {
    const docs = records.docs
      .filter(isDocumentKept)
      .map(({ id, before, after }): DocumentRecord => ({ id, before, after }));
    return { records: { kind: 'documents', docs }, ...counts(docs) };
  }
  const keys = records.keys.filter(isKeyKept).map(({ key, before, after }): KeyRecord => ({ key, before, after }));
  return { records: { kind: 'keys', keys }, ...counts(keys) };
}

/** Whether nothing is kept: the write changed nothing, and no operation is recorded. */
export function isNothingKept(kept: Kept): boolean {
  return kept.records.kind === 'documents' ? kept.records.docs.length === 0 : kept.records.keys.length === 0;
}

/** The fingerprint of a key read at `readAt`: its dump's SHA-1, and when its expiry falls from its `PTTL`. */
export function keyFingerprintOf(sha1: Fingerprint, pttl: number, readAt: number): KeyFingerprint {
  return { sha1, expiresAt: pttl >= 0 ? readAt + pttl : null };
}
