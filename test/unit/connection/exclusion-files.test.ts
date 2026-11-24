/**
 * The exclusions from searches in the files of connections and in the saved connections (`tree.excluded`): read from
 * Datardo's and Mongoster's formats, written to each format with the notes of what is left out, shown in the detail
 * of an import and carried by **Replace**, and copied by **Duplicate** (the action of the main process, on a fake of
 * `src/main/connections.ts`, which reads the secret storage of Electron in the app).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as importConnections from '../../../src/features/connection/import';
import { connectionsFromList } from '../../../src/features/connection/read-list';
import { connectionsFromText } from '../../../src/features/connection/read-file';
import type { FileConnection, FileConnections } from '../../../src/features/connection/types';
import { connectionsToText } from '../../../src/features/connection/write-file';
import { nodeFileCrypto } from '../../../src/main/file-crypto';
import type { SavedConnection } from '../../../src/shared/connection';
import type { Answers, Outcome } from '../../../src/shared/feature';
import { contextOf, mongoConnection, stateWith } from './context';

const saved = vi.hoisted(() => ({ connections: [] as SavedConnection[] }));

vi.mock('electron', () => ({ app: {}, clipboard: {}, dialog: {} }));

vi.mock('../../../src/main/connections', () => ({
  findConnection: (id: string) => saved.connections.find((each) => each.id === id),
  fullConnectionString: () => undefined,
  savedOptionSecrets: () => ({}),
  writeGivenSecrets: () => undefined,
  writeConnection: (connection: SavedConnection) => {
    saved.connections = [...saved.connections.filter((each) => each.id !== connection.id), connection];
  },
}));

async function read(text: string): Promise<FileConnections> {
  const result = await connectionsFromText(text, undefined, nodeFileCrypto);
  if ('problem' in result) {
    throw new Error(result.problem);
  }
  return result;
}

async function written(
  connections: readonly FileConnection[],
  format: 'datardo' | 'compass' | 'list',
): Promise<{ text: string; notes: readonly string[] }> {
  const result = await connectionsToText(connections, { format, secrets: 'remove' }, nodeFileCrypto);
  if ('problem' in result) {
    throw new Error(result.problem);
  }
  return result;
}

/** `Shop` of the card's examples: colored, `shop.logs` excluded, and the connection excluded too. */
const shop: FileConnection = {
  id: 'c-shop',
  name: 'Shop',
  engine: 'mongodb',
  connectionString: 'mongodb://db1/shop',
  color: '#1e90ff',
  databaseColors: { shop: 'teal' },
  collectionColors: { 'shop.orders': 'none' },
  excluded: true,
  exclusions: ['shop.logs'],
  notes: [],
};

const fromFile: Answers = { source: 'file', 'source-read': { text: '[]', name: 'connections.json' } };

function imported(file: FileConnections, more: Answers, state = stateWith([])): Outcome {
  const context = contextOf('connection.import', state);
  return importConnections.plan(context, { ...fromFile, 'parsed-0': { file, same: [] }, ...more });
}

