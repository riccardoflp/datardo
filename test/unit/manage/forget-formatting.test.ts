/**
 * The formatting rules of collections that follow a rename and go with a drop made from Datardo, and those of a
 * connection that go with its removal (M41): the steps of the plans, and the actions of the main process that change
 * the rules kept in the app's state (`formatting.json` is written from it).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plan as removeConnection } from '../../../src/features/connection/remove';
import { feature as dropBucket } from '../../../src/features/gridfs/drop-bucket';
import { plan as dropCollection } from '../../../src/features/manage/drop-collection';
import { plan as dropDatabase } from '../../../src/features/manage/drop-database';
import { collectionRules, withCollectionRules } from '../../../src/features/table/format-scopes';
import { moveCollection } from '../../../src/main/actions/manage';
import { actions as tableActions } from '../../../src/main/actions/table';
import { actions as treeActions } from '../../../src/main/actions/tree';
import { AppStateHolder } from '../../../src/main/app-state';
import { start as startSavedQueries } from '../../../src/main/saved-queries';
import type { MainServices } from '../../../src/main/services';
import type { SavedConnection } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import { noFormatting, type FormatRule, type KeptFormatting } from '../../../src/shared/formatting-rules';
import { connectionId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import { contextOf, mongoConnection, on, stateWith } from '../connection/context';
import { planOf, started, stepTexts } from './harness';

const saved = vi.hoisted(() => ({ connections: [] as SavedConnection[] }));

vi.mock('../../../src/main/connections', () => ({
  findConnection: (id: string) => saved.connections.find((each) => each.id === id),
  writeConnection: (connection: SavedConnection) => {
    saved.connections = saved.connections.map((each) => (each.id === connection.id ? connection : each));
  },
}));

const local = mongoConnection();
const rule: FormatRule = { id: 'r1', condition: '{ status: "failed" }', color: 'red' };
const at = (database: string, collection: string) => ({ connection: 'c-local', database, collection });

/** Rules on shop.orders, shop.fs.files, shop.logs and crm.users of Local, and on shop.orders of Staging. */
const kept: KeptFormatting = [
  at('shop', 'orders'),
  at('shop', 'fs.files'),
  at('shop', 'logs'),
  at('crm', 'users'),
  { connection: 'c-staging', database: 'shop', collection: 'orders' },
].reduce((each, where) => withCollectionRules(each, where, [rule]), noFormatting);

function stateWithRules(): AppState {
  const state = stateWith([local]);
  return { ...state, table: { ...state.table, formatting: { hidden: false, ...kept } } };
}

const folders: string[] = [];

