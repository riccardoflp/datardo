/**
 * The colors of connections, databases and collections in the files of connections: read from Datardo's and
 * Mongoster's formats, written to each format, imported and exported. The export of Mongoster 0.10.0 recorded in
 * `test/fixtures/stored/connections/v1/` was written by Mongoster's own `serializeConnections`; `datardo-export.json`
 * is Datardo's export of the same connections, each entry as Mongoster 0.10.0 reads one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as importConnections from '../../../src/features/connection/import';
import { connectionsFromList } from '../../../src/features/connection/read-list';
import { connectionsFromText } from '../../../src/features/connection/read-file';
import type { FileConnection, FileConnections } from '../../../src/features/connection/types';
import { connectionsToText } from '../../../src/features/connection/write-file';
import { nodeFileCrypto } from '../../../src/main/file-crypto';
import type { SavedConnection } from '../../../src/shared/connection';
import type { Answers, Outcome } from '../../../src/shared/feature';
import { contextOf, mongoConnection, stateWith } from './context';

const recorded = join(import.meta.dirname, '..', '..', 'fixtures', 'stored', 'connections', 'v1');

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

const shopEntry = {
  name: 'Shop',
  uri: 'mongodb://db1/shop',
  color: '#1E90FF',
  databaseColors: { shop: 'teal', 'a.b': 'red' },
  collectionColors: { 'shop.orders': 'none', 'shop.fs.files': 'pink', nodot: 'red', 'shop.logs': 'chartreuse' },
};

const shop: FileConnection = {
  id: 'c-shop',
  name: 'Shop',
  engine: 'mongodb',
  connectionString: 'mongodb://db1/shop',
  color: '#1e90ff',
  databaseColors: { shop: 'teal' },
  collectionColors: { 'shop.orders': 'none' },
  notes: [],
};

const fromFile: Answers = { source: 'file', 'source-read': { text: '[]', name: 'connections.json' } };

function imported(file: FileConnections, more: Answers, saved = stateWith([])): Outcome {
  const context = contextOf('connection.import', saved);
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
  it('reads the custom color and the valid colors of databases and collections of a Datardo or Mongoster entry', async () => {
    for (const type of ['Datardo Connections', 'Mongoster Connections']) {
      const entry = type === 'Datardo Connections' ? { ...shopEntry, engine: 'mongodb' } : shopEntry;
      const file = await read(JSON.stringify({ type, version: 1, connections: [entry] }));
      expect(file.connections[0], type).toMatchObject({
        color: '#1e90ff',
        databaseColors: { shop: 'teal' },
        collectionColors: { 'shop.orders': 'none', 'shop.fs.files': 'pink' },
      });
    }
  });

  it('reads a Mongoster file of an earlier version, without these fields, as nothing colored', async () => {
    const file = await read(
      JSON.stringify({ type: 'Mongoster Connections', version: 1, connections: [{ name: 'Old', uri: 'mongodb://h' }] }),
    );
    expect(file.connections[0]?.databaseColors).toBeUndefined();
    expect(file.connections[0]?.collectionColors).toBeUndefined();
  });

  it('reads the colors of the databases of a Redis entry by their numbers, and no colors of collections', async () => {
    const entry = {
      name: 'Cache',
      engine: 'redis',
      uri: 'redis://cache',
      databaseColors: { '3': 'green' },
      collectionColors: { 'a.b': 'red' },
    };
    const file = await read(JSON.stringify({ type: 'Datardo Connections', version: 1, connections: [entry] }));
    expect(file.connections[0]?.databaseColors).toEqual({ '3': 'green' });
    expect(file.connections[0]?.collectionColors).toBeUndefined();
  });
});

describe('connection.write-file', () => {
  it('writes the custom color and the colors of databases and collections of Shop in Datardo’s format', async () => {
    const file = JSON.parse((await written([shop], 'datardo')).text) as { connections: Record<string, unknown>[] };
    expect(file.connections[0]).toMatchObject({
      color: '#1e90ff',
      databaseColors: { shop: 'teal' },
      collectionColors: { 'shop.orders': 'none' },
    });
  });

  it('writes Shop to Compass with the code of its nearest preset, and notes the colors left out', async () => {
    const { text, notes } = await written([shop], 'compass');
    const file = JSON.parse(text) as { connections: { favorite: unknown }[] };
    expect(file.connections[0]?.favorite).toEqual({ name: 'Shop', color: 'color3' });
    expect(notes).toContain("colors of databases and collections were left out (Compass doesn't have them)");
  });

  it('writes Shop to a list, and counts its colors in the note of what was left out', async () => {
    const { color: _color, ...plain } = shop;
    const { text, notes } = await written([plain], 'list');
    expect(text.split('\n')[1]).toBe('Shop = mongodb://db1/shop');
    expect(notes).toContain('folders, colors, read-only and redis-oplog were left out');
  });
});

describe('connection.import', () => {
  it('imports the export of Mongoster 0.10.0 with every color', async () => {
    const file = await read(readFileSync(join(recorded, 'mongoster-0.10.0-export.json'), 'utf8'));
    expect(file.format).toBe('mongoster');
    const saved = savedOf(imported(file, { chosen: ['0', '1', '2'], folder: 'from-file' }));
    expect(
      saved.map(({ name, color, databaseColors, collectionColors }) => ({
        name,
        color,
        databaseColors,
        collectionColors,
      })),
    ).toEqual([
      {
        name: 'Shop',
        color: '#1e90ff',
        databaseColors: { shop: 'teal', archive: 'none' },
        collectionColors: { 'shop.orders': 'none', 'shop.logs': '#12abef', 'media.fs.files': 'pink' },
      },
      { name: 'Reports', color: 'indigo', databaseColors: { sales: 'brown' }, collectionColors: undefined },
      { name: 'Plain', color: undefined, databaseColors: undefined, collectionColors: undefined },
    ]);
  });

  it('exports them again in Datardo’s format as recorded, each entry as Mongoster 0.10.0 writes it', async () => {
    const file = await read(readFileSync(join(recorded, 'mongoster-0.10.0-export.json'), 'utf8'));
    const ids = file.connections.map((each, index) => ({ ...each, id: `c-${String(index + 1)}` }));
    const { text } = await written(ids, 'datardo');
    expect(text).toBe(readFileSync(join(recorded, 'datardo-export.json'), 'utf8'));
    const mongoster = JSON.parse(readFileSync(join(recorded, 'mongoster-0.10.0-export.json'), 'utf8')) as {
      connections: Record<string, unknown>[];
    };
    const datardo = JSON.parse(text) as { connections: Record<string, unknown>[] };
    datardo.connections.forEach((entry, index) => {
      const theirs = mongoster.connections[index] ?? {};
      for (const field of ['name', 'uri', 'color', 'databaseColors', 'collectionColors']) {
        expect(entry[field], `${String(index)} ${field}`).toEqual(theirs[field]);
      }
    });
    expect((await read(text)).connections.map((each) => each.collectionColors)).toEqual(
      file.connections.map((each) => each.collectionColors),
    );
  });

  it('shows #1e90ff, 1 database color and 2 collection colors in the detail of an entry', () => {
    const entry: FileConnection = {
      ...shop,
      collectionColors: { 'shop.orders': 'none', 'shop.logs': '#12abef' },
    };
    expect(importConnections.describe(entry, [], false)).toBe(
      'MongoDB · db1 · #1e90ff · 1 database color · 2 collection colors',
    );
  });

  it('replaces the colors of databases and collections with the file’s, and keeps them when the file has none', () => {
    const before = mongoConnection({
      name: 'Shop',
      databaseColors: { crm: 'red' },
      collectionColors: { 'crm.users': 'pink' },
    });
    const state = stateWith([before]);
    const choose = { chosen: ['0'], taken: 'replace', folder: 'no-folder' };
    const [replaced] = savedOf(imported({ format: 'datardo', connections: [shop], skipped: 0 }, choose, state));
    expect(replaced).toMatchObject({
      id: before.id,
      databaseColors: { shop: 'teal' },
      collectionColors: { 'shop.orders': 'none' },
    });
    const [kept] = savedOf(imported(connectionsFromList('Shop = mongodb://db1/shop'), choose, state));
    expect(kept).toMatchObject({ databaseColors: { crm: 'red' }, collectionColors: { 'crm.users': 'pink' } });
  });
});
