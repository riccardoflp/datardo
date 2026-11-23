/**
 * `undo/index.json`, the list of the operations of the undo history, and `undo/<id>.json.gz`, one operation: the gzip
 * of canonical Extended JSON, `{ version, docs }` or `{ version, keys }` (data.md). Both at version 1.
 *
 * The shapes mirror those of `src/features/undo/types.ts`, which this folder may not import (R1.3); a unit test keeps
 * the two the same. A field Datardo does not know is kept and written back, on each operation and at the top of the
 * index. An operation this version cannot read is kept as it is and written back.
 *
 * An unreadable index deletes nothing (RS4): when the index was set aside as damaged, or is of a newer version, in
 * this run, {@link deleteOrphanFiles} deletes no operation file. An operation file is written once, before its entry
 * is added to the index, so that an entry never names a file that is not there yet.
 */
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import type { Json } from '../shared/engine-request';
import type { ConnectionId } from '../shared/ids';
import type { Found, JsonObject, StoredFile } from './store';
import { writeOnce } from './store';

const compress = promisify(gzip);
const decompress = promisify(gunzip);

/** The folder of the undo history in the data folder. */
export const undoFolder = 'undo';

/** The version of an operation file. */
export const operationFileVersion = 1;

/** What all operations of the index have, as stored. */
interface StoredEntryBase {
  readonly id: string;
  readonly time: number;
  readonly connection: ConnectionId;
  readonly connectionName: string;
  readonly title: string;
  readonly inserted: number;
  readonly updated: number;
  readonly deleted: number;
  readonly size: number;
  readonly undone?: number;
  readonly undoOf?: string;
}

/** An operation of the undo history, as stored: on a collection, or on a database of keys. */
export type StoredUndoEntry = StoredEntryBase &
  (
    | { readonly engine: 'mongodb'; readonly database: string; readonly collection: string }
    | { readonly engine: 'redis'; readonly database: number }
  );

/** What `undo/index.json` holds, newest operation first. */
export interface UndoIndex {
  readonly operations: readonly StoredUndoEntry[];
  /** The fields of each operation that this version does not know, by id. */
  readonly unknown: Readonly<Record<string, JsonObject>>;
  /** The operations this version cannot read, kept as they are. */
  readonly unreadable: readonly JsonObject[];
  /** The fields at the top of the file that this version does not know. */
  readonly rest: JsonObject;
}

/** No operation recorded. */
export const noOperations: UndoIndex = { operations: [], unknown: {}, unreadable: [], rest: {} };

const entryFields = new Set([
  'id',
  'time',
  'connection',
  'connectionName',
  'title',
  'inserted',
  'updated',
  'deleted',
  'size',
  'undone',
  'undoOf',
  'engine',
  'database',
  'collection',
]);

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(object: JsonObject, field: string): string | undefined {
  const value = object[field];
  return typeof value === 'string' ? value : undefined;
}

function number(object: JsonObject, field: string): number | undefined {
  const value = object[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`An operation of the undo history has no valid ${what}.`);
  }
  return value;
}

function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

function targetOf(object: JsonObject): Pick<StoredUndoEntry, 'engine' | 'database'> & { readonly collection?: string } {
  switch (text(object, 'engine')) {
    case 'mongodb':
      return {
        engine: 'mongodb',
        database: required(text(object, 'database'), 'database'),
        collection: required(text(object, 'collection'), 'collection'),
      };
    case 'redis':
      return { engine: 'redis', database: required(number(object, 'database'), 'database') };
    case undefined:
    default:
      throw new Error('An operation of the undo history has no known engine.');
  }
}

/** One operation of the index; throws when a field it needs is missing or wrong. */
export function entryOf(object: JsonObject): StoredUndoEntry {
  const base: StoredEntryBase = {
    id: required(text(object, 'id'), 'id'),
    time: required(number(object, 'time'), 'time'),
    connection: required(text(object, 'connection'), 'connection') as ConnectionId,
    connectionName: text(object, 'connectionName') ?? '',
    title: text(object, 'title') ?? '',
    inserted: number(object, 'inserted') ?? 0,
    updated: number(object, 'updated') ?? 0,
    deleted: number(object, 'deleted') ?? 0,
    size: number(object, 'size') ?? 0,
    ...optional('undone', number(object, 'undone')),
    ...optional('undoOf', text(object, 'undoOf')),
  };
  return { ...base, ...targetOf(object) } as StoredUndoEntry;
}

function readEntry(object: JsonObject): StoredUndoEntry | undefined {
  try {
    return entryOf(object);
  } catch {
    // An operation this version cannot read is kept in `unreadable` and written back: no other is lost (RS4).
    return undefined;
  }
}

function unknownOf(object: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(object).filter(([field]) => !entryFields.has(field)));
}

function readIndex(object: JsonObject): UndoIndex {
  const list = object['operations'] ?? [];
  if (!Array.isArray(list)) {
    throw new Error('operations is not a list.');
  }
  const read = (list as readonly Json[]).filter(isObject).map((each) => ({ object: each, entry: readEntry(each) }));
  return {
    operations: read.flatMap((each) => (each.entry === undefined ? [] : [each.entry])),
    unknown: Object.fromEntries(
      read.flatMap((each) => (each.entry === undefined ? [] : [[each.entry.id, unknownOf(each.object)]])),
    ),
    unreadable: read.flatMap((each) => (each.entry === undefined ? [each.object] : [])),
    rest: Object.fromEntries(Object.entries(object).filter(([field]) => field !== 'operations' && field !== 'version')),
  };
}

