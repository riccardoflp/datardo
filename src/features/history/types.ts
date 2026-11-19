/**
 * What the cards of the document history share: a write to one document found in the oplog, its kind and its key,
 * the versions rebuilt from the writes, and the mark of a value that is not known.
 *
 * Values are canonical Extended JSON (`{ $numberInt: "1" }`), so that every BSON type survives (R5.5). A value that is
 * not known (the oplog keeps the new values of an update, never the old ones) is the object {@link unknownValue}: its
 * one key holds a NUL character, which a BSON field name cannot hold, so it is never a value of a document.
 */
import type { Json } from '../../shared/engine-request';

/** A document, or a sub-document, as canonical Extended JSON. */
export type JsonObject = { readonly [key: string]: Json };

/** The key of the value that stands for an unknown value. */
export const unknownKey = '\u0000unknown';

/** A value that is not known: it may have been anything, or missing. */
export const unknownValue: Json = { [unknownKey]: true };

/** Whether a value is a JSON object (not a list, not null). */
export function isRecord(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value as an object; an empty one when it is not one. */
export function objectOf(value: Json | undefined): JsonObject {
  return isRecord(value) ? value : {};
}

/** Whether a value is the mark of an unknown value. */
export function isUnknown(value: Json | undefined): boolean {
  return isRecord(value) && value[unknownKey] === true;
}

/** Whether an object is a value of a BSON type written as Extended JSON (`{ $oid: "…" }`), not a sub-document. */
export function isTypedObject(value: JsonObject): boolean {
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => key.startsWith('$'));
}

/** A sub-document: an object that is neither a value of a BSON type nor an unknown value. */
export function isSubDocument(value: Json | undefined): value is JsonObject {
  return isRecord(value) && !isTypedObject(value) && !isUnknown(value);
}

/** A number, or a number of Extended JSON (`{ $numberInt: "3" }`); `undefined` for anything else. */
export function numberOf(value: Json | undefined): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  const object = objectOf(value);
  const inner = object['$numberInt'] ?? object['$numberLong'] ?? object['$numberDouble'];
  const number = typeof inner === 'string' ? Number(inner) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

/** A copy of a value, so that a version never shares an object with another. */
export function copied<T extends Json>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A field path, `a.b`, from the path before it and a field name or a position. */
export function joinedPath(path: string, key: string | number): string {
  return path === '' ? String(key) : `${path}.${String(key)}`;
}

/** What a write did to the document (`history.document-writes`, rule 5). */
export type WriteKind = 'insert' | 'update' | 'replace' | 'delete' | 'drop' | 'renamed';

/** What a command of the database did to the collection (`history.document-writes`, rule 3). */
export type CollectionCommand =
  | { readonly kind: 'collection-dropped' }
  | { readonly kind: 'database-dropped' }
  | { readonly kind: 'renamed-to'; readonly to: string }
  | { readonly kind: 'renamed-from'; readonly from: string };

/** One write to the document, from an oplog entry or from the `applyOps` of one. */
export interface DocumentWrite {
  /** The oplog timestamp of the entry: seconds, and the order within them. */
  readonly t: number;
  readonly i: number;
  /** Its position in the `applyOps` of the entry; -1 for an entry of its own. */
  readonly position: number;
  /** The wall clock time of the entry, in milliseconds since 1970, when the entry has one. */
  readonly wall?: number;
  readonly op: 'i' | 'u' | 'd' | 'c';
  readonly o: JsonObject;
  readonly o2?: JsonObject;
  /** In an `applyOps`: a transaction, or one command writing several documents. */
  readonly group?: 'transaction' | 'batch';
  /** A transaction of several oplog entries. */
  readonly partial?: boolean;
  /** A prepared transaction. */
  readonly prepared?: boolean;
  /** The session (`lsid.id`) and the transaction number, in mongosh syntax. */
  readonly session?: string;
  readonly transactionNumber?: string;
  /** Written by a chunk migration, not by a client. */
  readonly migration?: boolean;
  /** For a command: what happened to the collection. */
  readonly command?: CollectionCommand;
}

/** Whether an update's `o` holds update operators (`$set`, the `$v: 2` diff) rather than a whole document. */
export function hasOperators(o: JsonObject): boolean {
  return Object.keys(o).some((key) => key.startsWith('$'));
}

/** What a write did to the document. */
export function writeKind(write: DocumentWrite): WriteKind {
  switch (write.op) {
    case 'i':
      return 'insert';
    case 'd':
      return 'delete';
    case 'u':
      return hasOperators(write.o) ? 'update' : 'replace';
    case 'c':
      return write.command?.kind === 'renamed-from' ? 'renamed' : 'drop';
  }
}

/** The key of a write, `<t>:<i>:<position>`: the same each time the oplog is read. */
export function writeKey(write: Pick<DocumentWrite, 't' | 'i' | 'position'>): string {
  return `${String(write.t)}:${String(write.i)}:${String(write.position)}`;
}

/** The writes in the order they were made: by oplog timestamp, then by position in their `applyOps`. */
export function inOrder(writes: readonly DocumentWrite[]): readonly DocumentWrite[] {
  return [...writes].sort((a, b) => a.t - b.t || a.i - b.i || a.position - b.position);
}

/** The state of a version (`history.versions`). */
export type VersionState = 'exact' | 'partial' | 'absent' | 'unknown';

/** A document as far as it is known: a document (maybe with unknown values), no document, or nothing known. */
export type KnownDocument =
  | { readonly kind: 'document'; readonly document: JsonObject }
  | { readonly kind: 'absent' }
  | { readonly kind: 'unknown' };

/** One side of a row of a difference: a value, or the mark of an unknown one; absent when the field is missing. */
export type DiffSide = { readonly kind: 'value'; readonly value: Json } | { readonly kind: 'unknown' };

/** One row of the difference between two versions (`history.diff`). */
export interface DiffRow {
  /** The field path, `items.2.qty`, or `(document)` for the whole document. */
  readonly path: string;
  readonly before?: DiffSide;
  readonly after?: DiffSide;
  /** The type names of the two values, when they look the same and differ by type only: `int`, `double`. */
  readonly types?: readonly [string, string];
}

/** The document after a write as far as it is known, and how. */
export interface VersionDocument {
  readonly state: VersionState;
  /** For *exact* and *partial*: the document, with {@link unknownValue} where a value is not known. */
  readonly document?: JsonObject;
  /** For *partial*: the field paths of its unknown values (`status`, `items.1`, `(document)`). */
  readonly unknown?: readonly string[];
}

/** The fields an update set and unset and the arrays it resized (`history.update-changes`). */
export interface UpdateChanges {
  readonly set: readonly string[];
  readonly unset: readonly string[];
  /** As `items to 2`. */
  readonly truncated: readonly string[];
}

/** One version: the document after one write. */
export interface DocumentVersion extends VersionDocument {
  readonly write: DocumentWrite;
  readonly kind: WriteKind;
  readonly key: string;
  /** For an update: what it set, unset and resized. */
  readonly changes?: UpdateChanges;
  /** The difference from the version before. */
  readonly diff: readonly DiffRow[];
  /** Why it could not be rebuilt from the version before: an update that does not fit it. */
  readonly mismatch?: string;
}

/** The versions of a document, oldest first, and what is known of it before the oldest write. */
export interface DocumentHistory {
  readonly versions: readonly DocumentVersion[];
  readonly before: VersionDocument;
  /** Some writes rebuilt forwards do not lead to the document as it is now. */
  readonly conflict: boolean;
}
