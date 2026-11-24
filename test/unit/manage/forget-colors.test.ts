/**
 * The colors of databases and collections that follow a rename and go with a drop made from Datardo: the step the
 * plans of the drops end with, and the actions of the main process that write the saved connection (on a fake of
 * `src/main/connections.ts`, which reads the secret storage of Electron in the app).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plan as dropCollection } from '../../../src/features/manage/drop-collection';
import { plan as dropDatabase } from '../../../src/features/manage/drop-database';
import { feature as dropBucket } from '../../../src/features/gridfs/drop-bucket';
import { moveCollection } from '../../../src/main/actions/manage';
import { actions as treeActions } from '../../../src/main/actions/tree';
import { AppStateHolder } from '../../../src/main/app-state';
import { start as startSavedQueries } from '../../../src/main/saved-queries';
import type { MainServices } from '../../../src/main/services';
import type { SavedConnection } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import { contextOf, mongoConnection, stateWith } from '../connection/context';
import { planOf, started, stepTexts } from './harness';

const saved = vi.hoisted(() => ({ connections: [] as SavedConnection[] }));

vi.mock('../../../src/main/connections', () => ({
  findConnection: (id: string) => saved.connections.find((each) => each.id === id),
  writeConnection: (connection: SavedConnection) => {
    saved.connections = saved.connections.map((each) => (each.id === connection.id ? connection : each));
  },
}));

const colored = mongoConnection({
  color: 'red',
  databaseColors: { shop: 'teal', crm: 'pink' },
  collectionColors: { 'shop.orders': '#1e90ff', 'shop.logs': 'teal', 'shop.fs.files': 'pink', 'crm.users': 'gray' },
});

const folders: string[] = [];

function servicesOf(holder: AppStateHolder, folder: string): MainServices {
  return {
    state: holder,
    dataFolder: folder,
    window: () => undefined,
    onQuit: () => undefined,
    start: () => Promise.resolve({ kind: 'cancelled' }),
    dialogs: { ask: () => Promise.resolve(undefined), confirm: () => Promise.resolve(false) },
    platform: 'windows',
  };
}

async function services(): Promise<MainServices> {
  const folder = await mkdtemp(join(tmpdir(), 'datardo-colors-'));
  folders.push(folder);
  const holder = new AppStateHolder();
  holder.dispatch({ slice: 'connections', type: 'loaded', saved: [colored], keychain: true, readOnlyFile: false });
  return servicesOf(holder, folder);
}

async function act(name: string, args: Json): Promise<void> {
  const action = treeActions(await services())[name];
  await action?.(args, new AbortController().signal);
}

function local(): SavedConnection | undefined {
  return saved.connections[0];
}

beforeEach(() => {
  const { secrets: _secrets, address: _address, ...connection } = colored;
  saved.connections = [connection];
});

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe('manage.drop-collection', () => {
  const counted = { count: { logs: 0 }, indexes: { indexes: [{ name: '_id_' }], totals: {} } };

  it('ends with forget the color of shop.logs when the collection has one, and has one step when it has none', () => {
    const context = contextOf('manage.drop-collection', stateWith([colored]), {
      kind: 'connection',
      connection: colored.id,
    });
    const dropped = planOf(
      dropCollection(context, started({ database: 'shop', collection: 'logs', view: false }, counted)),
    );
    expect(stepTexts(dropped)).toEqual(['db.logs.drop()', 'forget the color of shop.logs']);
    const plain = planOf(
      dropCollection(context, started({ database: 'shop', collection: 'users', view: false }, counted)),
    );
    expect(stepTexts(plain)).toEqual(['db.users.drop()']);
  });

  it('forgets the entry of shop.logs, and a new logs is plain', async () => {
    await act('tree.forget-colors', { connection: 'c-local', database: 'shop', collection: 'logs' });
    expect(local()?.collectionColors).toEqual({
      'shop.orders': '#1e90ff',
      'shop.fs.files': 'pink',
      'crm.users': 'gray',
    });
    expect(local()?.databaseColors).toEqual({ shop: 'teal', crm: 'pink' });
  });
});

describe('manage.drop-database', () => {
  it('ends with forget the colors of shop and its collections', () => {
    const context = contextOf('manage.drop-database', stateWith([colored]), {
      kind: 'connection',
      connection: colored.id,
    });
    const collections = { buckets: [], entries: [{ name: 'orders', kind: 'collection', system: false }] };
    const dropped = planOf(dropDatabase(context, started({ database: 'shop' }, { collections })));
    expect(stepTexts(dropped)).toEqual([
      'db.getSiblingDB("shop").dropDatabase()',
      'forget the colors of shop and its collections',
    ]);
  });

  it('forgets the entry of shop and every key that starts with shop., and leaves those of crm', async () => {
    await act('tree.forget-colors', { connection: 'c-local', database: 'shop' });
    expect(local()?.databaseColors).toEqual({ crm: 'pink' });
    expect(local()?.collectionColors).toEqual({ 'crm.users': 'gray' });
  });
});

describe('gridfs.drop-bucket', () => {
  it('ends with forget the color of the GridFS bucket shop.fs, after the drops of its two collections', () => {
    const context = contextOf('gridfs.drop-bucket', stateWith([colored]), {
      kind: 'database',
      connection: colored.id,
      database: 'shop',
    });
    const dropped = planOf(
      dropBucket.plan(context, { args: { connection: colored.id, database: 'shop', bucket: 'fs' }, count: 2 }),
    );
    expect(stepTexts(dropped)).toEqual([
      'db.getCollection("fs.files").drop()',
      'db.getCollection("fs.chunks").drop()',
      'forget the color of the GridFS bucket shop.fs',
    ]);
  });

  it('forgets shop.fs.files and shop.fs.chunks, and a map left empty is left out', async () => {
    saved.connections = [{ ...saved.connections[0]!, collectionColors: { 'shop.fs.files': 'pink' } }];
    await act('tree.forget-colors', { connection: 'c-local', database: 'shop', bucket: 'fs' });
    expect(local()).not.toHaveProperty('collectionColors');
  });
});

describe('tree.set-collection-color', () => {
  it('writes the entry of shop.orders, then removes it, the last entry removing collectionColors', async () => {
    saved.connections = [{ ...saved.connections[0]!, collectionColors: { 'shop.orders': '#1e90ff' } }];
    await act('tree.set-color', { connection: 'c-local', map: 'collectionColors', key: 'shop.orders', color: 'teal' });
    expect(local()?.collectionColors).toEqual({ 'shop.orders': 'teal' });
    await act('tree.set-color', { connection: 'c-local', map: 'collectionColors', key: 'shop.orders', color: null });
    expect(local()).not.toHaveProperty('collectionColors');
  });

  it('refuses a color it cannot read', async () => {
    await expect(
      act('tree.set-color', {
        connection: 'c-local',
        map: 'collectionColors',
        key: 'shop.orders',
        color: 'chartreuse',
      }),
    ).rejects.toThrow('The action needs a color, none, or null.');
  });
});

describe('tree.set-database-color', () => {
  it('writes green under "3" for db3, and None removes it', async () => {
    const { databaseColors: _colors, ...plain } = saved.connections[0]!;
    saved.connections = [plain];
    await act('tree.set-color', { connection: 'c-local', map: 'databaseColors', key: '3', color: 'green' });
    expect(local()?.databaseColors).toEqual({ '3': 'green' });
    await act('tree.set-color', { connection: 'c-local', map: 'databaseColors', key: '3', color: null });
    expect(local()).not.toHaveProperty('databaseColors');
  });
});

describe('manage.rename-collection', () => {
  it('moves the color of the teal shop.orders to orders_2024', async () => {
    saved.connections = [{ ...saved.connections[0]!, collectionColors: { 'shop.orders': 'teal' } }];
    const given = await services();
    await startSavedQueries(given);
    given.state.dispatch({ slice: 'connections', type: 'saved', connection: { ...colored, ...saved.connections[0]! } });
    await moveCollection(given, {
      connection: connectionId('c-local'),
      database: 'shop',
      from: 'orders',
      to: 'orders_2024',
    });
    expect(local()?.collectionColors).toEqual({ 'shop.orders_2024': 'teal' });
  });
});
