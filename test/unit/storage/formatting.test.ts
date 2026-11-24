/**
 * `formatting.json` (data.md, D72): the file recorded at version 1 (`test/fixtures/stored/formatting/v1/`) read
 * whole, and the one with the rules of the other scopes, field rules and the scopes a collection leaves out
 * (`v1-scopes/`, M42); written back in its stated order; a damaged file set aside, a newer one never written.
 */
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectionRules, rulesInOrder, withCollectionRules } from '../../../src/features/table/format-scopes';
import { formattingFile } from '../../../src/storage/formatting';
import { Store } from '../../../src/storage/store';

const recorded = join(import.meta.dirname, '..', '..', 'fixtures', 'stored', 'formatting', 'v1');
const recordedScopes = join(import.meta.dirname, '..', '..', 'fixtures', 'stored', 'formatting', 'v1-scopes');
const orders = { connection: 'c-local', database: 'shop', collection: 'orders' };

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-formatting-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('table.edit-format-rule', () => {
  it('reads the file recorded at version 1: hidden, the rules of each collection in their order, turned off and named', async () => {
    await copyFile(join(recorded, 'formatting.json'), join(folder, 'formatting.json'));
    const store = new Store(folder, formattingFile);
    expect(await store.load()).toEqual({ kind: 'current' });
    const kept = store.get();
    expect(kept.hidden).toBe(true);
    expect(collectionRules(kept, orders)).toEqual([
      {
        id: '6b0d4f0e-2d4b-4c1e-9a43-3f1f6f6f1a01',
        condition: '{ status: "failed" }',
        color: 'red',
        name: 'Failed payments',
      },
      {
        id: '6b0d4f0e-2d4b-4c1e-9a43-3f1f6f6f1a02',
        condition: '{ amount: { $gt: 1000 } }',
        field: 'amount',
        color: 'orange',
        enabled: false,
      },
    ]);
    expect(collectionRules(kept, { ...orders, collection: 'people' })).toHaveLength(1);
  });

  it('writes back the file it read as it was', async () => {
    const written = await readFile(join(recorded, 'formatting.json'), 'utf8');
    await writeFile(join(folder, 'formatting.json'), written);
    const store = new Store(folder, formattingFile);
    await store.load();
    store.set({ ...store.get() });
    await store.flush();
    expect(JSON.parse(await readFile(join(folder, 'formatting.json'), 'utf8'))).toEqual(JSON.parse(written));
  });

  it('after a restart a teal rule is teal, and a collection without rules leaves nothing in the file', async () => {
    const store = new Store(folder, formattingFile);
    expect(await store.load()).toEqual({ kind: 'missing' });
    const rule = { id: 'r1', condition: '{ a: 1 }', color: 'teal' } as const;
    store.set({ ...store.get(), ...withCollectionRules(store.get(), orders, [rule]) });
    await store.flush();
    const again = new Store(folder, formattingFile);
    await again.load();
    expect(collectionRules(again.get(), orders)).toEqual([rule]);
    again.set({ ...again.get(), ...withCollectionRules(again.get(), orders, []) });
    await again.flush();
    expect(JSON.parse(await readFile(join(folder, 'formatting.json'), 'utf8'))).toEqual({
      version: 1,
      hidden: false,
      global: [],
      connections: {},
    });
  });

  it('sets a damaged file aside and reads it as empty, and never writes a file of a newer version', async () => {
    await writeFile(join(folder, 'formatting.json'), '{ not json');
    const damaged = new Store(folder, formattingFile);
    expect((await damaged.load()).kind).toBe('damaged');
    expect(damaged.get()).toEqual({ hidden: false, global: [], connections: {} });
    expect((await readdir(folder)).some((name) => name.includes('.damaged-'))).toBe(true);
    await writeFile(join(folder, 'formatting.json'), JSON.stringify({ version: 2, hidden: true }));
    const newer = new Store(folder, formattingFile);
    expect(await newer.load()).toEqual({ kind: 'newer', version: 2 });
    expect(newer.set(newer.get())).toBe(false);
  });
});

describe('table.format-scopes', () => {
  it('reads the rules of a database, a connection and everywhere, field rules and off, and writes them back', async () => {
    const written = await readFile(join(recordedScopes, 'formatting.json'), 'utf8');
    await writeFile(join(folder, 'formatting.json'), written);
    const store = new Store(folder, formattingFile);
    expect(await store.load()).toEqual({ kind: 'current' });
    const inOrder = rulesInOrder(store.get(), orders);
    expect(inOrder.off).toEqual(['global']);
    expect(inOrder.rules.map((each) => [each.scope, each.rule.kind ?? 'condition'])).toEqual([
      ['collection', 'field'],
      ['database', 'field'],
      ['connection', 'field'],
    ]);
    expect(inOrder.rules[0]?.rule).toMatchObject({
      pinned: [{ value: '"failed"', color: 'red' }],
      palette: 'blue',
      enabled: false,
    });
    expect(store.get().global).toHaveLength(1);
    store.set({ ...store.get() });
    await store.flush();
    expect(JSON.parse(await readFile(join(folder, 'formatting.json'), 'utf8'))).toEqual(JSON.parse(written));
  });
});

describe('table.toggle-formatting', () => {
  it('formatting hidden before a quit is hidden after the restart', async () => {
    const store = new Store(folder, formattingFile);
    await store.load();
    store.set({ ...store.get(), hidden: true });
    await store.flush();
    const again = new Store(folder, formattingFile);
    await again.load();
    expect(again.get().hidden).toBe(true);
  });
});
