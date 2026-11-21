/**
 * The saved and recent queries driven through the window (M20): **Queries** in the query bar opens the list of the
 * collection, with the queries of a folder Mongoster 0.8.0 wrote; the arrows move from the search field through the
 * items, `Esc` and a click outside close it; an item runs its query; a query that ran is listed under **Recent**; a
 * query saved for me is listed under **Saved**; a file added to the folder appears while the list is open; Go to
 * finds a saved query by its name and runs it; the accessibility check passes in both themes.
 */
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startApp, type StartedApp } from '../app';
import {
  barOf,
  bothThemes,
  documentRows,
  editorText,
  openCollection,
  setEditor,
  startIntent,
  testMongo,
} from '../query/collection-app';

const mongo = testMongo();
const running: StartedApp[] = [];
const recorded = fileURLToPath(new URL('../../fixtures/saved-query/mongoster-0.8.0', import.meta.url));
let queriesFolder = '';

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async (db) => {
    await db('shop')
      .collection('orders')
      .insertMany([
        { n: 1, status: 'paid', total: 30, createdAt: new Date('2024-03-02') },
        { n: 2, status: 'open', total: 10, createdAt: new Date('2024-03-03') },
        { n: 3, status: 'paid', total: 20, createdAt: new Date('2024-02-03') },
      ]);
  });
});

test.beforeEach(async () => {
  queriesFolder = await mkdtemp(join(tmpdir(), 'datardo-ui-queries-'));
  await cp(recorded, queriesFolder, { recursive: true });
});

test.afterAll(async () => {
  await mongo.stop();
});

test.afterEach(async () => {
  for (const started of running.splice(0)) {
    await started.close().catch((error: unknown) => {
      console.warn('Datardo was already closed:', error);
    });
  }
  await rm(queriesFolder, { recursive: true, force: true });
});

/** Datardo with *Local*, whose queries folder holds the files Mongoster 0.8.0 wrote. */
async function started(): Promise<Page> {
  const app = await startApp();
  running.push(app);
  const { window } = app;
  await expect(window.getByRole('navigation', { name: 'Rail' })).toBeVisible();
  await startIntent(window, 'connection.add', 'mongodb');
  const form = window.getByRole('form', { name: 'New connection' });
  await form.locator('[data-field="name"]').fill('Local');
  await form.locator('[data-field="connection-string"]').fill(mongo.uri());
  await form.locator('[data-field="queries-folder"]').fill(queriesFolder);
  await form.getByRole('button', { name: 'Save and connect' }).click();
  await expect(form).toBeHidden();
  return window;
}

function queriesButton(window: Page) {
  return barOf(window).locator('button[data-feature="saved-query.show@query-bar"]');
}

function listOf(window: Page) {
  return window.getByRole('dialog', { name: 'Queries' });
}

/** The run buttons of the items under **Saved**. */
function savedItems(window: Page) {
  return listOf(window).getByRole('region', { name: 'Saved' }).locator('[data-item-run]');
}

async function openOrders(window: Page): Promise<void> {
  await openCollection(window, 'shop', 'orders');
  await expect(documentRows(window)).toHaveCount(3);
}

async function openList(window: Page): Promise<void> {
  await queriesButton(window).click();
  await expect(listOf(window)).toBeVisible();
}

test.describe('saved-query.show', () => {
  test('lists the queries of the folder Mongoster wrote; the arrows, Esc and a click outside; both themes', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await openOrders(window);
    await openList(window);
    const list = listOf(window);
    const search = list.getByRole('searchbox', { name: 'Search queries' });
    await expect(search).toBeFocused();
    const saved = list.getByRole('region', { name: 'Saved' });
    // The file that names Production is not listed on Local; the others are, by name.
    await expect(saved.locator('[data-item-run]')).toHaveText([/^All/u, /^Mine/u, /^Paid this month/u]);
    await expect(saved.getByText('Orders paid since the first of the month')).toBeVisible();
    await expect(list.getByRole('region', { name: 'Recent' })).toHaveCount(0);
    await bothThemes(window);
    await window.keyboard.press('ArrowDown');
    await expect(saved.locator('[data-item-run]').first()).toBeFocused();
    await window.keyboard.press('ArrowDown');
    await expect(saved.locator('[data-item-run]').nth(1)).toBeFocused();
    await window.keyboard.press('ArrowUp');
    await window.keyboard.press('ArrowUp');
    await expect(search).toBeFocused();
    await window.keyboard.type('zzz');
    await expect(list.getByText('No queries match your search.')).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(queriesButton(window)).toBeFocused();
    await openList(window);
    await window.getByRole('contentinfo').click();
    await expect(listOf(window)).toHaveCount(0);
  });

  test('a file added to the folder appears under Saved while the list is open', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await openOrders(window);
    await openList(window);
    await expect(savedItems(window)).toHaveCount(3);
    await writeFile(
      join(queriesFolder, 'shop', 'orders', 'pulled.json'),
      JSON.stringify({ name: 'Pulled by git', database: 'shop', collection: 'orders', filter: '{ n: 2 }' }),
    );
    await expect(listOf(window).getByRole('button', { name: /^Pulled by git/u })).toBeVisible({ timeout: 5000 });
  });
});

test.describe('saved-query.run', () => {
  test('Enter on Paid this month fills the bar with its texts and runs it; the query is then under Recent', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await openOrders(window);
    await openList(window);
    await expect(savedItems(window)).toHaveCount(3);
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('ArrowDown');
    await expect(savedItems(window).nth(2)).toBeFocused();
    await window.keyboard.press('Enter');
    await expect(listOf(window)).toHaveCount(0);
    await expect(documentRows(window)).toHaveCount(1);
    expect(await editorText(window, 'Sort')).toBe('{ createdAt: -1 }');
    await openList(window);
    const recent = listOf(window).getByRole('region', { name: 'Recent' });
    await expect(recent.locator('[data-item-run]').first()).toContainText('sort { createdAt: -1 }');
  });
});

test.describe('saved-query.save', () => {
  test('Save current keeps the query of the bar for me, listed under Saved with Me', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await openOrders(window);
    await setEditor(window, 'Filter', '{ status: "open" }');
    await openList(window);
    await listOf(window).getByRole('button', { name: 'Save current' }).click();
    const name = window.getByRole('dialog', { name: 'Save query' });
    await name.getByRole('textbox').fill('Open orders');
    await name.getByRole('button', { name: 'Save' }).click();
    const where = window.getByRole('dialog', { name: 'Save query' });
    await expect(where.getByRole('radio', { name: /For me/u })).toBeChecked();
    await bothThemes(window);
    await where.getByRole('button', { name: 'Save' }).click();
    await expect(window.getByRole('dialog', { name: 'Save query' })).toHaveCount(0);
    if ((await listOf(window).count()) === 0) {
      await openList(window);
    }
    const item = listOf(window).getByRole('listitem').filter({ hasText: 'Open orders' });
    await expect(item.getByText('Me', { exact: true })).toBeVisible();
  });
});

test.describe('saved-query.connection-list', () => {
  test('typing paid in Go to lists Paid this month as shop.orders · Folder; Enter opens shop.orders with it run', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await window.keyboard.press('Control+k');
    await window.keyboard.type('?paid');
    const option = window.getByRole('option', { name: /Paid this month/u });
    await expect(option).toContainText('shop.orders · Folder');
    await window.keyboard.press('Enter');
    await expect(documentRows(window)).toHaveCount(1);
    expect(await editorText(window, 'Filter')).toContain('status: "paid"');
  });
});
