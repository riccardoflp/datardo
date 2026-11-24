/**
 * Excluding from searches and selecting several nodes, driven through the window (`tree.exclude-from-searches`,
 * `tree.select`, `tree.mongodb`, `tree.keyboard`, `tree.menu-mongodb`, `connection.menu`, `home.card`): a node
 * excluded from its context menu is dimmed and says **excluded**; several nodes selected with `Ctrl+click` and with
 * `Shift+Down` are excluded together from the menu of one of them; the tree is used from the keyboard alone and
 * checked for accessibility in both themes. Each test closes every Datardo it started, even when it fails.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expectAccessible, firstWindow } from '../app';

let mongo: MongoMemoryServer | undefined;
let folder: string;
const running: ElectronApplication[] = [];

async function seedMongo(uri: string): Promise<void> {
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const shop = client.db('shop');
    await shop.collection('logs').insertMany([{ n: 1 }, { n: 2 }]);
    await shop.collection('orders').insertMany([{ n: 1 }, { n: 2 }, { n: 3 }]);
    await shop.collection('users').insertMany([{ name: 'Ada' }, { name: 'Bob' }]);
    await client.db('crm').collection('people').insertOne({ name: 'Bob' });
  } finally {
    await client.close();
  }
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  const binary = process.env['MONGOMS_SYSTEM_BINARY'];
  mongo = await MongoMemoryServer.create(
    binary === undefined || binary === '' ? {} : { binary: { systemBinary: binary } },
  );
  await seedMongo(mongo.getUri());
});

test.afterAll(async () => {
  await mongo?.stop();
});

test.beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-ui-exclusions-'));
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

function treeOf(window: Page) {
  return window.getByRole('tree', { name: 'Tree' });
}

function node(window: Page, name: string | RegExp) {
  return treeOf(window).getByRole('treeitem', { name, exact: typeof name === 'string' });
}

function database(window: Page, name: string, state: 'collapsed' | 'expanded') {
  return node(window, new RegExp(`^${name}, (?:[^,]+, )?database, ${state}$`, 'u'));
}

/** What the saved connection Local keeps of its exclusions, read from `connections.json`. */
async function savedExclusions(): Promise<unknown> {
  const text = await readFile(join(folder, 'connections.json'), 'utf8').catch(() => '{"connections":[]}');
  const file = JSON.parse(text) as {
    connections: { name: string; exclusions?: unknown; excluded?: unknown }[];
  };
  const local = file.connections.find((each) => each.name === 'Local');
  return { exclusions: local?.exclusions, excluded: local?.excluded };
}

async function bothThemes(window: Page): Promise<void> {
  for (const theme of ['light', 'dark']) {
    await window.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
    await expectAccessible(window);
  }
}

async function shopExpanded(window: Page): Promise<void> {
  await addMongo(window);
  await database(window, 'shop', 'collapsed').click();
  await expect(database(window, 'shop', 'expanded')).toBeVisible();
}

test.describe('tree.exclude-from-searches', () => {
  test('a collection excluded from its menu is dimmed, says excluded, and its menu offers Include in searches', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await shopExpanded(window);
    await node(window, 'logs, 2 documents, collection').click({ button: 'right' });
    await window.getByRole('menu').getByRole('menuitem', { name: 'Exclude from searches' }).click();
    const excluded = node(window, 'logs, excluded, 2 documents, collection');
    await expect(excluded).toBeVisible();
    await expect(excluded).toHaveAttribute('data-dimmed', 'true');
    await expect.poll(savedExclusions).toEqual({ exclusions: ['shop.logs'], excluded: undefined });
    await excluded.focus();
    await window.keyboard.press('Shift+F10');
    const menu = window.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Include in searches' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Exclude from searches' })).toHaveCount(0);
    await window.keyboard.press('Escape');
    await bothThemes(window);
    await excluded.click({ button: 'right' });
    await window.getByRole('menu').getByRole('menuitem', { name: 'Include in searches' }).click();
    await expect(node(window, 'logs, 2 documents, collection')).toBeVisible();
    await expect.poll(savedExclusions).toEqual({ exclusions: undefined, excluded: undefined });
  });

  test('the menu of the connection excludes it as a whole, and its card says so', async () => {
    const window = await launch();
    await addMongo(window);
    await window.locator('[data-feature="connection.menu@connection-island"]').first().click();
    await window.getByRole('menuitem', { name: 'Exclude from searches' }).click();
    await expect.poll(savedExclusions).toEqual({ exclusions: undefined, excluded: true });
    await expect(database(window, 'shop', 'collapsed')).not.toHaveAttribute('data-dimmed', 'true');
  });
});

test.describe('tree.select', () => {
  test('Ctrl+click selects two collections; the menu of one excludes both, and the tree says it can select several', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await shopExpanded(window);
    await expect(treeOf(window)).toHaveAttribute('aria-multiselectable', 'true');
    // A click on users selects it alone and opens its tab; Ctrl+click on orders adds it and opens nothing.
    await node(window, 'users, 2 documents, collection').click();
    await expect(window.getByRole('tab', { name: /users/u })).toHaveCount(1);
    await node(window, 'orders, 3 documents, collection').click({ modifiers: ['ControlOrMeta'] });
    await expect(node(window, 'orders, 3 documents, collection')).toHaveAttribute('aria-selected', 'true');
    await expect(node(window, 'users, 2 documents, collection')).toHaveAttribute('aria-selected', 'true');
    await expect(database(window, 'shop', 'expanded')).toHaveAttribute('aria-selected', 'false');
    await expect(window.getByRole('tab', { name: /orders/u })).toHaveCount(0);
    await node(window, 'users, 2 documents, collection').click({ button: 'right' });
    const menu = window.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText(['Exclude from searches']);
    await menu.getByRole('menuitem', { name: 'Exclude from searches' }).click();
    await expect(node(window, 'orders, excluded, 3 documents, collection')).toBeVisible();
    await expect(node(window, 'users, excluded, 2 documents, collection')).toBeVisible();
    await expect.poll(savedExclusions).toEqual({ exclusions: ['shop.orders', 'shop.users'], excluded: undefined });
  });

  test('Shift+Down selects from the keyboard alone, Escape leaves the focused node alone', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await shopExpanded(window);
    await node(window, 'logs, 2 documents, collection').focus();
    await window.keyboard.press('Shift+ArrowDown');
    await window.keyboard.press('Shift+ArrowDown');
    await expect(node(window, 'users, 2 documents, collection')).toBeFocused();
    for (const name of [
      'logs, 2 documents, collection',
      'orders, 3 documents, collection',
      'users, 2 documents, collection',
    ]) {
      await expect(node(window, name)).toHaveAttribute('aria-selected', 'true');
    }
    await bothThemes(window);
    await window.keyboard.press('Shift+F10');
    await expect(window.getByRole('menu').getByRole('menuitem')).toHaveText(['Exclude from searches']);
    await window.keyboard.press('Escape');
    await expect(node(window, 'users, 2 documents, collection')).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(node(window, 'users, 2 documents, collection')).toHaveAttribute('aria-selected', 'true');
    await expect(node(window, 'orders, 3 documents, collection')).toHaveAttribute('aria-selected', 'false');
  });
});
