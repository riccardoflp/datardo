/**
 * The keys tab and the key tab driven through the window (`key.show`, `key.scan`, `key.select`, `key.inspect`,
 * `key.open`, `key.delete`, `key.switch-database`): a Redis database opened from the tree, scanned with a pattern
 * typed and a type chosen, its rows selected with the keyboard alone, a key inspected, opened in a tab of its own and
 * deleted. Each page is checked for accessibility in both themes. The keys are `m13:ui-<run>:*` in database 13 of the
 * shared Redis; each test closes every Datardo it started, even when it fails.
 */
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createClient } from 'redis';
import { expectAccessible, startApp, type StartedApp } from '../app';

const redisUrl = process.env['DATARDO_TEST_REDIS_URL'] ?? 'redis://127.0.0.1:6390';
/** The database of the shared Redis these tests may use (testing.md): only the keys of this run are written. */
const redisDatabase = 13;
const prefix = `m13:ui-${randomBytes(4).toString('hex')}`;
const running: StartedApp[] = [];

function newRedisClient() {
  return createClient({ url: redisUrl, database: redisDatabase });
}

async function withRedis(use: (client: ReturnType<typeof newRedisClient>) => Promise<void>): Promise<void> {
  const client = newRedisClient();
  await client.connect();
  try {
    await use(client);
  } finally {
    client.destroy();
  }
}

test.beforeAll(async () => {
  await withRedis(async (client) => {
    await client.set(`${prefix}:orders:1`, 'x');
    await client.set(`${prefix}:orders:2`, 'y', { PX: 7_200_000 });
    await client.hSet(`${prefix}:users:7`, { name: 'Ada' });
    await client.rPush(`${prefix}:queue`, ['a', 'b']);
  });
});

test.afterAll(async () => {
  await withRedis(async (client) => {
    for await (const keys of client.scanIterator({ MATCH: `${prefix}:*`, COUNT: 1000 })) {
      if (keys.length > 0) {
        await client.unlink(keys);
      }
    }
  });
});

test.afterEach(async () => {
  for (const started of running.splice(0)) {
    await started.close().catch((error: unknown) => {
      // Already closed by the test: nothing is left running.
      console.warn('Datardo was already closed:', error);
    });
  }
});

async function launch(): Promise<Page> {
  const started = await startApp();
  running.push(started);
  await expect(started.window.getByRole('navigation', { name: 'Rail' })).toBeVisible();
  return started.window;
}

async function addRedis(window: Page): Promise<void> {
  const url = new URL(redisUrl);
  await window.evaluate(async () => {
    const bridge = (globalThis as unknown as { datardo: { start: (intent: unknown) => Promise<unknown> } }).datardo;
    await bridge.start({ feature: 'connection.add', target: { kind: 'app' }, args: 'redis' });
  });
  const form = window.getByRole('form', { name: 'New connection' });
  await form.locator('[data-field="name"]').fill('Cache');
  await form.locator('[data-field="host"]').fill(url.hostname);
  await form.locator('[data-field="port"]').fill(url.port);
  await form.getByRole('button', { name: 'Save and connect' }).click();
  await expect(form).toBeHidden();
}

/** Opens the keys tab of db13 from the tree, and scans the keys of this run. */
async function openKeys(window: Page): Promise<void> {
  const db13 = window.getByRole('tree', { name: 'Tree' }).getByRole('treeitem', { name: /^db13, / });
  await db13.click();
  const pattern = window.getByRole('textbox', { name: 'Pattern' });
  await expect(pattern).toBeVisible();
  await pattern.fill(`${prefix}:*`);
  await pattern.press('Enter');
}

function grid(window: Page) {
  return window.getByRole('grid', { name: 'Keys' });
}

function row(window: Page, name: string) {
  return grid(window)
    .getByRole('row')
    .filter({ has: window.getByRole('gridcell', { name, exact: true }) });
}

async function bothThemes(window: Page): Promise<void> {
  for (const theme of ['light', 'dark']) {
    await window.evaluate((name) => {
      document.documentElement.dataset['theme'] = name;
    }, theme);
    await expectAccessible(window);
  }
}

test.describe('key.show', () => {
  test('a database opened from the tree scans the pattern typed, and the type chosen, in both themes', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    await openKeys(window);
    await expect(row(window, `${prefix}:orders:1`)).toBeVisible();
    await expect(grid(window).getByRole('row')).toHaveCount(5);
    await window.getByRole('combobox', { name: 'Type' }).selectOption('hash');
    await expect(row(window, `${prefix}:users:7`)).toBeVisible();
    await expect(grid(window).getByRole('row')).toHaveCount(2);
    await bothThemes(window);
  });
});

test.describe('key.select', () => {
  test('rows are selected with the arrows, and the inspector island shows the key selected', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    await openKeys(window);
    await expect(row(window, `${prefix}:orders:1`)).toBeVisible();
    await grid(window).focus();
    await window.keyboard.press('ArrowDown');
    await expect(grid(window).getByRole('row', { selected: true })).toHaveCount(1);
    await window.keyboard.press('Shift+ArrowDown');
    await expect(grid(window).getByRole('row', { selected: true })).toHaveCount(2);
    await expect(window.getByRole('toolbar', { name: '2 keys selected' })).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(grid(window).getByRole('row', { selected: true })).toHaveCount(0);
    await bothThemes(window);
  });
});

test.describe('key.inspect', () => {
  test('the key selected shows its type in the inspector island', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    await openKeys(window);
    await row(window, `${prefix}:users:7`).click();
    const inspector = window.getByRole('complementary', { name: 'Inspector' });
    await expect(inspector.getByText(`${prefix}:users:7`).last()).toBeVisible();
    await expect(inspector.getByText('Hash', { exact: true })).toBeVisible();
    await bothThemes(window);
  });
});

test.describe('key.open', () => {
  test('Enter on a row opens the key in a tab of its own, with its toolbar', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    await openKeys(window);
    await row(window, `${prefix}:queue`).click();
    await grid(window).press('Enter');
    const toolbar = window.getByRole('toolbar', { name: `${prefix}:queue` });
    await expect(toolbar.getByRole('button', { name: 'Rename…' })).toBeVisible();
    await bothThemes(window);
  });
});

test.describe('key.delete', () => {
  test('Delete on a row asks, deletes the key, and the row is gone after the scan again', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    await openKeys(window);
    await row(window, `${prefix}:orders:1`).click();
    await grid(window).press('Delete');
    const dialog = window.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expectAccessible(window);
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(row(window, `${prefix}:orders:1`)).toHaveCount(0);
    await expect(row(window, `${prefix}:orders:2`)).toBeVisible();
  });
});

test.describe('key.switch-database', () => {
  test('the database of the path lists the databases, and another one opens its keys tab', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    await openKeys(window);
    const path = window.locator('[data-feature="nav.path@scope-bar"]');
    await path.getByRole('button', { name: 'db13' }).click();
    const menu = window.getByRole('menu', { name: 'db13' });
    await expect(menu.getByRole('menuitem')).toHaveCount(16);
    await expectAccessible(window);
    await menu.getByRole('menuitem', { name: /^db14 · / }).click();
    await expect(path.getByRole('button', { name: 'db14' })).toBeVisible();
    await expect(window.getByRole('textbox', { name: 'Pattern' })).toHaveValue('');
  });
});
