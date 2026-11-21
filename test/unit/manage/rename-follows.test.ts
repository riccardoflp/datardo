/**
 * What follows a rename in the main process (`manage.rename-collection`, its app step), and the columns' layout that
 * follows a renamed or removed field (`field.layout-follows`, the app step of `field.rename` and `field.remove`), on a
 * temporary data folder.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renameInLayout } from '../../../src/main/actions/field';
import { moveCollection } from '../../../src/main/actions/manage';
import { AppStateHolder } from '../../../src/main/app-state';
import { start as startSavedQueries } from '../../../src/main/saved-queries';
import type { MainServices } from '../../../src/main/services';
import { connectionStateStore } from '../../../src/main/table';
import { connectionId } from '../../../src/shared/ids';
import { columnsKey, rememberedColumns } from '../../../src/shared/state/table';
import { columnsIn, recentQueriesIn, withColumns, withRecentQueries } from '../../../src/storage/connection-state';
import { queriesOfCollection, savedQueriesFile, withCollectionQueries } from '../../../src/storage/saved-queries';
import { Store } from '../../../src/storage/store';

const folders: string[] = [];
const find = { kind: 'find', filter: '{ status: "paid" }', sort: '', projection: '' } as const;

async function servicesIn(): Promise<{ services: MainServices; holder: AppStateHolder }> {
  const folder = await mkdtemp(join(tmpdir(), 'datardo-manage-'));
  folders.push(folder);
  const holder = new AppStateHolder();
  const services: MainServices = {
    state: holder,
    dataFolder: folder,
    window: () => undefined,
    onQuit: () => undefined,
    start: () => Promise.resolve({ kind: 'cancelled' }),
    dialogs: { ask: () => Promise.resolve(undefined), confirm: () => Promise.resolve(false) },
    platform: 'windows',
  };
  // The saved queries for me are moved through the store their area keeps.
  await startSavedQueries(services);
  return { services, holder };
}

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe('manage.rename-collection', () => {
  it('moves the recent queries, the saved queries for me, the columns and expansions, the pin and the tab', async () => {
    const { services, holder } = await servicesIn();
    const connection = connectionId('c-rename');
    const where = { database: 'shop', collection: 'orders' };
    const store = await connectionStateStore(services, connection);
    const layout = { hidden: ['note'], widths: { status: 120 } };
    store.set(
      withColumns(withRecentQueries(store.get(), where, [{ query: find, at: 1 }]), where, {
        layout,
        expanded: ['items'],
      }),
    );
    const saved = new Store(services.dataFolder, savedQueriesFile(connection), () => undefined);
    await saved.load();
    saved.set(withCollectionQueries(saved.get(), where, [{ name: 'Paid', ...where, query: find, at: 2 }]));
    await saved.flush();
    holder.dispatch({
      slice: 'table',
      type: 'columns-saved',
      key: columnsKey(connection, 'shop', 'orders'),
      columns: { layout, expanded: ['items'] },
    });
    holder.dispatch({
      slice: 'nav',
      type: 'changed',
      nav: {
        pins: {
          [connection]: [
            { kind: 'collection', database: 'shop', collection: 'orders' },
            { kind: 'saved-query', database: 'shop', collection: 'orders', name: 'Paid' },
            { kind: 'collection', database: 'shop', collection: 'users' },
          ],
        },
      },
    });
    const orders = { kind: 'collection', connection, database: 'shop', collection: 'orders' } as const;
    holder.dispatch({
      slice: 'tabs',
      type: 'opened',
      seed: { shows: orders },
      key: 'orders',
      background: false,
      at: 1,
    });
    const document = { ...orders, kind: 'document', id: '1' } as const;
    holder.dispatch({ slice: 'tabs', type: 'opened', seed: { shows: document }, key: 'doc', background: true, at: 2 });

    await moveCollection(services, { connection, database: 'shop', from: 'orders', to: 'orders_2024' });

    const moved = { database: 'shop', collection: 'orders_2024' };
    expect(recentQueriesIn(store.get(), 'shop', 'orders_2024')).toEqual([{ query: find, at: 1 }]);
    expect(recentQueriesIn(store.get(), 'shop', 'orders')).toEqual([]);
    expect(columnsIn(store.get())).toEqual([{ ...moved, columns: { layout, expanded: ['items'] } }]);
    const reread = new Store(services.dataFolder, savedQueriesFile(connection), () => undefined);
    await reread.load();
    expect(queriesOfCollection(reread.get(), 'shop', 'orders_2024').map((each) => each.name)).toEqual(['Paid']);
    expect(queriesOfCollection(reread.get(), 'shop', 'orders')).toEqual([]);
    const state = holder.get();
    expect(rememberedColumns(state.table, { connection, ...moved })).toEqual({ layout, expanded: ['items'] });
    expect(rememberedColumns(state.table, { connection, ...where })).toEqual({ layout: {}, expanded: [] });
    expect(state.nav.pins[connection]).toEqual([
      { kind: 'collection', database: 'shop', collection: 'orders_2024' },
      { kind: 'saved-query', database: 'shop', collection: 'orders_2024', name: 'Paid' },
      { kind: 'collection', database: 'shop', collection: 'users' },
    ]);
    // The collection's tab shows the new name, keeping its place and its query; the document tab stays.
    expect(state.tabs.tabs.map((tab) => tab.shows)).toEqual([{ ...orders, collection: 'orders_2024' }, document]);
  });

  it('moves nothing of a collection Datardo keeps nothing for, and leaves the files absent', async () => {
    const { services, holder } = await servicesIn();
    const connection = connectionId('c-nothing');
    await moveCollection(services, { connection, database: 'shop', from: 'a', to: 'b' });
    const store = await connectionStateStore(services, connection);
    expect(store.get()).toEqual({});
    expect(holder.get().tabs.tabs).toEqual([]);
  });
});

describe('field.layout-follows', () => {
  it('renames the column in the layout and the expansions, in the state and in the file', async () => {
    const { services, holder } = await servicesIn();
    const connection = connectionId('c-layout');
    const where = { connection, database: 'shop', collection: 'people' };
    holder.dispatch({
      slice: 'table',
      type: 'columns-saved',
      key: columnsKey(connection, 'shop', 'people'),
      columns: { layout: { hidden: ['name'], order: ['name', 'age'], widths: { name: 90 } }, expanded: ['name'] },
    });
    await renameInLayout(services, { ...where, from: 'name', to: 'fullName' });
    const after = {
      layout: { hidden: ['fullName'], order: ['fullName', 'age'], widths: { fullName: 90 } },
      expanded: ['fullName'],
    };
    expect(rememberedColumns(holder.get().table, where)).toEqual(after);
    const store = await connectionStateStore(services, connection);
    expect(columnsIn(store.get())).toEqual([{ database: 'shop', collection: 'people', columns: after }]);
    await renameInLayout(services, { ...where, from: 'fullName' });
    expect(rememberedColumns(holder.get().table, where)).toEqual({
      layout: { hidden: [], order: ['age'], widths: {} },
      expanded: [],
    });
  });
});
