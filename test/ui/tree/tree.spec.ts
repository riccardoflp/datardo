/**
 * The tree island driven through the window (`tree.show`, `tree.mongodb`, `tree.redis`, `tree.filter`,
 * `tree.keyboard`, `tree.refresh`, `tree.count`, `tree.node-states`, `tree.menu-mongodb`, `tree.menu-redis`,
 * `tree.pages`, `tree.pinned`): a MongoDB server with a database of 300 collections, filtered by a text and moved
 * through with the arrows (M8's exit criterion), and a Redis server whose database is expanded and scanned. The tree is
 * used from the keyboard alone, and checked for accessibility in both themes. Each test closes every Datardo it
 * started, even when it fails.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from 'redis';
import { expectAccessible, firstWindow } from '../app';

const redisUrl = process.env['DATARDO_TEST_REDIS_URL'] ?? 'redis://127.0.0.1:6390';
/** A database of the shared Redis the tests may use (testing.md): only the keys of this run are written and deleted. */
const redisDatabase = 14;
const prefix = `tree-ui-${randomBytes(4).toString('hex')}`;

let mongo: MongoMemoryServer | undefined;
let folder: string;
const running: ElectronApplication[] = [];

async function seedMongo(uri: string): Promise<void> {
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const shop = client.db('shop');
    await shop.collection('orders').insertMany([{ n: 1 }, { n: 2 }, { n: 3 }]);
    await shop.collection('orders_archive').insertOne({ n: 0 });
    await shop.collection('users').insertOne({ name: 'Ada' });
    await shop.createCollection('active_orders', { viewOn: 'orders', pipeline: [] });
    await shop.collection('fs.files').insertOne({ filename: 'a.txt' });
    await shop.collection('fs.chunks').insertOne({ n: 0 });
    const many = client.db('many');
    for (let index = 0; index < 300; index += 1) {
      await many.createCollection(`c${String(index).padStart(3, '0')}`);
    }
  } finally {
    await client.close();
  }
}

function newRedisClient() {
  return createClient({ url: redisUrl, database: redisDatabase });
}

async function redisClient(): Promise<ReturnType<typeof newRedisClient>> {
  const client = newRedisClient();
  await client.connect();
  return client;
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  const binary = process.env['MONGOMS_SYSTEM_BINARY'];
  mongo = await MongoMemoryServer.create(
    binary === undefined || binary === '' ? {} : { binary: { systemBinary: binary } },
  );
  await seedMongo(mongo.getUri());
  const client = await redisClient();
  try {
    for (const name of ['orders:1', 'orders:2', 'orders:3', 'users:1', 'users:2', 'lonely']) {
      await client.set(`${prefix}:${name}`, 'x');
    }
  } finally {
    client.destroy();
  }
});

test.afterAll(async () => {
  const client = await redisClient();
  try {
    for await (const keys of client.scanIterator({ MATCH: `${prefix}:*`, COUNT: 1000 })) {
      if (keys.length > 0) {
        await client.unlink(keys);
      }
    }
  } finally {
    client.destroy();
  }
  await mongo?.stop();
});

test.beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-ui-tree-'));
});

test.afterEach(async () => {
  for (const app of running.splice(0)) {
    await app.close().catch((error: unknown) => {
      // Already closed by the test: nothing is left running.
      console.warn('Datardo was already closed:', error);
    });
  }
  await rm(folder, { recursive: true, force: true });
});

async function launch(): Promise<Page> {
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...(process.env as Record<string, string>),
      DATARDO_TEST_UPDATE_ADDRESS: 'http://127.0.0.1:9/',
      DATARDO_DATA: folder,
      DATARDO_TEST: '1',
    },
  });
  running.push(app);
  const window = await firstWindow(app);
  await window.setViewportSize({ width: 1440, height: 900 });
  await expect(window.getByRole('navigation', { name: 'Rail' })).toBeVisible();
  return window;
}

async function startFeature(window: Page, feature: string, args: unknown): Promise<void> {
  await window.evaluate(
    async ({ id, given }) => {
      const bridge = (globalThis as unknown as { datardo: { start: (intent: unknown) => Promise<unknown> } }).datardo;
      await bridge.start({ feature: id, target: { kind: 'app' }, args: given });
    },
    { id: feature, given: args },
  );
}

async function addMongo(window: Page): Promise<void> {
  await startFeature(window, 'connection.add', 'mongodb');
  const form = window.getByRole('form', { name: 'New connection' });
  await form.locator('[data-field="name"]').fill('Local');
  await form.locator('[data-field="connection-string"]').fill(mongo?.getUri() ?? '');
  await form.getByRole('button', { name: 'Save and connect' }).click();
  await expect(form).toBeHidden();
}

