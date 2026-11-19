import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UndoEntry } from '../../../src/features/undo/types';
import { Store } from '../../../src/storage/store';
import {
  deleteOperationFiles,
  deleteOrphanFiles,
  hasDamagedIndex,
  listOperationFiles,
  operationFileName,
  readOperationFile,
  undoIndexFile,
  withOperations,
  writeOperationFile,
  type StoredUndoEntry,
} from '../../../src/storage/undo';
import { connectionId } from '../../../src/shared/ids';

const orders: StoredUndoEntry = {
  id: 'mh2k1',
  time: 1_762_900_000_000,
  connection: connectionId('c-local'),
  connectionName: 'Local',
  title: 'Delete 3 documents from shop.orders',
  inserted: 0,
  updated: 0,
  deleted: 3,
  size: 812,
  engine: 'mongodb',
  database: 'shop',
  collection: 'orders',
};

const keys: StoredUndoEntry = {
  id: 'mh2k2',
  time: 1_762_900_100_000,
  connection: connectionId('c-cache'),
  connectionName: 'Cache local',
  title: 'Delete the key session:1',
  inserted: 0,
  updated: 0,
  deleted: 1,
  size: 0,
  undone: 1_762_900_200_000,
  engine: 'redis',
  database: 0,
};

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-undo-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function stored(name: string, content: string | Uint8Array): Promise<void> {
  await mkdir(join(folder, 'undo'), { recursive: true });
  await writeFile(join(folder, 'undo', name), content);
}