async function services(): Promise<MainServices> {
  const folder = await mkdtemp(join(tmpdir(), 'datardo-formatting-'));
  folders.push(folder);
  const holder = new AppStateHolder();
  holder.dispatch({ slice: 'connections', type: 'loaded', saved: [local], keychain: true, readOnlyFile: false });
  holder.dispatch({ slice: 'table', type: 'formatting-changed', formatting: { hidden: false, ...kept } });
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

function rulesOf(given: MainServices, database: string, collection: string, connection = 'c-local') {
  return collectionRules(given.state.get().table.formatting, { connection, database, collection });
}

beforeEach(() => {
  const { secrets: _secrets, address: _address, ...connection } = local;
  saved.connections = [connection];
});

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe('manage.drop-collection', () => {
  const counted = { count: { orders: 0 }, indexes: { indexes: [{ name: '_id_' }], totals: {} } };
  const context = () =>
    contextOf('manage.drop-collection', stateWithRules(), { kind: 'connection', connection: local.id });

  it('ends with forget the formatting rules of shop.orders', () => {
    const dropped = planOf(
      dropCollection(context(), started({ database: 'shop', collection: 'orders', view: false }, counted)),
    );
    expect(stepTexts(dropped)).toEqual(['db.orders.drop()', 'forget the formatting rules of shop.orders']);
  });

  it('dropping a collection with formatting rules forgets them: a new collection with the same name has none', async () => {
    const given = await services();
    await treeActions(given)['tree.forget-colors']?.(at('shop', 'orders'), new AbortController().signal);
    expect(rulesOf(given, 'shop', 'orders')).toEqual([]);
    expect(rulesOf(given, 'shop', 'logs')).toEqual([rule]);
    expect(rulesOf(given, 'shop', 'orders', 'c-staging')).toEqual([rule]);
  });
});

describe('manage.drop-database', () => {
  it('dropping a database forgets the formatting rules of its collections', async () => {
    const context = contextOf('manage.drop-database', stateWithRules(), { kind: 'connection', connection: local.id });
    const collections = { buckets: [], entries: [{ name: 'orders', kind: 'collection', system: false }] };
    expect(stepTexts(planOf(dropDatabase(context, started({ database: 'shop' }, { collections }))))).toEqual([
      'db.getSiblingDB("shop").dropDatabase()',
      'forget the formatting rules of shop and its collections',
    ]);
    const given = await services();
    await treeActions(given)['tree.forget-colors']?.(
      { connection: 'c-local', database: 'shop' },
      new AbortController().signal,
    );
    expect(rulesOf(given, 'shop', 'logs')).toEqual([]);
    expect(rulesOf(given, 'crm', 'users')).toEqual([rule]);
  });
});

describe('gridfs.drop-bucket', () => {
  it('ends with forget the formatting rules of the GridFS bucket shop.fs, and forgets those of shop.fs.files', async () => {
    const context = contextOf('gridfs.drop-bucket', stateWithRules(), {
      kind: 'database',
      connection: local.id,
      database: 'shop',
    });
    const dropped = planOf(
      dropBucket.plan(context, { args: { connection: local.id, database: 'shop', bucket: 'fs' }, count: 2 }),
    );
    expect(stepTexts(dropped).at(-1)).toBe('forget the formatting rules of the GridFS bucket shop.fs');
    const given = await services();
    const args: Json = { connection: 'c-local', database: 'shop', bucket: 'fs' };
    await treeActions(given)['tree.forget-colors']?.(args, new AbortController().signal);
    expect(rulesOf(given, 'shop', 'fs.files')).toEqual([]);
    expect(rulesOf(given, 'shop', 'orders')).toEqual([rule]);
  });
});

describe('manage.rename-collection', () => {
  it('after Rename collection… to orders_2024 the rules of shop.orders are those of shop.orders_2024', async () => {
    const given = await services();
    await startSavedQueries(given);
    await moveCollection(given, {
      connection: connectionId('c-local'),
      database: 'shop',
      from: 'orders',
      to: 'orders_2024',
    });
    expect(rulesOf(given, 'shop', 'orders_2024')).toEqual([rule]);
    expect(rulesOf(given, 'shop', 'orders')).toEqual([]);
  });
});

describe('connection.remove', () => {
  it('lists the formatting rules of the connection and deletes them; those of other connections stay', async () => {
    const outcome = removeConnection(contextOf('connection.remove', stateWithRules(), on(local)), { counts: {} });
    if (outcome.kind !== 'run' || outcome.plan.danger.kind !== 'confirm') {
      throw new Error('no confirmation');
    }
    expect(outcome.plan.danger.text.split('\n')).toContain('4 formatting rules');
    const step = outcome.plan.steps.find((each) => each.kind === 'app' && each.action === 'table.forget-formatting');
    expect(step?.text).toBe('delete the 4 formatting rules of Local');
    const given = await services();
    await tableActions(given)['table.forget-formatting']?.({ connection: 'c-local' }, new AbortController().signal);
    expect(rulesOf(given, 'crm', 'users')).toEqual([]);
    expect(rulesOf(given, 'shop', 'orders', 'c-staging')).toEqual([rule]);
  });
});