async function addRedis(window: Page): Promise<void> {
  const url = new URL(redisUrl);
  await startFeature(window, 'connection.add', 'redis');
  const form = window.getByRole('form', { name: 'New connection' });
  await form.locator('[data-field="name"]').fill('Cache');
  await form.locator('[data-field="host"]').fill(url.hostname);
  await form.locator('[data-field="port"]').fill(url.port);
  await form.getByRole('button', { name: 'Save and connect' }).click();
  await expect(form).toBeHidden();
}

function treeOf(window: Page) {
  return window.getByRole('tree', { name: 'Tree' });
}

function node(window: Page, name: string | RegExp) {
  return treeOf(window).getByRole('treeitem', { name, exact: typeof name === 'string' });
}

/** A database of MongoDB by its name and whether it is expanded, whatever size its line shows. */
function database(window: Page, name: string, state: 'collapsed' | 'expanded') {
  return node(window, new RegExp(`^${name}, (?:[^,]+, )?database, ${state}$`, 'u'));
}

async function bothThemes(window: Page): Promise<void> {
  for (const theme of ['light', 'dark']) {
    await window.evaluate((name) => {
      document.documentElement.dataset['theme'] = name;
    }, theme);
    await expectAccessible(window);
  }
}

test.describe('tree.show', () => {
  test('a MongoDB connection shows its databases, its collections with their counts, its pages, in both themes', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addMongo(window);
    const tree = treeOf(window);
    await expect(tree).toBeVisible();
    await expect(node(window, 'Databases')).toHaveAttribute('aria-expanded', 'true');
    await expect(database(window, 'shop', 'collapsed')).toBeVisible();
    await expect(node(window, 'Pages of Local')).toBeVisible();
    await expect(node(window, 'Overview, page')).toBeVisible();
    await database(window, 'shop', 'collapsed').click();
    await expect(database(window, 'shop', 'expanded')).toBeVisible();
    await expect(node(window, 'fs, GridFS bucket')).toBeVisible();
    await expect(node(window, 'orders, 3 documents, collection')).toBeVisible();
    await expect(node(window, 'active_orders, view')).toBeVisible();
    const names = await tree
      .getByRole('treeitem')
      .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label') ?? ''));
    const under = names.slice(
      names.findIndex((name) => /^shop, .*database, expanded$/u.test(name)) + 1,
      names.indexOf('Pages of Local'),
    );
    expect(under.map((name) => name.split(',')[0])).toEqual([
      'fs',
      'active_orders',
      'fs.chunks',
      'fs.files',
      'orders',
      'orders_archive',
      'users',
      'system.views',
    ]);
    await bothThemes(window);
  });
});

test.describe('tree.filter', () => {
  test('300 collections are filtered by a text and moved through with the arrows, from the keyboard alone', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addMongo(window);
    await expect(database(window, 'many', 'collapsed')).toBeVisible();
    await database(window, 'many', 'collapsed').focus();
    await window.keyboard.press('Control+f');
    const field = window.getByRole('searchbox', { name: 'Filter the tree' });
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('placeholder', 'e.g. orders, shop, shop.ord');
    await window.keyboard.type('c29');
    await expect(node(window, 'c299, 0 documents, collection')).toBeVisible();
    await expect(database(window, 'shop', 'collapsed')).toBeHidden();
    await expect(database(window, 'many', 'expanded')).toBeVisible();
    await expect(node(window, /^c\d{3}, \d+ documents, collection$/u)).toHaveCount(10);
    await expect(window.locator('[data-feature="tree.filter@tree"][aria-pressed="true"]')).toBeVisible();
    await window.keyboard.press('ArrowDown');
    await expect(database(window, 'many', 'expanded')).toBeFocused();
    await window.keyboard.press('ArrowDown');
    await expect(node(window, 'c290, 0 documents, collection')).toBeFocused();
    await window.keyboard.press('End');
    await expect(node(window, 'Scheduled tasks, page')).toBeFocused();
    await window.keyboard.press('Home');
    await expect(node(window, 'Databases')).toBeFocused();
    await bothThemes(window);
    await field.focus();
    await window.keyboard.press('Escape');
    await expect(field).toBeHidden();
    await expect(database(window, 'shop', 'collapsed')).toBeVisible();
    await expect(database(window, 'many', 'expanded')).toBeVisible();
  });

  test('a text that matches nothing says so', async () => {
    const window = await launch();
    await addMongo(window);
    await window.locator('[data-feature="tree.filter@tree"]').first().click();
    await window.getByRole('searchbox', { name: 'Filter the tree' }).fill('zzz');
    await expect(node(window, 'Nothing matches "zzz"')).toBeVisible();
  });
});

