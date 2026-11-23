/**
 * The values of strings and hashes driven through the window (`value.show`, `value.item-editor`, `value.save-string`,
 * `value.refresh`): a key opened in its tab from the keys tab, its value read, a string edited and saved with
 * `Ctrl+S`, a field edited in its cell, rows selected with the keyboard alone and shown in the inspector island, the
 * compact form of a key selected in a keys tab, a member that cannot be changed, a key gone and a type that changed.
 * Each page is checked for accessibility in both themes. The keys are `m14:ui-<run>:*` in database 4 of the shared
 * Redis; each test closes every Datardo it started, even when it fails.
 */
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createClient } from 'redis';
import { expectAccessible, startApp, type StartedApp } from '../app';

const redisUrl = process.env['DATARDO_TEST_REDIS_URL'] ?? 'redis://127.0.0.1:6390';
/** The database of the shared Redis these tests may use: only the keys of this run are written. */
const redisDatabase = 4;
const prefix = `m14:ui-${randomBytes(4).toString('hex')}`;
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

test.beforeEach(async () => {
  await withRedis(async (client) => {
    await client.hSet(`${prefix}:user:7`, { name: 'Ada', visits: '12' });
    await client.set(`${prefix}:greeting`, 'hello');
    await client.sAdd(`${prefix}:tags`, ['redis', 'cache']);
  });
});

test.afterEach(async () => {
  for (const started of running.splice(0)) {
    await started.close().catch((error: unknown) => {
      // Already closed by the test: nothing is left running.
      console.warn('Datardo was already closed:', error);
    });
  }
  await withRedis(async (client) => {
    for await (const keys of client.scanIterator({ MATCH: `${prefix}:*`, COUNT: 1000 })) {
      if (keys.length > 0) {
        await client.unlink(keys);
      }
    }
  });
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

function keysGrid(window: Page) {
  return window.getByRole('grid', { name: 'Keys' });
}

function keyRow(window: Page, name: string) {
  return keysGrid(window)
    .getByRole('row')
    .filter({ has: window.getByRole('gridcell', { name, exact: true }) });
}

/** Opens the keys tab of db4 from the tree, and scans the keys of this run. */
async function openKeys(window: Page): Promise<void> {
  await window
    .getByRole('tree', { name: 'Tree' })
    .getByRole('treeitem', { name: /^db4, / })
    .click();
  const pattern = window.getByRole('textbox', { name: 'Pattern' });
  await expect(pattern).toBeVisible();
  await pattern.fill(`${prefix}:*`);
  await pattern.press('Enter');
}

/** Opens a key of this run in its own tab. */
async function openKey(window: Page, name: string): Promise<void> {
  await addRedis(window);
  await openKeys(window);
  await keyRow(window, `${prefix}:${name}`).click();
  await keysGrid(window).press('Enter');
  await expect(window.getByRole('toolbar', { name: `${prefix}:${name}` })).toBeVisible();
}

function items(window: Page) {
  return window.getByRole('grid', { name: 'Items' });
}

async function bothThemes(window: Page): Promise<void> {
  for (const theme of ['light', 'dark']) {
    await window.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
    await expectAccessible(window);
  }
}

test.describe('value.show', () => {
  test('the key tab of a hash shows its fields in a table, and the row selected in the inspector island', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'user:7');
    const section = window.getByRole('region', { name: 'Value' });
    await expect(section.getByText('2 fields', { exact: true })).toBeVisible();
    await expect(items(window).getByRole('columnheader')).toHaveText(['Field', 'Value']);
    await items(window).focus();
    await window.keyboard.press('ArrowDown');
    await expect(items(window).getByRole('row', { selected: true })).toHaveCount(1);
    const inspector = window.getByRole('complementary', { name: 'Inspector' });
    await expect(inspector.locator('[data-feature="value.copy@inspector"]')).toBeVisible();
    await bothThemes(window);
    await window.keyboard.press('Escape');
    await expect(inspector.getByText('Nothing selected')).toBeVisible();
  });

  test('the key tab of a string shows its editor with Text, JSON, Hex, Save, Revert and Copy', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'greeting');
    const toolbar = window.getByRole('toolbar', { name: 'Value' });
    for (const name of ['Text', 'JSON', 'Hex', 'Save', 'Revert', 'Copy']) {
      await expect(toolbar.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(window.getByRole('textbox', { name: /^Value of/ })).toHaveValue('hello');
    await bothThemes(window);
  });

  test('a keys tab shows the compact form of the key selected in the inspector island', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    await openKeys(window);
    await keyRow(window, `${prefix}:user:7`).click();
    const compact = window.locator('[data-feature="value.show@inspector"]');
    await expect(compact.getByRole('columnheader')).toHaveText(['Field', 'Value']);
    await expect(compact.getByRole('row')).toHaveCount(3);
    await expect(compact.locator('button')).toHaveCount(0);
    await bothThemes(window);
  });

  test('a double click on a member of a set opens no editor and says why', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'tags');
    await items(window).getByRole('gridcell', { name: 'redis', exact: true }).dblclick();
    await expect(window.getByText('A member cannot be changed: remove it and add another.')).toBeVisible();
    await expect(window.getByRole('textbox', { name: /^Member of/ })).toHaveCount(0);
  });

  test('a key deleted by another client shows that it no longer exists, with Close tab', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'user:7');
    await withRedis(async (client) => {
      await client.del(`${prefix}:user:7`);
    });
    await window.locator('[data-feature="value.refresh@toolbar"]').click();
    const alert = window.getByRole('region', { name: 'Value' }).getByRole('alert');
    await expect(alert).toContainText(`The key ${prefix}:user:7 no longer exists: it was deleted or it expired.`);
    await expect(alert.getByRole('button', { name: 'Close tab' })).toBeVisible();
    await bothThemes(window);
  });

  test('a hash replaced by a list shows the list under the notice', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'user:7');
    await expect(items(window).getByRole('columnheader')).toHaveText(['Field', 'Value']);
    await withRedis(async (client) => {
      await client.del(`${prefix}:user:7`);
      await client.rPush(`${prefix}:user:7`, ['a', 'b']);
    });
    await window.locator('[data-feature="value.refresh@toolbar"]').click();
    await expect(
      window.getByText(`${prefix}:user:7 is now a list: it was a hash when this tab read it.`),
    ).toBeVisible();
    await expect(items(window).getByRole('columnheader')).toHaveText(['Index', 'Element']);
  });
});

