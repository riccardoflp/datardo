/**
 * The Server page driven through the window (`server.show`, `server.overview`, `server.clients`, `server.kill-client`,
 * `server.slow-log`, `server.memory`, `server.largest-keys`, `server.replication`, `server.config`): opened from the
 * tree and from Go to, its sections chosen with the keyboard, its tables and menus, and its section, **Auto** and
 * filters restored after a restart. Each section is checked for accessibility in both themes. The keys are
 * `m17:ui-<run>:*` in database 8 of the shared Redis; nothing is disconnected nor cleared on it.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from 'redis';
import { expectAccessible, firstWindow } from '../app';

const redisUrl = process.env['DATARDO_TEST_REDIS_URL'] ?? 'redis://127.0.0.1:6390';
/** The database of the shared Redis these tests may use (testing.md). */
const redisDatabase = 8;
const prefix = `m17:ui-${randomBytes(4).toString('hex')}`;
const running: ElectronApplication[] = [];
let folder = '';

function newRedisClient() {
  return createClient({ url: redisUrl, database: redisDatabase });
}

test.beforeAll(async () => {
  const client = newRedisClient();
  await client.connect();
  for (let index = 0; index < 50; index += 1) {
    await client.set(`${prefix}:small:${String(index)}`, 'x');
  }
  await client.set(`${prefix}:big`, 'y'.repeat(50_000));
  client.destroy();
});

test.afterAll(async () => {
  const client = newRedisClient();
  await client.connect();
  for await (const keys of client.scanIterator({ MATCH: `${prefix}:*`, COUNT: 1000 })) {
    if (keys.length > 0) {
      await client.unlink(keys);
    }
  }
  client.destroy();
});

test.beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-ui-server-'));
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

/** Starts Datardo on the test's data folder. */
async function launch(): Promise<{ readonly app: ElectronApplication; readonly window: Page }> {
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
  return { app, window };
}