test.describe('tree.keyboard', () => {
  test('moves, expands, opens, types ahead and opens the menu with keys only', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addMongo(window);
    await database(window, 'shop', 'collapsed').focus();
    await window.keyboard.press('ArrowRight');
    await expect(database(window, 'shop', 'expanded')).toBeFocused();
    await expect(node(window, 'orders, 3 documents, collection')).toBeVisible();
    await window.keyboard.press('ArrowRight');
    await expect(node(window, 'fs, GridFS bucket')).toBeFocused();
    await window.keyboard.type('or');
    await expect(node(window, 'orders, 3 documents, collection')).toBeFocused();
    await window.keyboard.press('Shift+F10');
    const menu = window.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Open' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Pin' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Drop…' })).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(node(window, 'orders, 3 documents, collection')).toBeFocused();
    await window.keyboard.press('Enter');
    await expect(window.getByRole('tab', { name: /orders/u })).toBeVisible();
    await expect(node(window, 'orders, 3 documents, collection')).toHaveAttribute('aria-selected', 'true');
    await database(window, 'shop', 'expanded').focus();
    await window.keyboard.press('ArrowLeft');
    await expect(database(window, 'shop', 'collapsed')).toBeFocused();
    await window.keyboard.press('Delete');
    await expect(database(window, 'shop', 'collapsed')).toBeVisible();
  });
});

test.describe('tree.pinned', () => {
  test('items pinned from the menu are listed first, and moved with Alt+Up and by a drag (nav.pin)', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addMongo(window);
    await database(window, 'shop', 'collapsed').click();
    for (const name of ['orders, 3 documents, collection', 'users, 1 documents, collection']) {
      await node(window, name).focus();
      await window.keyboard.press('Shift+F10');
      await window.getByRole('menuitem', { name: 'Pin' }).click();
    }
    const pinned = () =>
      treeOf(window)
        .locator('[data-feature="nav.pin@tree"]')
        .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
    await expect.poll(pinned).toEqual(['orders, shop, pinned item', 'users, shop, pinned item']);
    await node(window, 'users, shop, pinned item').focus();
    await window.keyboard.press('Alt+ArrowUp');
    await expect.poll(pinned).toEqual(['users, shop, pinned item', 'orders, shop, pinned item']);
    await node(window, 'orders, shop, pinned item').dragTo(node(window, 'users, shop, pinned item'));
    await expect.poll(pinned).toEqual(['orders, shop, pinned item', 'users, shop, pinned item']);
    await bothThemes(window);
  });
});

test.describe('tree.refresh', () => {
  test('a collection created outside Datardo appears after Refresh, and the expanded nodes stay expanded', async () => {
    const window = await launch();
    await addMongo(window);
    await database(window, 'shop', 'collapsed').click();
    await expect(node(window, 'users, 1 documents, collection')).toBeVisible();
    const client = new MongoClient(mongo?.getUri() ?? '');
    await client.connect();
    await client.db('shop').createCollection('returns');
    await client.close();
    await expect(node(window, /^returns,/u)).toHaveCount(0);
    await window.locator('[data-feature="tree.refresh@tree"]').first().click();
    await expect(node(window, 'returns, 0 documents, collection')).toBeVisible();
    await expect(database(window, 'shop', 'expanded')).toBeVisible();
    await node(window, 'Databases').focus();
    await window.keyboard.press('Shift+F10');
    await window.getByRole('menuitem', { name: 'Collapse all' }).click();
    await expect(database(window, 'shop', 'collapsed')).toBeVisible();
  });
});

test.describe('tree.redis', () => {
  test('a Redis database is expanded with the keyboard and shows the namespaces of its keys', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    const db14 = node(window, /^db14, .* keys, database, collapsed$/u);
    await expect(db14).toBeVisible();
    await expect(node(window, /^db0, .* keys, database/u)).toBeVisible();
    await expect(node(window, 'Overview, page')).toBeVisible();
    await expect(node(window, 'Server, page')).toBeVisible();
    await db14.focus();
    await window.keyboard.press('ArrowRight');
    const namespace = node(window, new RegExp(`^${prefix}, .* keys, namespace`, 'u'));
    await expect(namespace).toBeVisible();
    await namespace.focus();
    await window.keyboard.press('ArrowRight');
    await expect(node(window, 'orders, 3 keys, namespace')).toBeVisible();
    await expect(node(window, 'users, 2 keys, namespace')).toBeVisible();
    await node(window, 'orders, 3 keys, namespace').focus();
    await window.keyboard.press('Shift+F10');
    await expect(window.getByRole('menu').getByRole('menuitem', { name: 'Refresh' })).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(node(window, 'orders, 3 keys, namespace')).toBeFocused();
    await bothThemes(window);
  });
});