function savedOf(outcome: Outcome): readonly SavedConnection[] {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${outcome.kind}`);
  }
  return outcome.plan.steps.flatMap((step) =>
    step.kind === 'app' && step.action === 'connection.import-one'
      ? [(step.args as unknown as { saved: SavedConnection }).saved]
      : [],
  );
}

describe('connection.read-file', () => {
  it('reads excluded only when true, and the valid exclusions of a Datardo or Mongoster entry, sorted', async () => {
    const entry = {
      name: 'Shop',
      uri: 'mongodb://db1/shop',
      color: '#1E90FF',
      databaseColors: { shop: 'teal', 'a.b': 'red' },
      collectionColors: { 'shop.orders': 'none', 'shop.fs.files': 'pink', nodot: 'red', 'shop.logs': 'chartreuse' },
      excluded: true,
      exclusions: ['shop.logs', 'archive', 'archive', 7],
    };
    for (const type of ['Datardo Connections', 'Mongoster Connections']) {
      const given = type === 'Datardo Connections' ? { ...entry, engine: 'mongodb' } : entry;
      const file = await read(JSON.stringify({ type, version: 1, connections: [given] }));
      expect(file.connections[0], type).toMatchObject({
        color: '#1e90ff',
        databaseColors: { shop: 'teal' },
        collectionColors: { 'shop.orders': 'none', 'shop.fs.files': 'pink' },
        excluded: true,
        exclusions: ['archive', 'shop.logs'],
      });
    }
  });

  it('reads a file without these fields, or with excluded not true, as nothing excluded', async () => {
    const file = await read(
      JSON.stringify({
        type: 'Mongoster Connections',
        version: 1,
        connections: [{ name: 'Old', uri: 'mongodb://h', excluded: 'yes', exclusions: 'archive' }],
      }),
    );
    expect(file.connections[0]?.excluded).toBeUndefined();
    expect(file.connections[0]?.exclusions).toBeUndefined();
  });

  it('reads excluded on a Redis entry, and no exclusions', async () => {
    const entry = { name: 'Cache', engine: 'redis', uri: 'redis://cache', excluded: true, exclusions: ['db0'] };
    const file = await read(JSON.stringify({ type: 'Datardo Connections', version: 1, connections: [entry] }));
    expect(file.connections[0]?.excluded).toBe(true);
    expect(file.connections[0]?.exclusions).toBeUndefined();
  });
});

describe('connection.write-file', () => {
  it('writes excluded and exclusions of Shop in Datardo’s format, and reads them back', async () => {
    const { text, notes } = await written([shop], 'datardo');
    const file = JSON.parse(text) as { connections: Record<string, unknown>[] };
    expect(file.connections[0]).toMatchObject({
      color: '#1e90ff',
      databaseColors: { shop: 'teal' },
      collectionColors: { 'shop.orders': 'none' },
      excluded: true,
      exclusions: ['shop.logs'],
    });
    expect(notes).toEqual([]);
    expect((await read(text)).connections[0]).toMatchObject({ excluded: true, exclusions: ['shop.logs'] });
  });

  it('writes Shop to Compass with the notes of the colors and of the exclusions left out', async () => {
    const { text, notes } = await written([shop], 'compass');
    const file = JSON.parse(text) as { connections: { favorite: unknown }[] };
    expect(file.connections[0]?.favorite).toEqual({ name: 'Shop', color: 'color3' });
    expect(notes).toContain("colors of databases and collections were left out (Compass doesn't have them)");
    expect(notes).toContain("exclusions from searches were left out (Compass doesn't have them)");
  });

  it('writes Shop to a list with the notes of what was left out', async () => {
    const { text, notes } = await written([shop], 'list');
    expect(text.split('\n')[1]).toBe('Shop = mongodb://db1/shop');
    expect(notes).toEqual([
      'folders, colors, read-only and redis-oplog were left out',
      'exclusions from searches were left out',
    ]);
  });

  it('writes no note of exclusions for a connection that has none', async () => {
    const { excluded: _excluded, exclusions: _exclusions, ...plain } = shop;
    expect((await written([plain], 'compass')).notes).not.toContain(
      "exclusions from searches were left out (Compass doesn't have them)",
    );
    expect((await written([plain], 'list')).notes).not.toContain('exclusions from searches were left out');
  });
});

describe('connection.export', () => {
  it('carries what is excluded from searches in Datardo’s format; importing the file gives it back', async () => {
    const { text } = await written([shop], 'datardo');
    const [again] = savedOf(imported(await read(text), { chosen: ['0'], folder: 'no-folder' }));
    expect(again).toMatchObject({ excluded: true, exclusions: ['shop.logs'] });
  });

  it('notes in Compass’s format and in a list that the exclusions were left out', async () => {
    expect((await written([shop], 'compass')).notes).toContain(
      "exclusions from searches were left out (Compass doesn't have them)",
    );
    expect((await written([shop], 'list')).notes).toContain('exclusions from searches were left out');
  });
});

describe('connection.import', () => {
  it('shows excluded from searches and 1 database or collection excluded from searches in the detail', () => {
    const entry: FileConnection = {
      ...shop,
      collectionColors: { 'shop.orders': 'none', 'shop.logs': '#12abef' },
      exclusions: ['archive'],
    };
    expect(importConnections.describe(entry, { saved: [], all: [entry] }, false)).toBe(
      'MongoDB · db1 · #1e90ff · 1 database color · 2 collection colors · excluded from searches · 1 database or collection excluded from searches',
    );
    const two = { ...entry, excluded: undefined, exclusions: ['archive', 'shop.logs'] } as unknown as FileConnection;
    expect(importConnections.describe(two, { saved: [], all: [two] }, false)).toContain(
      '2 databases or collections excluded from searches',
    );
  });

  it('imports a Datardo entry with its exclusions', async () => {
    const file = await read(
      JSON.stringify({
        type: 'Datardo Connections',
        version: 1,
        connections: [
          { name: 'Shop', engine: 'mongodb', uri: 'mongodb://db1/shop', excluded: true, exclusions: ['archive'] },
        ],
      }),
    );
    const [one] = savedOf(imported(file, { chosen: ['0'], folder: 'no-folder' }));
    expect(one).toMatchObject({ excluded: true, exclusions: ['archive'] });
  });

  it('replaces the exclusions with the file’s, keeps them when the file has none, and keeps the connection excluded', () => {
    const before = mongoConnection({ name: 'Shop', excluded: true, exclusions: ['crm'] });
    const state = stateWith([before]);
    const choose = { chosen: ['0'], taken: 'replace', folder: 'no-folder' };
    const { excluded: _excluded, ...notExcluded } = shop;
    const [replaced] = savedOf(imported({ format: 'datardo', connections: [notExcluded], skipped: 0 }, choose, state));
    expect(replaced).toMatchObject({ id: before.id, excluded: true, exclusions: ['shop.logs'] });
    const [kept] = savedOf(imported(connectionsFromList('Shop = mongodb://db1/shop'), choose, state));
    expect(kept).toMatchObject({ excluded: true, exclusions: ['crm'] });
    const plain = stateWith([mongoConnection({ name: 'Shop' })]);
    const [becomes] = savedOf(imported({ format: 'datardo', connections: [shop], skipped: 0 }, choose, plain));
    expect(becomes).toMatchObject({ excluded: true, exclusions: ['shop.logs'] });
  });
});

describe('connection.duplicate', () => {
  beforeEach(() => {
    const {
      secrets: _secrets,
      address: _address,
      ...local
    } = mongoConnection({
      databaseColors: { shop: 'teal' },
      collectionColors: { 'shop.orders': 'pink' },
      excluded: true,
      exclusions: ['archive', 'shop.logs'],
    });
    saved.connections = [local];
  });

  it('gives the copy the colors and the exclusions of the original', async () => {
    const { actions } = await import('../../../src/main/actions/connection-organize');
    const action = actions({} as never)['connection.duplicate'];
    await action?.({ connection: 'c-local', copy: 'c-copy', name: 'Local (2)' }, new AbortController().signal);
    const copy = saved.connections.find((each) => each.id === 'c-copy');
    expect(copy).toMatchObject({
      name: 'Local (2)',
      databaseColors: { shop: 'teal' },
      collectionColors: { 'shop.orders': 'pink' },
      excluded: true,
      exclusions: ['archive', 'shop.logs'],
    });
  });
});
