/**
 * What the cards of the undo history share: an operation as `undo/index.json` lists it, the records of its file, what
 * a plan's `undo: { keeps }` names, the fingerprints the main process computes, and the `datardo.undo` settings.
 *
 * Fingerprints are SHA-1 digests of a document's BSON bytes or of a key's dump. The features cannot compute them (no
 * BSON serializer and no hash here, R1.5): the main process does, and gives them with what it read. The stored shapes
 * are mirrored by `src/storage/undo.ts`, which may not import this folder (R1.3).
 */
import type { ConnectionView } from '../../shared/connection';
import type { EngineName, Json } from '../../shared/engine-request';
import type { AppStep, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import type { SettingsState } from '../../shared/state/settings';
import type { Target } from '../../shared/target';
import { setting } from '../settings/read';

/** The identifier of an operation of the undo history, which also names its file. */
export type OperationId = string & { readonly __brand: 'OperationId' };

/** An operation's identifier, from the text stored for it. */
export function operationId(identifier: string): OperationId {
  return identifier as OperationId;
}

/** The SHA-1 of a document's BSON bytes, or of a key's dump, in base64, as the main process computes it. */
export type Fingerprint = string & { readonly __brand: 'Fingerprint' };

/** A fingerprint, from the text the main process computed. */
export function fingerprint(text: string): Fingerprint {
  return text as Fingerprint;
}

/** A key's name: its bytes in base64, so that a name that is not text survives (R5.5). */
export type KeyName = string & { readonly __brand: 'KeyName' };

/** What is kept of a key before a write: its dump in base64, its `PTTL` (-1: no expiry) and its `TYPE`. */
export interface KeyImage {
  readonly dump: string;
  readonly pttl: number;
  readonly type: string;
}

/** What is kept of a key after a write: the SHA-1 of its dump, and when its expiry falls (none: no expiry). */
export interface KeyFingerprint {
  readonly sha1: Fingerprint;
  readonly expiresAt: number | null;
}

/** A document of an operation: as it was before (`null`: the write inserted it), and its fingerprint after. */
export interface DocumentRecord {
  readonly id: Json;
  readonly before: Json | null;
  /** `null` when the document no longer exists after the write. */
  readonly after: Fingerprint | null;
}

/** A key of an operation: as it was before (`null`: the write created it), and its fingerprint after. */
export interface KeyRecord {
  readonly key: KeyName;
  readonly before: KeyImage | null;
  readonly after: KeyFingerprint | null;
}

/** The records of an operation's file: documents, or keys. */
export type OperationRecords =
  | { readonly kind: 'documents'; readonly docs: readonly DocumentRecord[] }
  | { readonly kind: 'keys'; readonly keys: readonly KeyRecord[] };

/** What all operations of the index have. */
interface EntryBase {
  readonly id: OperationId;
  /** When it was recorded, in milliseconds since 1970. */
  readonly time: number;
  readonly connection: ConnectionId;
  /** The connection's name when it was recorded, shown when the connection is gone. */
  readonly connectionName: string;
  /** The plan's title, cut to 300 characters. */
  readonly title: string;
  readonly inserted: number;
  readonly updated: number;
  readonly deleted: number;
  /** The bytes of its compressed file; 0 once undone. */
  readonly size: number;
  /** When it was undone. */
  readonly undone?: number;
  /** The operation this one undid. */
  readonly undoOf?: OperationId;
}

/** An operation of the undo history (glossary, "operation"), on a collection or on a database of keys. */
export type UndoEntry = EntryBase &
  (
    | { readonly engine: 'mongodb'; readonly database: string; readonly collection: string }
    | { readonly engine: 'redis'; readonly database: number }
  );

/** What an operation is on (glossary, "target (of an operation)"). */
export type OperationTarget = Extract<Target, { readonly kind: 'collection' } | { readonly kind: 'redis-database' }>;

/** The target of an operation. */
export function entryTarget(entry: UndoEntry): OperationTarget {
  return entry.engine === 'mongodb'
    ? { kind: 'collection', connection: entry.connection, database: entry.database, collection: entry.collection }
    : { kind: 'redis-database', connection: entry.connection, database: entry.database };
}

/** The target without the connection: `shop.orders`, `db0`. */
export function placeText(entry: UndoEntry): string {
  return entry.engine === 'mongodb' ? `${entry.database}.${entry.collection}` : `db${String(entry.database)}`;
}

/** The target with the connection: `Local › shop.orders`, `Cache local › db0`. */
export function whereText(connectionName: string, entry: UndoEntry): string {
  return `${connectionName} › ${placeText(entry)}`;
}

/**
 * What a plan's `undo: { keeps }` names, as a plan writes it with {@link keepsJson}: the documents matching a filter
 * (with the filter as the user wrote it when the one sent is narrower), the documents with given `_id`s, the `_id`s the
 * steps insert, the keys with given names, or images already read (an undo keeps what it read).
 */
export type Keeps =
  | {
      readonly kind: 'filter';
      readonly database: string;
      readonly collection: string;
      readonly filter: Json;
      readonly written?: Json;
    }
  | { readonly kind: 'ids'; readonly database: string; readonly collection: string; readonly ids: readonly Json[] }
  | {
      readonly kind: 'inserted';
      readonly database: string;
      readonly collection: string;
      readonly ids: readonly Json[];
    }
  | { readonly kind: 'keys'; readonly database: number; readonly keys: readonly KeyName[] }
  | { readonly kind: 'images'; readonly images: Json };

/** The `keeps` of a plan's `undo`, as JSON. */
export function keepsJson(keeps: Keeps): Json {
  return keeps;
}

type Fields = Readonly<Record<string, unknown>>;

/** A value as an object, or an empty one. */
export function fieldsOf(value: unknown): Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : {};
}

