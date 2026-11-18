import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store, type StoredFile } from '../../../src/storage/store';

interface Example {
  readonly names: readonly string[];
}

const example: StoredFile<Example> = {
  path: 'state/example.json',
  holds: 'The example',
  version: 2,
  migrations: { 1: (old) => ({ names: [typeof old['name'] === 'string' ? old['name'] : ''] }) },
  empty: () => ({ names: [] }),
  read: (object) => {
    const names = object['names'];
    if (!Array.isArray(names)) {
      throw new Error('names');
    }
    return { names: names.map(String) };
  },
  write: (value) => ({ names: [...value.names] }),
};

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-store-'));
  await mkdir(join(folder, 'state'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function stored(text: string): Promise<void> {
  await writeFile(join(folder, 'state', 'example.json'), text, 'utf8');
}

describe('the stored files', () => {
  it('read a missing file as empty, and write it with its version first', async () => {
    const store = new Store(folder, example);
    expect(await store.load()).toEqual({ kind: 'missing' });
    expect(store.get()).toEqual({ names: [] });
    store.set({ names: ['a'] });
    await store.flush();
    const text = await readFile(join(folder, 'state', 'example.json'), 'utf8');
    expect(text).toBe('{\n  "version": 2,\n  "names": [\n    "a"\n  ]\n}\n');
  });

  it('migrate an older file in memory and keep the old one aside before writing', async () => {
    await stored('{ "version": 1, "name": "old" }');
    const store = new Store(folder, example);
    expect(await store.load()).toEqual({ kind: 'older', version: 1 });
    expect(store.get()).toEqual({ names: ['old'] });
    expect(await readFile(join(folder, 'state', 'example.v1.bak'), 'utf8')).toContain('"name": "old"');
  });

  it('never write a file of a newer version', async () => {
    await stored('{ "version": 3, "names": ["new"] }');
    const store = new Store(folder, example);
    expect(await store.load()).toEqual({ kind: 'newer', version: 3 });
    expect(store.get()).toEqual({ names: ['new'] });
    expect(store.set({ names: ['changed'] })).toBe(false);
    await store.flush();
    expect(await readFile(join(folder, 'state', 'example.json'), 'utf8')).toBe('{ "version": 3, "names": ["new"] }');
  });

  it('set a damaged file aside and read it as empty, deleting nothing', async () => {
    await stored('{ not json');
    const store = new Store(folder, example);
    const found = await store.load(new Date(Date.UTC(2026, 10, 18, 9, 30, 5, 7)));
    expect(found).toEqual({
      kind: 'damaged',
      setAsideAs: join(folder, 'state', 'example.damaged-2026-11-18_09-30-05-007.json'),
    });
    expect(store.get()).toEqual({ names: [] });
    expect(await readdir(join(folder, 'state'))).toEqual(['example.damaged-2026-11-18_09-30-05-007.json']);
  });

  it('set aside a file without a version', async () => {
    await stored('{ "names": [] }');
    const store = new Store(folder, example);
    expect((await store.load()).kind).toBe('damaged');
  });

  it('write the last change only, a moment after it', async () => {
    const store = new Store(folder, example);
    await store.load();
    store.set({ names: ['1'] });
    store.set({ names: ['2'] });
    await store.flush();
    expect(JSON.parse(await readFile(join(folder, 'state', 'example.json'), 'utf8'))).toEqual({
      version: 2,
      names: ['2'],
    });
    expect(await readdir(join(folder, 'state'))).toEqual(['example.json']);
  });
});
