/**
 * The console tab driven through the window (`console.show`, `console.input`, `console.run`, `console.output`,
 * `console.history`, `console.clear`, `console.copy-reply`): opened from the tree, commands typed and run with `Enter`,
 * their replies in the output, a string of a reply in the inspector island, the history on `Up`, and `Ctrl+L`. The
 * page is checked for accessibility in both themes. The keys are `m16:ui-<run>:*` in database 6 of the shared Redis;
 * each test closes every Datardo it started, even when it fails.
 */
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createClient } from 'redis';
import { expectAccessible, startApp, type StartedApp } from '../app';

const redisUrl = process.env['DATARDO_TEST_REDIS_URL'] ?? 'redis://127.0.0.1:6390';
/** The database of the shared Redis these tests may use (testing.md): only the keys of this run are written. */
const redisDatabase = 6;
const prefix = `m16:ui-${randomBytes(4).toString('hex')}`;
const running: StartedApp[] = [];

test.afterAll(async () => {
  const client = createClient({ url: redisUrl, database: redisDatabase });
  await client.connect();
  try {
    for await (const keys of client.scanIterator({ MATCH: `${prefix}:*`, COUNT: 1000 })) {
      if (keys.length > 0) {
        await client.unlink(keys);
      }
    }
  } finally {
    client.destroy();
  }
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

async function openConsole(window: Page): Promise<void> {
  // The page's line in **Pages of Cache** starts `console.show@tree` when clicked.
  await window
    .getByRole('tree', { name: 'Tree' })
    .getByRole('treeitem', { name: 'Console, page', exact: true })
    .click();
  await expect(window.locator('[data-feature="console.input@editor"]')).toBeVisible();
}

async function bothThemes(window: Page): Promise<void> {
  for (const theme of ['light', 'dark']) {
    await window.evaluate((name) => {
      document.documentElement.dataset['theme'] = name;
    }, theme);
    await expectAccessible(window);
  }
}

function input(window: Page) {
  return window.getByRole('textbox', { name: 'Command' });
}

function output(window: Page) {
  return window.getByRole('list', { name: 'Output' });
}

async function runLine(window: Page, line: string): Promise<void> {
  await input(window).click();
  await window.keyboard.insertText(line);
  await window.keyboard.press('Enter');
  // The input is empty again: only its placeholder is left.
  await expect(input(window)).toHaveText('Type a command, for example GET orders:42');
  await expect(output(window).getByText(line, { exact: true }).last()).toBeVisible();
}

test.describe('console.show', () => {
  test('a console opened from the tree runs commands typed and shows their replies, in both themes', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    await openConsole(window);
    await expect(window.getByText('Commands run here are not recorded in the undo history.')).toBeVisible();
    await expect(window.getByText('Type a Redis command and press Enter.', { exact: false })).toBeVisible();
    await runLine(window, `SELECT ${String(redisDatabase)}`);
    await expect(window.locator('[data-feature="console.run@toolbar"]')).toHaveText(`db${String(redisDatabase)}`);
    await runLine(window, `SET ${prefix}:greeting "hello world"`);
    await expect(output(window).getByText('OK', { exact: true })).toHaveCount(2);
    await runLine(window, `GET ${prefix}:greeting`);
    await expect(output(window).getByText('"hello world"', { exact: true })).toBeVisible();
    await bothThemes(window);
  });
});

test.describe('console.output', () => {
  test('a click on a string of a reply shows it in the inspector island, with its size', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    await openConsole(window);
    await runLine(window, `SELECT ${String(redisDatabase)}`);
    await runLine(window, `SET ${prefix}:json "{\\"a\\":\\"b\\"}"`);
    await runLine(window, `GET ${prefix}:json`);
    await output(window).getByText('"{\\"a\\":\\"b\\"}"', { exact: true }).click();
    await expect(window.getByText('9 bytes', { exact: true })).toBeVisible();
    await expect(window.locator('[data-feature="console.copy-reply@inspector"]')).toBeVisible();
    await bothThemes(window);
  });
});

test.describe('console.input', () => {
  test('Up brings back the last command, a refused line stays in the input, and Ctrl+L clears the output', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    await openConsole(window);
    await runLine(window, `SELECT ${String(redisDatabase)}`);
    await runLine(window, `GET ${prefix}:missing`);
    await expect(output(window).getByText('(nil)', { exact: true })).toBeVisible();
    await input(window).click();
    await window.keyboard.press('ArrowUp');
    await expect(input(window)).toHaveText(`GET ${prefix}:missing`);
    await window.keyboard.press('Control+a');
    await window.keyboard.insertText('BLPOP queue 0');
    await window.keyboard.press('Enter');
    await expect(output(window).getByText('with the timeout 0', { exact: false })).toBeVisible();
    await expect(input(window)).toHaveText('BLPOP queue 0');
    await window.keyboard.press('Control+l');
    await expect(window.getByText('Type a Redis command and press Enter.', { exact: false })).toBeVisible();
    await expect(window.locator('[data-feature="console.run@editor"]')).toHaveText('Run');
  });
});