/** Whether a value is an object that is not a list. */
export function isObject(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array);
}

function text(fields: Fields, name: string): string | undefined {
  const value = fields[name];
  return typeof value === 'string' ? value : undefined;
}

function list(fields: Fields, name: string): readonly Json[] {
  const value = fields[name];
  return Array.isArray(value) ? (value as readonly Json[]) : [];
}

/** The `keeps` a plan wrote; none when it is not one. */
export function keepsOf(value: unknown): Keeps | undefined {
  const fields = fieldsOf(value);
  const database = text(fields, 'database');
  const collection = text(fields, 'collection');
  const kind = fields['kind'];
  switch (kind) {
    case 'filter':
      return database === undefined || collection === undefined
        ? undefined
        : {
            kind: 'filter',
            database,
            collection,
            filter: (fields['filter'] ?? {}) as Json,
            ...(fields['written'] === undefined ? {} : { written: fields['written'] as Json }),
          };
    case 'ids':
    case 'inserted':
      return database === undefined || collection === undefined
        ? undefined
        : { kind, database, collection, ids: list(fields, 'ids') };
    case 'keys':
      return typeof fields['database'] === 'number'
        ? { kind: 'keys', database: fields['database'], keys: list(fields, 'keys').filter(isText) as KeyName[] }
        : undefined;
    case 'images':
      return { kind: 'images', images: (fields['images'] ?? null) as Json };
    default:
      return undefined;
  }
}

function isText(value: Json): value is string {
  return typeof value === 'string';
}

/** The `datardo.undo` settings, as the cards of this area read them. */
export interface UndoSettings {
  readonly enabled: boolean;
  readonly maxDocumentsPerOperation: number;
  readonly maxOperationBytes: number;
  /** `datardo.undo.maxSizeMb`, in bytes. */
  readonly maxBytes: number;
  readonly maxDays: number;
  readonly maxEntries: number;
}

/** One megabyte, as the settings count it. */
export const megabyte = 1024 * 1024;

/** A limit of `undo.limits`: a value that is not a number of 0 or more takes the default. */
function limitValue(settings: SettingsState, name: string, fallback: number): number {
  const value = settings.stored[name];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** The `datardo.undo` settings now. */
export function undoSettings(settings: SettingsState): UndoSettings {
  return {
    enabled: setting(settings, 'datardo.undo.enabled'),
    maxDocumentsPerOperation: setting(settings, 'datardo.undo.maxDocumentsPerOperation'),
    maxOperationBytes: setting(settings, 'datardo.undo.maxOperationSizeMb') * megabyte,
    maxBytes: limitValue(settings, 'datardo.undo.maxSizeMb', 100) * megabyte,
    maxDays: limitValue(settings, 'datardo.undo.maxDays', 7),
    maxEntries: limitValue(settings, 'datardo.undo.maxOperations', 200),
  };
}

/** Why writes through a connection are not recorded: the history is off, or off for it (or it is read-only). */
export type NotRecording = 'off' | 'off-for-connection';

/** Why writes through the connection are not recorded now; none when they are. */
export function whyNotRecording(connection: ConnectionView, settings: UndoSettings): NotRecording | undefined {
  if (!settings.enabled) {
    return 'off';
  }
  return connection.keepsUndo && !connection.readOnly ? undefined : 'off-for-connection';
}

/** The engine's word for what an operation keeps: documents, or keys. */
export function unitOf(engine: EngineName): 'document' | 'key' {
  return engine === 'mongodb' ? 'document' : 'key';
}

/** An app step: the action the main process carries out, its arguments, and its text as the Log writes it. */
export function appStep(action: string, args: Json, text: string): AppStep {
  return { kind: 'app', action, args, text };
}

/** A plan with nothing to do, which is not recorded. */
export function nothingToDo(title: string, cannot: string): Outcome {
  return run({ title, steps: [], danger: noDanger, undo: { cannot }, publishes: false, after: [] });
}

/** The arguments a feature was started with (`Intent.args`), as an object; empty when there are none. */
export function argumentsOf(answers: Readonly<Record<string, unknown>>): Fields {
  return fieldsOf(answers['args']);
}

/** The text that names a value whatever its type, written the same each time: to compare `_id`s with their type. */
export function sameValueKey(value: unknown): string {
  return JSON.stringify(value);
}

/** A key's name from its bytes. */
export function keyNameOf(bytes: Uint8Array): KeyName {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary) as KeyName;
}

/** The bytes of a key's name, or of a dump. */
export function bytesOfBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

/** How many bytes a text in base64 holds. */
export function base64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, (base64.length / 4) * 3 - padding);
}

const strictText = new TextDecoder('utf-8', { fatal: true });

/** A key's name as shown: its text, or `\xNN` for each byte when it is not UTF-8. */
export function keyNameText(name: KeyName): string {
  const bytes = bytesOfBase64(name);
  try {
    return strictText.decode(bytes);
  } catch {
    // Not UTF-8: each byte is shown, so that the name is still told apart from the others.
    return Array.from(bytes, (byte) => `\\x${byte.toString(16).padStart(2, '0')}`).join('');
  }
}
