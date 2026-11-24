import { describe, expect, it } from 'vitest';
import {
  colorOf,
  droppedColors,
  iconColor,
  renamedColors,
  sharedColor,
  withColor,
} from '../../../src/features/tree/color-of';
import { contentsOf } from '../../../src/features/tree/list-collections';
import { view as mongodbView } from '../../../src/features/tree/mongodb';
import { view as pinnedView } from '../../../src/features/tree/pinned';
import { view as redisView } from '../../../src/features/tree/redis';
import { afterPage, freshScan } from '../../../src/features/tree/scan-namespaces';
import * as setCollectionColor from '../../../src/features/tree/set-collection-color';
import * as setDatabaseColor from '../../../src/features/tree/set-database-color';
import { isOffered } from '../../../src/features/tree/commands';
import { colorMapOf } from '../../../src/shared/color';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Answers, Outcome, Plan } from '../../../src/shared/feature';
import type { Question } from '../../../src/shared/question';
import type { AppState } from '../../../src/shared/state';
import { tabId } from '../../../src/shared/ids';
import type { TabShows } from '../../../src/shared/state/tabs';
import { bytes, contextOf, inputOf, mongoConnection, nodesOf, redisConnection, stateOf } from './context';

/** Local, red, with the maps of the worked examples. */
const local = mongoConnection({
  color: 'red',
  databaseColors: { shop: 'teal', archive: 'none' },
  collectionColors: { 'shop.orders': '#1e90ff', 'shop.logs': 'none', 'media.fs.files': 'pink' },
});
const cache = redisConnection({ databaseColors: { '3': 'green' } });