test.describe('value.save-string', () => {
  test('a string changed and Ctrl+S is saved, and Revert puts back the value loaded', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'greeting');
    const editor = window.getByRole('textbox', { name: /^Value of/ });
    await editor.fill('hello world');
    await editor.press('Control+s');
    await expect
      .poll(async () => {
        let value: string | null = null;
        await withRedis(async (client) => {
          value = await client.get(`${prefix}:greeting`);
        });
        return value;
      })
      .toBe('hello world');
    await expect(editor).toHaveValue('hello world');
    await expect(window.getByRole('toolbar', { name: 'Value' }).getByRole('button', { name: 'Revert' })).toBeDisabled();
    await editor.fill('typed');
    await window.getByRole('toolbar', { name: 'Value' }).getByRole('button', { name: 'Revert' }).click();
    await expect(editor).toHaveValue('hello world');
  });
});

test.describe('value.item-editor', () => {
  test('a double click on a value opens the editor with its hint; Enter saves and Esc writes nothing', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'user:7');
    await items(window).getByRole('gridcell', { name: 'Ada', exact: true }).dblclick();
    const editor = window.getByRole('textbox', { name: 'Value of name' });
    await expect(editor).toHaveValue('Ada');
    await expect(window.getByText('Enter to save · Shift+Enter new line · Esc to cancel')).toBeVisible();
    await expectAccessible(window);
    await editor.fill('Ada Lovelace');
    await editor.press('Enter');
    await expect(items(window).getByRole('gridcell', { name: 'Ada Lovelace', exact: true })).toBeVisible();
    await items(window).getByRole('gridcell', { name: '12', exact: true }).dblclick();
    const visits = window.getByRole('textbox', { name: 'Value of visits' });
    await visits.fill('99');
    await visits.press('Escape');
    await expect(visits).toHaveCount(0);
    let stored: string | null = null;
    await withRedis(async (client) => {
      stored = await client.hGet(`${prefix}:user:7`, 'visits');
    });
    expect(stored).toBe('12');
  });
});