describe('the undo history index', () => {
  it('has the shapes of the features, which src/storage may not import (R1.3)', () => {
    // These compile only while the shapes stay the same: an operation of the features is a stored one, and a stored
    // one is an operation of the features once its identifiers are branded.
    const toStored = (entry: UndoEntry): StoredUndoEntry => entry;
    const fromStored = (entry: StoredUndoEntry): UndoEntry => entry as UndoEntry;
    expect(toStored(fromStored(orders))).toBe(orders);
    const keysOf = (entry: object): readonly string[] => Object.keys(entry).sort();
    expect(keysOf(fromStored(keys))).toEqual(keysOf(keys));
  });

  it('writes the operations at version 1 in undo/index.json and reads them back', async () => {
    const store = new Store(folder, undoIndexFile);
    expect(await store.load()).toEqual({ kind: 'missing' });
    store.set(withOperations(store.get(), [keys, orders]));
    await store.flush();
    const object = JSON.parse(await readFile(join(folder, 'undo', 'index.json'), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(object)[0]).toBe('version');
    expect(object['version']).toBe(1);
    const again = new Store(folder, undoIndexFile);
    expect(await again.load()).toEqual({ kind: 'current' });
    expect(again.get().operations).toEqual([keys, orders]);
  });

  it('keeps the fields it does not know, on an operation and at the top', async () => {
    await stored('index.json', JSON.stringify({ version: 1, later: true, operations: [{ ...orders, pinned: 1 }] }));
    const store = new Store(folder, undoIndexFile);
    await store.load();
    store.set(withOperations(store.get(), [{ ...orders, size: 0, undone: 5 }]));
    await store.flush();
    const object = JSON.parse(await readFile(join(folder, 'undo', 'index.json'), 'utf8')) as {
      later: boolean;
      operations: Record<string, unknown>[];
    };
    expect(object.later).toBe(true);
    expect(object.operations[0]).toMatchObject({ id: 'mh2k1', pinned: 1, undone: 5, size: 0 });
  });

  it('keeps an operation it cannot read as it is, and loses no other', async () => {
    const broken = { id: 'mh2k9', engine: 'cassandra' };
    await stored('index.json', JSON.stringify({ version: 1, operations: [broken, orders] }));
    const store = new Store(folder, undoIndexFile);
    await store.load();
    expect(store.get().operations).toEqual([orders]);
    store.set(withOperations(store.get(), [orders]));
    await store.flush();
    const object = JSON.parse(await readFile(join(folder, 'undo', 'index.json'), 'utf8')) as { operations: unknown[] };
    expect(object.operations).toEqual([orders, broken]);
  });

  it('sets a damaged index aside, starts empty, and then deletes no operation file (RS4)', async () => {
    await stored('index.json', '{ not json');
    await stored('mh2k1.json.gz', gzipSync('{"version":1,"docs":[]}'));
    const store = new Store(folder, undoIndexFile);
    const found = await store.load(new Date(Date.UTC(2026, 10, 19, 9)));
    expect(found.kind).toBe('damaged');
    expect(store.get().operations).toEqual([]);
    expect(await hasDamagedIndex(folder)).toBe(true);
    expect(await deleteOrphanFiles(folder, ['mh2k1.json.gz'], found)).toBe(0);
    expect(await readdir(join(folder, 'undo'))).toContain('mh2k1.json.gz');
  });

  it('never writes an index of a newer version, and deletes no file because of it', async () => {
    await stored('index.json', JSON.stringify({ version: 2, operations: [orders] }));
    await stored('mh2k7.json.gz', gzipSync('{"version":1,"docs":[]}'));
    const store = new Store(folder, undoIndexFile);
    const found = await store.load();
    expect(found).toEqual({ kind: 'newer', version: 2 });
    expect(store.set(withOperations(store.get(), []))).toBe(false);
    expect(await deleteOrphanFiles(folder, ['mh2k7.json.gz'], found)).toBe(0);
    expect(await readdir(join(folder, 'undo'))).toContain('mh2k7.json.gz');
  });

  it('deletes the files with no operation when the index was read', async () => {
    await stored('mh2k7.json.gz', gzipSync('{"version":1,"docs":[]}'));
    await stored('notes.txt', 'mine');
    expect(await hasDamagedIndex(folder)).toBe(false);
    expect(await deleteOrphanFiles(folder, ['mh2k7.json.gz', 'notes.txt', '..json.gz'], { kind: 'current' })).toBe(1);
    expect(await readdir(join(folder, 'undo'))).toEqual(['notes.txt']);
  });
});

describe('an operation file of the undo history', () => {
  const content = { docs: [{ id: { $oid: '665f1c2e9b1d4a0012345678' }, before: { total: { $numberInt: '3' } } }] };

  it('is the gzip of its version first, then its records, and gives its compressed size', async () => {
    const size = await writeOperationFile(folder, 'mh2k1', content);
    const bytes = await readFile(join(folder, 'undo', 'mh2k1.json.gz'));
    expect(size).toBe(bytes.byteLength);
    const object = JSON.parse(gunzipSync(bytes).toString('utf8')) as Record<string, unknown>;
    expect(Object.keys(object)).toEqual(['version', 'docs']);
    expect(await readOperationFile(folder, 'mh2k1')).toEqual({ kind: 'read', content });
  });

  it('is missing, damaged or newer on its own: that operation alone can no longer be undone', async () => {
    expect(await readOperationFile(folder, 'mh2k1')).toEqual({ kind: 'missing' });
    await stored('mh2k2.json.gz', 'not gzip');
    expect(await readOperationFile(folder, 'mh2k2')).toEqual({ kind: 'damaged' });
    await stored('mh2k3.json.gz', gzipSync('{"version":2,"docs":[]}'));
    expect(await readOperationFile(folder, 'mh2k3')).toEqual({ kind: 'newer', version: 2 });
  });

  it('is listed with when it was written, and deleted by id', async () => {
    await writeOperationFile(folder, 'mh2k1', content);
    await writeOperationFile(folder, 'mh2k2', { keys: [] });
    expect((await listOperationFiles(folder)).map((each) => each.name).sort()).toEqual([
      'mh2k1.json.gz',
      'mh2k2.json.gz',
    ]);
    await deleteOperationFiles(folder, ['mh2k1']);
    expect((await listOperationFiles(folder)).map((each) => each.name)).toEqual(['mh2k2.json.gz']);
  });

  it('has a name only for an id that is a file name', () => {
    expect(operationFileName('mh2k1')).toBe('mh2k1.json.gz');
    expect(() => operationFileName('../x')).toThrow();
    expect(() => operationFileName('index')).toThrow();
  });

  it('is listed as none when there is no folder', async () => {
    expect(await listOperationFiles(join(folder, 'nowhere'))).toEqual([]);
  });
});
