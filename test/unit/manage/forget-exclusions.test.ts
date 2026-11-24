/**
 * The exclusions from searches that follow a rename and go with a drop made from Datardo, beside the colors: the step
 * the plans of the drops end with, and the actions of the main process that write the saved connection (on a fake of
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
  collectionColors: { 'shop.orders': '#1e90ff', 'shop.logs': 'teal' },
  exclusions: ['crm', 'crm.users', 'shop.fs.files', 'shop.logs'],
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
  const folder = await mkdtemp(join(tmpdir(), 'datardo-exclusions-'));
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
  const context = contextOf('manage.drop-collection', stateWith([colored]), {
    kind: 'connection',
    connection: colored.id,
  });

  it('ends with forget the color and the exclusion from searches of shop.logs, teal and excluded', () => {
    const dropped = planOf(
      dropCollection(context, started({ database: 'shop', collection: 'logs', view: false }, counted)),
    );
    expect(stepTexts(dropped)).toEqual([
      'db.logs.drop()',
      'forget the color and the exclusion from searches of shop.logs',
    ]);
  });

  it('names only the exclusion of a collection that has no color, and has one step without either', () => {
    const excluded = { ...colored, collectionColors: {}, exclusions: ['shop.logs'] };
    const alone = contextOf('manage.drop-collection', stateWith([excluded]), {
      kind: 'connection',
      connection: colored.id,
    });
    const dropped = planOf(
      dropCollection(alone, started({ database: 'shop', collection: 'logs', view: false }, counted)),
    );
    expect(stepTexts(dropped)).toEqual(['db.logs.drop()', 'forget the exclusion from searches of shop.logs']);
    const plain = planOf(
      dropCollection(alone, started({ database: 'shop', collection: 'users', view: false }, counted)),
    );
    expect(stepTexts(plain)).toEqual(['db.users.drop()']);
  });

  it('forgets shop.logs in collectionColors and exclusions, and a new logs is plain and not excluded', async () => {
    await act('tree.forget-colors', { connection: 'c-local', database: 'shop', collection: 'logs' });
    expect(local()?.collectionColors).toEqual({ 'shop.orders': '#1e90ff' });
    expect(local()?.exclusions).toEqual(['crm', 'crm.users', 'shop.fs.files']);
  });
});

describe('manage.drop-database', () => {
  it('ends with forget the colors and the exclusions from searches of shop and its collections', () => {
    const context = contextOf('manage.drop-database', stateWith([colored]), {
      kind: 'connection',
      connection: colored.id,
    });
    const collections = { buckets: [], entries: [{ name: 'orders', kind: 'collection', system: false }] };
    const dropped = planOf(dropDatabase(context, started({ database: 'shop' }, { collections })));
    expect(stepTexts(dropped)).toEqual([
      'db.getSiblingDB("shop").dropDatabase()',
      'forget the colors and the exclusions from searches of shop and its collections',
    ]);
  });

  it('forgets every key of shop, and the entries of crm stay', async () => {
    await act('tree.forget-colors', { connection: 'c-local', database: 'shop' });
    expect(local()?.databaseColors).toEqual({ crm: 'pink' });
    expect(local()).not.toHaveProperty('collectionColors');
    expect(local()?.exclusions).toEqual(['crm', 'crm.users']);
  });
});

describe('gridfs.drop-bucket', () => {
  it('ends with forget the exclusion from searches of the GridFS bucket shop.fs', () => {
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
      'forget the exclusion from searches of the GridFS bucket shop.fs',
    ]);
  });

  it('forgets shop.fs.files and shop.fs.chunks, pink and excluded, and a new fs is plain and not excluded', async () => {
    saved.connections = [
      {
        ...saved.connections[0]!,
        collectionColors: { 'shop.fs.files': 'pink' },
        exclusions: ['shop.fs.chunks', 'shop.fs.files'],
      },
    ];
    await act('tree.forget-colors', { connection: 'c-local', database: 'shop', bucket: 'fs' });
    expect(local()).not.toHaveProperty('collectionColors');
    expect(local()).not.toHaveProperty('exclusions');
  });
});

describe('manage.rename-collection', () => {
  it('moves the exclusion of shop.logs to shop.logs_old', async () => {
    const given = await services();
    await startSavedQueries(given);
    await moveCollection(given, {
      connection: connectionId('c-local'),
      database: 'shop',
      from: 'logs',
      to: 'logs_old',
    });
    expect(local()?.exclusions).toEqual(['crm', 'crm.users', 'shop.fs.files', 'shop.logs_old']);
  });
});

describe('tree.exclude-from-searches', () => {
  it('adds the keys and removes them, the last key removing exclusions', async () => {
    saved.connections = [{ ...saved.connections[0]!, exclusions: ['shop.logs'] }];
    await act('tree.exclude-from-searches', { connection: 'c-local', keys: ['archive'], excluded: true });
    expect(local()?.exclusions).toEqual(['archive', 'shop.logs']);
    await act('tree.exclude-from-searches', { connection: 'c-local', keys: ['archive', 'shop.logs'], excluded: false });
    expect(local()).not.toHaveProperty('exclusions');
  });

  it('writes excluded: true on the connection, and removes it', async () => {
    await act('tree.exclude-from-searches', { connection: 'c-local', excluded: true });
    expect(local()?.excluded).toBe(true);
    await act('tree.exclude-from-searches', { connection: 'c-local', excluded: false });
    expect(local()).not.toHaveProperty('excluded');
  });

  it('refuses keys that are not texts', async () => {
    await expect(
      act('tree.exclude-from-searches', { connection: 'c-local', keys: [3], excluded: true }),
    ).rejects.toThrow('The action needs the keys of databases and collections.');
  });
});
