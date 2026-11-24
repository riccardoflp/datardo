import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectionsFile, withConnections } from '../../../src/storage/connections';
import { Store } from '../../../src/storage/store';
import type { SavedConnection } from '../../../src/shared/connection';
import { connectionId } from '../../../src/shared/ids';

const local: SavedConnection = {
  id: connectionId('c-1'),
  name: 'Local',
  engine: 'mongodb',
  hosts: 'db1:27017',
  readOnly: true,
  keepsUndo: true,
  color: 'blue',
  tls: { caFile: 'ca.pem', allowInvalidHostnames: true },
  ssh: { host: 'bastion', port: 22, username: 'ada', authentication: 'private-key', privateKeyFile: 'id_ed25519' },
  publishesTo: connectionId('c-2'),
  oplog: { channelPrefix: 'app' },
};

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-connections-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('the connections file', () => {
  it('writes the connections at version 1 and reads them back', async () => {
    const store = new Store(folder, connectionsFile);
    await store.load();
    store.set(withConnections(store.get(), [local]));
    await store.flush();
    const object = JSON.parse(await readFile(join(folder, 'connections.json'), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(object)[0]).toBe('version');
    const again = new Store(folder, connectionsFile);
    expect(await again.load()).toEqual({ kind: 'current' });
    expect(again.get().connections).toEqual([local]);
  });

  it('keeps the fields it does not know, on a connection and at the top', async () => {
    await writeFile(
      join(folder, 'connections.json'),
      JSON.stringify({
        version: 1,
        later: { a: 1 },
        connections: [{ id: 'c-1', name: 'Local', engine: 'redis', hosts: 'cache:6379', future: true }],
      }),
    );
    const store = new Store(folder, connectionsFile);
    await store.load();
    const [connection] = store.get().connections;
    expect(connection).toMatchObject({ id: 'c-1', engine: 'redis', readOnly: false, keepsUndo: true });
    store.set(
      withConnections(
        store.get(),
        store.get().connections.map((each) => ({ ...each, name: 'Cache' })),
      ),
    );
    await store.flush();
    const written = JSON.parse(await readFile(join(folder, 'connections.json'), 'utf8')) as Record<string, unknown>;
    expect(written).toEqual({
      version: 1,
      later: { a: 1 },
      connections: [
        {
          future: true,
          id: 'c-1',
          name: 'Cache',
          engine: 'redis',
          hosts: 'cache:6379',
          readOnly: false,
          keepsUndo: true,
        },
      ],
    });
  });

  it('a connection with no id or no engine sets the file aside', async () => {
    await writeFile(join(folder, 'connections.json'), JSON.stringify({ version: 1, connections: [{ name: 'x' }] }));
    const store = new Store(folder, connectionsFile);
    expect((await store.load()).kind).toBe('damaged');
    expect(store.get().connections).toEqual([]);
  });

  it('holds nothing secret: no field of a connection is a password', () => {
    const written = JSON.stringify(connectionsFile.write(withConnections(connectionsFile.empty(), [local])));
    expect(written).not.toMatch(/password|passphrase|connectionString/i);
  });

  it('reads the colors of the connections, databases and collections recorded at version 1, and writes them back', async () => {
    const recorded = join(
      import.meta.dirname,
      '..',
      '..',
      'fixtures',
      'stored',
      'connections',
      'v1',
      'connections.json',
    );
    await copyFile(recorded, join(folder, 'connections.json'));
    const store = new Store(folder, connectionsFile);
    expect(await store.load()).toEqual({ kind: 'current' });
    const [local, cache, plain] = store.get().connections;
    expect(local).toMatchObject({
      color: '#1e90ff',
      databaseColors: { shop: 'teal', archive: 'none' },
      collectionColors: { 'shop.orders': 'none', 'shop.logs': '#12abef', 'media.fs.files': 'pink' },
    });
    expect(cache).toMatchObject({ color: 'gray', databaseColors: { '3': 'green' } });
    expect(plain?.databaseColors).toBeUndefined();
    expect(plain?.collectionColors).toBeUndefined();
    store.set(withConnections(store.get(), store.get().connections));
    await store.flush();
    const again = JSON.parse(await readFile(join(folder, 'connections.json'), 'utf8')) as unknown;
    expect(again).toEqual(JSON.parse(await readFile(recorded, 'utf8')));
  });

  it('keeps only the colors it can read: a valid color, none, and a key of the right form', async () => {
    const connection = {
      id: 'c-1',
      name: 'Local',
      engine: 'mongodb',
      hosts: 'db1',
      color: 'chartreuse',
      databaseColors: { 'a.b': 'red', shop: 'lime' },
      collectionColors: { orders: 'red', 'shop.orders': '#ABC' },
    };
    await writeFile(join(folder, 'connections.json'), JSON.stringify({ version: 1, connections: [connection] }));
    const store = new Store(folder, connectionsFile);
    await store.load();
    const [read] = store.get().connections;
    expect(read?.color).toBeUndefined();
    expect(read?.databaseColors).toBeUndefined();
    expect(read?.collectionColors).toEqual({ 'shop.orders': '#aabbcc' });
  });
});