/** The kind of file `undo/index.json` is. */
export const undoIndexFile: StoredFile<UndoIndex> = {
  path: `${undoFolder}/index.json`,
  holds: 'The undo history',
  version: 1,
  migrations: {},
  empty: () => noOperations,
  read: readIndex,
  write: (value) => ({
    ...value.rest,
    operations: [
      ...value.operations.map((entry) => ({ ...(value.unknown[entry.id] ?? {}), ...(entry as unknown as JsonObject) })),
      ...value.unreadable,
    ],
  }),
};

/** The index with the operations changed, keeping what this version does not know of those that stay. */
export function withOperations(index: UndoIndex, operations: readonly StoredUndoEntry[]): UndoIndex {
  const ids = new Set(operations.map((each) => each.id));
  return {
    ...index,
    operations,
    unknown: Object.fromEntries(Object.entries(index.unknown).filter(([id]) => ids.has(id))),
  };
}

const safeId = /^[A-Za-z0-9_-]+$/u;

/** The name of an operation's file, `<id>.json.gz`; throws for an id that is not a file name. */
export function operationFileName(id: string): string {
  if (!safeId.test(id) || id === 'index') {
    throw new Error(`The operation id ${id} cannot name a file.`);
  }
  return `${id}.json.gz`;
}

function operationPath(folder: string, id: string): string {
  return join(folder, undoFolder, operationFileName(id));
}

/**
 * Writes an operation's file once: `content` is `{ docs }` or `{ keys }` as canonical Extended JSON, written with its
 * `version` first and compressed. Gives the size of the compressed file, which the index keeps.
 */
export async function writeOperationFile(folder: string, id: string, content: JsonObject): Promise<number> {
  const records = Object.fromEntries(Object.entries(content).filter(([field]) => field !== 'version'));
  const json = JSON.stringify({ version: operationFileVersion, ...records });
  const bytes = await compress(Buffer.from(json, 'utf8'));
  await writeOnce(folder, `${undoFolder}/${operationFileName(id)}`, bytes);
  return bytes.byteLength;
}

/** What reading an operation's file found: its content without `version`, or why there is none. */
export type OperationFile =
  | { readonly kind: 'read'; readonly content: JsonObject }
  | { readonly kind: 'missing' }
  | { readonly kind: 'newer'; readonly version: number }
  | { readonly kind: 'damaged' };

function isMissing(error: unknown): boolean {
  // A file in place of one of its folders says ENOTDIR on Linux and macOS, ENOENT on Windows: either way it is not there.
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function contentOf(json: string): OperationFile {
  const value: unknown = JSON.parse(json);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { kind: 'damaged' };
  }
  const { version, ...content } = value as JsonObject;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { kind: 'damaged' };
  }
  return version > operationFileVersion ? { kind: 'newer', version } : { kind: 'read', content };
}

/** Reads an operation's file. A file that is missing or damaged is that operation alone: it can't be undone. */
export async function readOperationFile(folder: string, id: string): Promise<OperationFile> {
  let bytes: Buffer;
  try {
    bytes = await readFile(operationPath(folder, id));
  } catch (error: unknown) {
    if (isMissing(error)) {
      return { kind: 'missing' };
    }
    throw error;
  }
  try {
    return contentOf((await decompress(bytes)).toString('utf8'));
  } catch {
    return { kind: 'damaged' };
  }
}

/** Deletes the files of operations removed from the index (`undo.remove`, `undo.clear`, the limits, an undo). */
export async function deleteOperationFiles(folder: string, ids: readonly string[]): Promise<void> {
  await Promise.all(ids.map((id) => rm(operationPath(folder, id), { force: true })));
}

/** A file of the folder of the undo history: its name and when it was last written. */
export interface UndoFolderFile {
  readonly name: string;
  readonly time: number;
}

/** The operation files of the folder, `*.json.gz`, with when each was last written; none when there is no folder. */
export async function listOperationFiles(folder: string): Promise<readonly UndoFolderFile[]> {
  const path = join(folder, undoFolder);
  let names: readonly string[];
  try {
    names = await readdir(path);
  } catch (error: unknown) {
    if (isMissing(error)) {
      return [];
    }
    throw error;
  }
  const files = await Promise.all(
    names
      .filter((name) => name.endsWith('.json.gz'))
      .map(async (name) => ({ name, time: (await stat(join(path, name))).mtimeMs })),
  );
  return files;
}

/** Whether an index was set aside as damaged in an earlier run and is still in the folder. */
export async function hasDamagedIndex(folder: string): Promise<boolean> {
  try {
    return (await readdir(join(folder, undoFolder))).some((name) => name.startsWith('index.damaged-'));
  } catch (error: unknown) {
    if (isMissing(error)) {
      return false;
    }
    throw error;
  }
}

/** Whether files with no entry may be deleted: never when the index could not be read in this run (RS4). */
export function mayDeleteOrphans(found: Found): boolean {
  return found.kind !== 'damaged' && found.kind !== 'newer';
}

/**
 * Deletes operation files that belong to no operation, by name, as `undo.limits` lists them. Refused, deleting
 * nothing, when the index was found damaged or newer in this run; a name that is not an operation file is skipped.
 */
export async function deleteOrphanFiles(folder: string, names: readonly string[], found: Found): Promise<number> {
  if (!mayDeleteOrphans(found)) {
    return 0;
  }
  const ids = names
    .filter((name) => name.endsWith('.json.gz'))
    .map((name) => name.slice(0, -'.json.gz'.length))
    .filter((id) => safeId.test(id) && id !== 'index');
  await deleteOperationFiles(folder, ids);
  return ids.length;
}
