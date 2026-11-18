import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
});