function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${outcome.kind}`);
  }
  return outcome.plan;
}

function questionOf(outcome: Outcome): Question {
  if (outcome.kind !== 'ask') {
    throw new Error(`Expected a question, got ${outcome.kind}`);
  }
  return outcome.question;
}

function choicesOf(outcome: Outcome): readonly { label: string; description?: string; value: string }[] {
  const field = questionOf(outcome).fields[0];
  return field?.kind === 'pick-one' ? field.choices : [];
}

function stateWithTab(connection: ConnectionView, shows?: TabShows): AppState {
  const state = stateOf({ connections: [connection] });
  const id = tabId('t-1');
  return shows === undefined
    ? state
    : { ...state, tabs: { ...state.tabs, tabs: [{ id, shows, loaded: true, lastActive: 0 }], active: id } };
}

function planCollection(connection: ConnectionView, args: Record<string, unknown>, more: Answers = {}): Outcome {
  const context = contextOf('tree.set-collection-color', stateOf({ connections: [connection] }));
  return setCollectionColor.plan(context, { args: { connection: connection.id, ...args }, ...more });
}

function planDatabase(connection: ConnectionView, args: Record<string, unknown>, more: Answers = {}): Outcome {
  const context = contextOf('tree.set-database-color', stateOf({ connections: [connection] }));
  return setDatabaseColor.plan(context, { args: { connection: connection.id, ...args }, ...more });
}

describe('tree.color-of', () => {
  it('gives the worked examples on Local', () => {
    const examples = [
      [{ kind: 'collection', database: 'shop', collection: 'orders' }, '#1e90ff', 'collection', '#1e90ff'],
      [{ kind: 'collection', database: 'shop', collection: 'users' }, 'teal', 'database', 'teal'],
      [{ kind: 'collection', database: 'shop', collection: 'logs' }, undefined, 'collection', undefined],
      [{ kind: 'database', database: 'shop' }, 'teal', 'database', 'teal'],
      [{ kind: 'collection', database: 'crm', collection: 'users' }, 'red', 'connection', undefined],
      [{ kind: 'database', database: 'crm' }, 'red', 'connection', undefined],
      [{ kind: 'collection', database: 'archive', collection: 'old' }, undefined, 'database', undefined],
      [{ kind: 'bucket', database: 'media', bucket: 'fs' }, 'pink', 'collection', 'pink'],
      [{ kind: 'collection', database: 'media', collection: 'fs.chunks' }, 'red', 'connection', undefined],
    ] as const;
    for (const [target, color, from, icon] of examples) {
      expect(colorOf(local, target), JSON.stringify(target)).toEqual({
        ...(color === undefined ? {} : { color }),
        from,
      });
      expect(iconColor(local, target), JSON.stringify(target)).toBe(icon);
    }
  });

  it('moves the entry of a renamed collection, and leaves the map as it is when there is none', () => {
    const colors = local.collectionColors;
    const renamed = renamedColors(colors, 'shop', 'orders', 'orders_2024');
    expect(renamed?.['shop.orders_2024']).toBe('#1e90ff');
    expect(renamed?.['shop.orders']).toBeUndefined();
    expect(renamedColors(colors, 'shop', 'users', 'clients')).toBe(colors);
  });

  it('forgets the entries of a dropped bucket and database, and leaves out a map left empty', () => {
    const bucket = droppedColors(local, { kind: 'bucket', database: 'media', bucket: 'fs' });
    expect(bucket.collectionColors?.['media.fs.files']).toBeUndefined();
    const shop = droppedColors(local, { kind: 'database', database: 'shop' });
    expect(shop.databaseColors).toEqual({ archive: 'none' });
    expect(shop.collectionColors).toEqual({ 'media.fs.files': 'pink' });
    const archive = droppedColors(shop, { kind: 'database', database: 'archive' });
    expect(archive.databaseColors).toBeUndefined();
    const unchanged = droppedColors(local, { kind: 'collection', database: 'crm', collection: 'users' });
    expect(unchanged.collectionColors).toBe(local.collectionColors);
    expect(unchanged.databaseColors).toBe(local.databaseColors);
  });

  it('sets an entry, removes it, and leaves out a map left empty', () => {
    expect(withColor(undefined, 'shop.orders', 'teal')).toEqual({ 'shop.orders': 'teal' });
    expect(withColor({ 'shop.orders': 'teal' }, 'shop.orders', undefined)).toBeUndefined();
    const colors = { shop: 'teal' } as const;
    expect(withColor(colors, 'shop', 'teal')).toBe(colors);
  });

  it('gives a Redis database, its namespaces and keys the color of its number', () => {
    expect(colorOf(cache, { kind: 'database', database: 3 })).toEqual({ color: 'green', from: 'database' });
    expect(colorOf(cache, { kind: 'database', database: 0 })).toEqual({ from: 'connection' });
  });

  it('keeps only the entries of a valid key and color when it reads the maps', () => {
    expect(colorMapOf({ 'a.b': 'red', shop: 'lime' }, 'databases')).toBeUndefined();
    expect(colorMapOf({ orders: 'red', 'shop.orders': '#ABC' }, 'collections')).toEqual({ 'shop.orders': '#aabbcc' });
    expect(colorMapOf({ shop: 'none', '3': 'Green' }, 'databases')).toEqual({ shop: 'none', '3': 'green' });
  });

  it('gives a comparison the color both sides share, or the only one there is, or none', () => {
    expect(sharedColor(['teal', 'teal'])).toBe('teal');
    expect(sharedColor(['teal', undefined])).toBe('teal');
    expect(sharedColor(['teal', 'pink'])).toBeUndefined();
    expect(sharedColor([])).toBeUndefined();
  });
});

describe('tree.mongodb', () => {
  it('draws the icons of shop teal, orders #1e90ff, users teal, logs plain and crm plain; no name changes color', () => {
    const connection = mongoConnection({
      color: 'red',
      databaseColors: { shop: 'teal' },
      collectionColors: { 'shop.orders': '#1e90ff', 'shop.logs': 'none' },
    });
    const contents = contentsOf([
      { name: 'orders', type: 'collection' },
      { name: 'users', type: 'collection' },
      { name: 'logs', type: 'collection' },
      { name: 'fs.files', type: 'collection' },
      { name: 'fs.chunks', type: 'collection' },
    ]);
    const island = {
      mongodb: {
        databases: { kind: 'loaded', value: [{ name: 'crm' }, { name: 'shop' }] },
        contents: {
          shop: { kind: 'loaded', value: contents },
          crm: { kind: 'loaded', value: contentsOf([{ name: 'users', type: 'collection' }]) },
        },
        counts: {},
      },
      expanded: ['database:shop', 'database:crm'],
    } as const;
    const nodes = nodesOf(mongodbView(inputOf({ connections: [connection], island }), connection));
    const colors = Object.fromEntries(nodes.map((node) => [node.id, node.color ?? 'plain']));
    expect(colors).toMatchObject({
      'database:shop': 'teal',
      'database:crm': 'plain',
    });
    const byName = (parent: string, name: string): string =>
      nodes.find((node) => node.parent === parent && node.name === name)?.color ?? 'plain';
    expect(byName('database:shop', 'orders')).toBe('#1e90ff');
    expect(byName('database:shop', 'users')).toBe('teal');
    expect(byName('database:shop', 'logs')).toBe('plain');
    expect(byName('database:shop', 'fs')).toBe('teal');
    expect(byName('database:crm', 'users')).toBe('plain');
  });
});

describe('tree.redis', () => {
  it('draws db3 and its namespaces green on a red connection, and db0 and its namespaces plain', () => {
    const connection = redisConnection({ color: 'red', databaseColors: { '3': 'green' } });
    const databases = Array.from({ length: 16 }, (_, number) => ({
      number,
      keys: number === 0 || number === 3 ? 2 : 0,
      expires: 0,
      averageTtlMs: 0,
    }));
    const scan = {
      scan: { ...afterPage(freshScan, { cursor: '0', keys: bytes('orders:1', 'orders:2') }), ended: 'whole' as const },
    };
    const island = {
      redis: { databases: { kind: 'loaded', value: { count: 16, databases } }, scans: { '0': scan, '3': scan } },
      expanded: ['redis-database:0', 'redis-database:3'],
    } as const;
    const nodes = nodesOf(redisView(inputOf({ connections: [connection], island }), connection));
    const colors = nodes.map((node) => `${node.parent ?? ''}>${node.name}:${node.color ?? 'plain'}`);
    expect(colors.filter((line) => line.includes('db3') || line.startsWith('redis-database:3'))).toEqual([
      expect.stringContaining('db3:green'),
      'redis-database:3>orders:green',
    ]);
    expect(colors.filter((line) => line.includes('db0') || line.startsWith('redis-database:0'))).toEqual([
      expect.stringContaining('db0:plain'),
      'redis-database:0>orders:plain',
    ]);
  });
});

describe('tree.pinned', () => {
  it('gives a pinned collection, namespace, key and saved query the color of their node, and a page none', () => {
    const pins = [
      { kind: 'collection', database: 'shop', collection: 'orders' },
      { kind: 'collection', database: 'shop', collection: 'users' },
      { kind: 'saved-query', database: 'shop', collection: 'orders', name: 'Late' },
      { kind: 'page', page: 'monitor', title: 'Monitor' },
    ] as const;
    const nodes = pinnedView(inputOf({ connections: [local], pins }));
    expect(nodes.map((node) => node.color ?? 'plain')).toEqual(['#1e90ff', 'teal', '#1e90ff', 'plain']);
    const redisPins = [
      { kind: 'namespace', database: 3, namespace: 'orders:' },
      { kind: 'key', database: 3, keyHex: '6f72646572733a3432' },
      { kind: 'namespace', database: 0, namespace: 'orders:' },
    ] as const;
    const redisNodes = pinnedView(inputOf({ connections: [cache], pins: redisPins }));
    expect(redisNodes.map((node) => node.color ?? 'plain')).toEqual(['green', 'green', 'plain']);
  });
});

describe('tree.set-collection-color', () => {
  it('asks the color of orders: the presets, None, Connection’s color described red, Custom color…', () => {
    const red = mongoConnection({ color: 'red' });
    const question = questionOf(planCollection(red, { database: 'shop', collection: 'orders' }));
    expect(question.title).toBe('Color of orders');
    const field = question.fields[0];
    expect(field?.kind === 'pick-one' ? field.label : '').toBe('Shown on its icon in the tree and on its tabs');
    const choices = choicesOf(planCollection(red, { database: 'shop', collection: 'orders' }));
    expect(choices.map((choice) => choice.label).slice(-4)).toEqual([
      'Gray',
      'None',
      "Connection's color",
      'Custom color…',
    ]);
    expect(choices.find((choice) => choice.value === 'none')?.description).toBe('Plain, even in a colored database');
    expect(choices.find((choice) => choice.value === 'follow')?.description).toBe('red · current');
  });

  it('writes teal on shop.orders of Local, with its step', () => {
    const plan = planOf(
      planCollection(mongoConnection(), { database: 'shop', collection: 'orders' }, { color: 'teal' }),
    );
    expect(plan.steps).toEqual([
      {
        kind: 'app',
        action: 'tree.set-color',
        args: { connection: 'c-local', map: 'collectionColors', key: 'shop.orders', color: 'teal' },
        text: 'set the color of shop.orders on Local to teal',
      },
    ]);
    expect(plan.danger.kind).toBe('none');
    expect(plan.undo).toEqual({ cannot: 'Choose the previous color again.' });
  });

  it('keeps the color of the bucket fs of media under media.fs.files', () => {
    const plan = planOf(planCollection(mongoConnection(), { database: 'media', bucket: 'fs' }, { color: 'pink' }));
    expect(plan.steps[0]).toMatchObject({
      args: { map: 'collectionColors', key: 'media.fs.files', color: 'pink' },
      text: 'set the color of the GridFS bucket media.fs on Local to pink',
    });
    expect(questionOf(planCollection(mongoConnection(), { database: 'media', bucket: 'fs' })).title).toBe(
      'Color of fs',
    );
  });

  it('writes none for None in the teal database shop', () => {
    const teal = mongoConnection({ databaseColors: { shop: 'teal' } });
    const plan = planOf(planCollection(teal, { database: 'shop', collection: 'orders' }, { color: 'none' }));
    expect(plan.steps[0]).toMatchObject({
      args: { color: 'none' },
      text: 'set the color of shop.orders on Local to none',
    });
  });

  it("offers Database's color described teal in place of Connection's color, and removes the entry with it", () => {
    const teal = mongoConnection({ databaseColors: { shop: 'teal' }, collectionColors: { 'shop.orders': 'pink' } });
    const outcome = planCollection(teal, { database: 'shop', collection: 'orders' });
    const field = questionOf(outcome).fields[0];
    expect(field?.kind === 'pick-one' ? field.label : '').toBe(
      'Shown on its icon in the tree and on its tabs, instead of the color of the database shop',
    );
    const choices = choicesOf(outcome);
    expect(choices.map((choice) => choice.label)).toContain("Database's color");
    expect(choices.map((choice) => choice.label)).not.toContain("Connection's color");
    expect(choices.find((choice) => choice.value === 'follow')?.description).toBe('teal');
    const plan = planOf(planCollection(teal, { database: 'shop', collection: 'orders' }, { color: 'follow' }));
    expect(plan.steps[0]).toMatchObject({
      args: { key: 'shop.orders', color: null },
      text: 'remove the color of shop.orders on Local',
    });
  });

  it('opens Choose a color for Custom color…, applies #1e90ff, then describes Custom color… with it', () => {
    const red = mongoConnection({ color: 'red' });
    const dialog = questionOf(planCollection(red, { database: 'shop', collection: 'orders' }, { color: 'custom' }));
    expect(dialog).toMatchObject({ title: 'Choose a color', element: 'connection.custom-color@dialog' });
    expect(dialog.about).toEqual({ name: 'orders', start: 'red' });
    const applied = planCollection(
      red,
      { database: 'shop', collection: 'orders' },
      { color: 'custom', customColor: '#1E90FF' },
    );
    expect(planOf(applied).steps[0]).toMatchObject({ args: { color: '#1e90ff' } });
    const custom = mongoConnection({ collectionColors: { 'shop.orders': '#1e90ff' } });
    const last = choicesOf(planCollection(custom, { database: 'shop', collection: 'orders' })).at(-1);
    expect(last).toMatchObject({ label: 'Custom color…', description: '#1e90ff · current' });
  });

  it('starts Choose a color on Red for a plain collection of a red connection, and on Blue with no color anywhere', () => {
    const red = mongoConnection({ color: 'red' });
    const args = { database: 'shop', collection: 'orders' };
    expect(questionOf(planCollection(red, args, { color: 'custom' })).about).toMatchObject({ start: 'red' });
    expect(questionOf(planCollection(mongoConnection(), args, { color: 'custom' })).about).toMatchObject({
      start: 'blue',
    });
  });

  it('sets the color on a read-only connection, with an app step and nothing for the server', () => {
    const readOnly = mongoConnection({ readOnly: true });
    const plan = planOf(planCollection(readOnly, { database: 'shop', collection: 'orders' }, { color: 'teal' }));
    expect(plan.steps.map((step) => step.kind)).toEqual(['app']);
  });

  it('is offered from Go to with the collection tab of shop.orders active, and not without one', () => {
    const shows: TabShows = { kind: 'collection', connection: local.id, database: 'shop', collection: 'orders' };
    const state = stateWithTab(local, shows);
    expect(isOffered(state, 'tree.set-collection-color')).toBe(true);
    expect(isOffered(stateWithTab(local), 'tree.set-collection-color')).toBe(false);
    const asked = setCollectionColor.plan(contextOf('tree.set-collection-color', state), {});
    expect(questionOf(asked).title).toBe('Color of orders');
  });
});

describe('tree.set-database-color', () => {
  it('asks the color of shop: the presets, None described No color of its own and current, Custom color…', () => {
    const outcome = planDatabase(mongoConnection(), { database: 'shop' });
    expect(questionOf(outcome).title).toBe('Color of shop');
    const choices = choicesOf(outcome);
    expect(choices.map((choice) => choice.label).slice(-3)).toEqual(['Gray', 'None', 'Custom color…']);
    expect(choices.find((choice) => choice.value === 'none')?.description).toBe('No color of its own · current');
  });

  it('writes teal on shop of Local', () => {
    const plan = planOf(planDatabase(mongoConnection(), { database: 'shop' }, { color: 'teal' }));
    expect(plan.steps).toEqual([
      {
        kind: 'app',
        action: 'tree.set-color',
        args: { connection: 'c-local', map: 'databaseColors', key: 'shop', color: 'teal' },
        text: 'set the color of the database shop on Local to teal',
      },
    ]);
  });

  it('writes green on db3 of Cache local under "3"', () => {
    const outcome = planDatabase(redisConnection(), { database: 3 });
    expect(questionOf(outcome).title).toBe('Color of db3');
    const field = questionOf(outcome).fields[0];
    expect(field?.kind === 'pick-one' ? field.label : '').toBe(
      'Shown on its icon in the tree, and on its namespaces and its tabs',
    );
    const plan = planOf(planDatabase(redisConnection(), { database: 3 }, { color: 'green' }));
    expect(plan.steps[0]).toMatchObject({
      args: { connection: 'c-cache', map: 'databaseColors', key: '3', color: 'green' },
      text: 'set the color of db3 on Cache local to green',
    });
  });

  it('removes the entry for None, and describes an entry none read from a file as None and current', () => {
    const teal = mongoConnection({ databaseColors: { shop: 'teal' } });
    expect(planOf(planDatabase(teal, { database: 'shop' }, { color: 'none' })).steps[0]).toMatchObject({
      args: { color: null },
      text: 'remove the color of the database shop on Local',
    });
    const none = mongoConnection({ databaseColors: { shop: 'none' } });
    const choices = choicesOf(planDatabase(none, { database: 'shop' }));
    expect(choices.find((choice) => choice.value === 'none')?.description).toBe('No color of its own · current');
  });

  it("offers Database's color described none on orders when shop's own color is None", () => {
    const none = mongoConnection({ color: 'red', databaseColors: { shop: 'none' } });
    const follow = choicesOf(planCollection(none, { database: 'shop', collection: 'orders' })).find(
      (choice) => choice.value === 'follow',
    );
    expect(follow).toMatchObject({ label: "Database's color", description: 'none · current' });
  });

  it('is offered from Go to on the database of the keys tab, and sets it on a read-only connection', () => {
    const readOnly = redisConnection({ readOnly: true });
    const shows: TabShows = { kind: 'keys', connection: readOnly.id, database: 3, separator: ':' };
    const state = stateWithTab(readOnly, shows);
    expect(isOffered(state, 'tree.set-database-color')).toBe(true);
    const plan = planOf(setDatabaseColor.plan(contextOf('tree.set-database-color', state), { color: 'green' }));
    expect(plan.steps.map((step) => step.kind)).toEqual(['app']);
  });
});