async function quit(app: ElectronApplication): Promise<void> {
  running.splice(running.indexOf(app), 1);
  await app.close();
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

function serverNode(window: Page) {
  return window.getByRole('tree', { name: 'Tree' }).getByRole('treeitem', { name: /^Server, / });
}

function sections(window: Page) {
  return window.getByRole('tablist', { name: 'Sections of the Server page' });
}

async function openServer(window: Page): Promise<void> {
  await serverNode(window).click();
  await expect(sections(window).getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
}

async function bothThemes(window: Page): Promise<void> {
  for (const theme of ['light', 'dark']) {
    await window.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
    await expectAccessible(window);
  }
}

async function choose(window: Page, section: string): Promise<void> {
  const tab = sections(window).getByRole('tab', { name: section });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

test.describe('server.show', () => {
  test('Server opens one tab from the tree, on Overview; its sections are chosen with the arrows', async () => {
    test.setTimeout(120_000);
    const { window } = await launch();
    await addRedis(window);
    await openServer(window);
    await serverNode(window).click();
    await expect(window.locator('[role="tab"]', { hasText: /^Server$/u })).toHaveCount(1);
    await expect(window.getByRole('combobox', { name: 'Auto' })).toHaveValue('5');
    await expect(window.getByRole('button', { name: 'Version' })).toBeVisible();
    await bothThemes(window);
    await sections(window).getByRole('tab', { name: 'Overview' }).focus();
    await window.keyboard.press('ArrowRight');
    await expect(sections(window).getByRole('tab', { name: 'Clients' })).toHaveAttribute('aria-selected', 'true');
    await expect(sections(window).getByRole('tab', { name: 'Clients' })).toBeFocused();
  });

  test('Go to, Server: Slow log, opens the page on Slow log, also when it is open on another section', async () => {
    test.setTimeout(120_000);
    const { window } = await launch();
    await addRedis(window);
    await openServer(window);
    await window.keyboard.press('Control+k');
    await window.keyboard.type('>Server: Slow log');
    await expect(window.getByRole('option').first()).toContainText('Server: Slow log');
    await window.keyboard.press('Enter');
    await expect(sections(window).getByRole('tab', { name: 'Slow log' })).toHaveAttribute('aria-selected', 'true');
  });

  test('after a restart the restored tab shows the section, Auto and the filters it had', async () => {
    test.setTimeout(180_000);
    const first = await launch();
    await addRedis(first.window);
    await openServer(first.window);
    await choose(first.window, 'Clients');
    await first.window.getByRole('combobox', { name: 'Auto' }).selectOption('2');
    await first.window.getByRole('searchbox', { name: 'Filter by address, name, user or command' }).fill('datardo');
    await first.window.waitForTimeout(1500);
    await quit(first.app);
    const second = await launch();
    await expect(sections(second.window).getByRole('tab', { name: 'Clients' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(second.window.getByRole('combobox', { name: 'Auto' })).toHaveValue('2');
    await expect(
      second.window.getByRole('searchbox', { name: 'Filter by address, name, user or command' }),
    ).toHaveValue('datardo');
  });
});

test.describe('server.clients', () => {
  test('the page’s own row has its marks, and its Disconnect… is disabled with the reason', async () => {
    test.setTimeout(120_000);
    const { window } = await launch();
    await addRedis(window);
    await openServer(window);
    await choose(window, 'Clients');
    const grid = window.getByRole('grid', { name: 'Clients' });
    const own = grid.getByRole('row').filter({ hasText: 'this page' });
    await expect(own).toHaveCount(1);
    await expect(window.getByRole('status').filter({ hasText: / of [\d,]+ clients? · / })).toBeVisible();
    await bothThemes(window);
    await own.getByRole('button', { name: /^More / }).click();
    const item = window.getByRole('menuitem', { name: 'Disconnect…' });
    await expect(item).toHaveAttribute('aria-disabled', 'true');
    await expect(item).toHaveAttribute(
      'title',
      'This is the connection Datardo reads this page with. Use Disconnect in the connection island.',
    );
    await expect(item).toHaveAttribute('data-feature', 'server.kill-client@row-menu');
    await window.keyboard.press('Escape');
    await grid.focus();
    await window.keyboard.press('Escape');
    await expect(grid.getByRole('row', { selected: true })).toHaveCount(0);
  });
});

test.describe('server.slow-log', () => {
  test('the section says its threshold, has Clear… and the note on durations, in both themes', async () => {
    test.setTimeout(120_000);
    const { window } = await launch();
    await addRedis(window);
    await openServer(window);
    await choose(window, 'Slow log');
    await expect(window.getByText(/slowlog-log-slower-than/u).first()).toBeVisible();
    await expect(window.locator('[data-feature="server.slow-log-reset@toolbar"]')).toBeVisible();
    await expect(window.getByText(/^A duration is the time the server spent/u)).toBeVisible();
    await bothThemes(window);
  });
});

test.describe('server.memory', () => {
  test('the tiles, the overhead and the advice; nothing of the largest keys until it is asked', async () => {
    test.setTimeout(120_000);
    const { window } = await launch();
    await addRedis(window);
    await openServer(window);
    await choose(window, 'Memory');
    await expect(window.getByRole('button', { name: /^Allocated/u })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Advice of the server' })).toBeVisible();
    await expect(window.getByText(/^Find the keys that take the most memory/u)).toBeVisible();
    await bothThemes(window);
  });
});

test.describe('server.largest-keys', () => {
  test('Find largest keys on db8 lists its largest key first, and the row shows it in the inspector island', async () => {
    test.setTimeout(120_000);
    const { window } = await launch();
    await addRedis(window);
    await openServer(window);
    await choose(window, 'Memory');
    await window.getByRole('combobox', { name: 'Database' }).selectOption('8');
    await window.locator('[data-feature="server.largest-keys@toolbar"]').first().click();
    await expect(window.getByText(/^Examined all [\d,]+ keys of db8/u)).toBeVisible({ timeout: 60_000 });
    const grid = window.getByRole('grid', { name: 'Largest keys' });
    const first = grid.getByRole('row').nth(1);
    await expect(first).toContainText(`${prefix}:big`);
    await first.click();
    const inspector = window.getByRole('complementary', { name: 'Inspector' });
    await expect(inspector.getByText(`${prefix}:big`).last()).toBeVisible();
    await bothThemes(window);
  });
});

test.describe('server.replication', () => {
  test('a master with no replica says so, in both themes', async () => {
    test.setTimeout(120_000);
    const { window } = await launch();
    await addRedis(window);
    await openServer(window);
    await choose(window, 'Replication');
    await expect(window.getByText('No replica is connected to this server.')).toBeVisible();
    await bothThemes(window);
  });
});

test.describe('server.config', () => {
  test('the filter maxmem shows maxmemory, and nothing edits a value; in both themes', async () => {
    test.setTimeout(120_000);
    const { window } = await launch();
    await addRedis(window);
    await openServer(window);
    await choose(window, 'Configuration');
    const grid = window.getByRole('grid', { name: 'Configuration' });
    await expect(grid.getByRole('row').nth(1)).toBeVisible();
    await window.getByRole('searchbox', { name: 'Filter by parameter or value' }).fill('maxmem');
    await expect(grid.getByRole('gridcell', { name: 'maxmemory', exact: true })).toBeVisible();
    await expect(window.getByRole('status').filter({ hasText: / of [\d,]+ parameters · / })).toBeVisible();
    await grid.getByRole('gridcell', { name: 'maxmemory', exact: true }).dblclick();
    await expect(grid.locator('input, textarea')).toHaveCount(0);
    await bothThemes(window);
  });
});
