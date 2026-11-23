/**
 * The Pub/Sub page driven through the window (`pubsub.show`, `pubsub.subscribe`, `pubsub.subscriptions`,
 * `pubsub.messages`, `pubsub.inspect`, `pubsub.pause`, `pubsub.filter`): opened from the tree, a channel subscribed to
 * by typing it and `Enter`, the messages another client publishes listed with the newest at the top, a row shown in the
 * inspector island, the selection with `Ctrl+A` and `Esc`, the pause, and the filter. The page is checked for
 * accessibility in both themes. Redis is shared: the channels are `m18:ui-<run>:*`, and no key is written.
 */
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createClient } from 'redis';
import { expectAccessible, startApp, type StartedApp } from '../app';

const redisUrl = process.env['DATARDO_TEST_REDIS_URL'] ?? 'redis://127.0.0.1:6390';
const prefix = `m18:ui-${randomBytes(4).toString('hex')}:`;
const running: StartedApp[] = [];

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

async function openPubSub(window: Page): Promise<void> {
  // The page's line in **Pages of Cache** starts `pubsub.show@tree` when clicked.
  await window
    .getByRole('tree', { name: 'Tree' })
    .getByRole('treeitem', { name: 'Pub/Sub, page', exact: true })
    .click();
  await expect(window.locator('[data-feature="pubsub.messages@table"]')).toBeVisible();
}

async function bothThemes(window: Page): Promise<void> {
  for (const theme of ['light', 'dark']) {
    await window.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
    await expectAccessible(window);
  }
}

async function publish(...messages: string[]): Promise<void> {
  const client = createClient({ url: redisUrl });
  await client.connect();
  try {
    for (const message of messages) {
      await client.publish(`${prefix}orders`, message);
    }
  } finally {
    client.destroy();
  }
}

async function subscribeTo(window: Page, name: string): Promise<void> {
  const field = window.getByRole('textbox', { name: 'Channel or pattern' });
  await field.fill(name);
  await field.press('Enter');
  const list = window.locator('[data-feature="pubsub.subscriptions@list"]');
  await expect(list.getByText(name, { exact: true })).toBeVisible();
  await expect(field).toHaveValue('');
  await expect(window.getByText('● Listening')).toBeVisible();
}

function table(window: Page) {
  return window.getByRole('grid', { name: 'Pub/Sub' });
}

test.describe('pubsub.subscriptions', () => {
  test('the menu of a subscription filters by it, and Delete on a focused item unsubscribes', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    await openPubSub(window);
    await subscribeTo(window, `${prefix}orders`);
    const list = window.locator('[data-feature="pubsub.subscriptions@list"]');
    const item = list.getByRole('listitem').filter({ hasText: `${prefix}orders` });
    await item.focus();
    await window.keyboard.press('Shift+F10');
    const menu = window.locator('[data-feature="pubsub.subscriptions@item-menu"]');
    await expect(menu).toBeVisible();
    await expectAccessible(window);
    await menu.getByRole('menuitem', { name: 'Show only its messages' }).click();
    await expect(window.locator('[data-feature="pubsub.filter@toolbar"]')).toContainText(`${prefix}orders`);
    await item.focus();
    await window.keyboard.press('Delete');
    await expect(window.getByText('■ Not subscribed')).toBeVisible();
    await expect(window.getByText('No subscriptions.')).toBeVisible();
  });
});

test.describe('pubsub.show', () => {
  test('opens from the tree not subscribed, with its empty state and the active channels, in both themes', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    await openPubSub(window);
    await expect(window.getByRole('tab', { name: /Pub\/Sub/u })).toBeVisible();
    await expect(window.getByText('■ Not subscribed')).toBeVisible();
    await expect(
      window.getByText('Subscribe to a channel or to a pattern to see its messages.', { exact: false }),
    ).toBeVisible();
    await expect(window.getByText('No subscriptions.')).toBeVisible();
    await expect(window.locator('[data-feature="pubsub.channels@list"]')).toBeVisible();
    await bothThemes(window);
  });
});

test.describe('pubsub.messages', () => {
  test('lists the messages another client publishes, the newest at the top, and shows one in the inspector island', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    await openPubSub(window);
    await subscribeTo(window, `${prefix}orders`);
    await expect(window.getByText('Listening. No message has arrived yet.')).toBeVisible();
    await publish('first', '{"status":"paid"}');
    const rows = table(window).getByRole('row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText('{"status":"paid"}');
    await expect(rows.nth(2)).toContainText('first');
    await rows.nth(1).click();
    await expect(window.getByText('17 bytes', { exact: true })).toBeVisible();
    await expect(window.locator('[data-feature="pubsub.copy@inspector"]')).toBeVisible();
    await expect(window.locator('[data-feature="pubsub.messages@selection-bar"]')).toContainText('1 selected');
    await bothThemes(window);
  });

  test('Ctrl+A selects the rows the filter shows, Esc ends the selection, and the pause holds what arrives', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await addRedis(window);
    await openPubSub(window);
    await subscribeTo(window, `${prefix}orders`);
    await publish('paid 1', 'new 2', 'paid 3');
    await expect(table(window).getByRole('row')).toHaveCount(4);
    await window.getByRole('searchbox', { name: 'Filter messages' }).fill('paid');
    await expect(table(window).getByRole('row')).toHaveCount(3);
    await table(window).focus();
    await window.keyboard.press('Control+a');
    await expect(window.locator('[data-feature="pubsub.messages@selection-bar"]')).toContainText('2 selected');
    await window.keyboard.press('Escape');
    await expect(window.locator('[data-feature="pubsub.messages@selection-bar"]')).toBeHidden();
    await window.locator('[data-feature="pubsub.pause@toolbar"]').click();
    await expect(window.getByText('❚❚ Paused', { exact: true })).toBeVisible();
    await publish('paid 4');
    await expect(window.locator('[data-feature="pubsub.pause@toolbar"]')).toHaveText('Resume (1)');
    await expect(table(window).getByRole('row')).toHaveCount(3);
    await window.locator('[data-feature="pubsub.pause@toolbar"]').click();
    await expect(table(window).getByRole('row')).toHaveCount(4);
    await bothThemes(window);
  });
});
