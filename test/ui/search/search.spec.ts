/**
 * The Search documents page through the window (M34): opened from Go to and on a node of the tree, a search started
 * with `Enter`, its groups and items, the document of an item in the inspector island and in a document tab, **Open
 * in collection** and **Copy _id**; with the keyboard and the accessibility check in both themes (QA15, QA16).
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, firstConnection, startIntent, startWithMongo, testMongo } from '../query/collection-app';
import { clipboardText, closeAll, goTo, gridOf } from '../table/parts-app';

const mongo = testMongo();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async (db) => {
    await db('shop')
      .collection('orders')
      .insertMany([
        { _id: 1 as never, customer: 'Mario Rossi', total: 10 },
        { _id: 2 as never, customer: 'Ada Lovelace', total: 20 },
        { _id: 3 as never, customer: 'mario bianchi', note: 'mario again', total: 30 },
      ]);
    await db('crm')
      .collection('people')
      .insertMany([{ _id: 'A-17' as never, name: 'Mario' }]);
  });
});

test.afterAll(async () => {
  await mongo.stop();
});

test.afterEach(async () => {
  await closeAll(running);
});

async function started(): Promise<StartedApp> {
  const app = await startWithMongo(mongo);
  running.push(app);
  return app;
}

function pageOf(window: Page) {
  return window.getByRole('toolbar', { name: 'Search', exact: true });
}

function resultsOf(window: Page) {
  return window.getByRole('region', { name: 'Documents found' });
}

async function search(window: Page, text: string): Promise<void> {
  const field = window.getByRole('searchbox', { name: 'Text to find' });
  await field.fill(text);
  await field.press('Enter');
}

test.describe('search.show', () => {
  test('Search documents opens one tab on Every database; Enter with a blank text says so and reads nothing', async () => {
    test.setTimeout(120_000);
    const { window } = await started();
    await goTo(window, 'Search documents');
    await expect(window.getByRole('tab', { name: /Search documents/u })).toHaveAttribute('aria-selected', 'true');
    await expect(window.getByRole('toolbar', { name: 'Where to search' }).getByRole('combobox')).toHaveValue('');
    await goTo(window, 'Search documents');
    await expect(window.getByRole('tab', { name: /Search documents/u })).toHaveCount(1);
    await search(window, '   ');
    await expect(window.getByText('Type something to search.', { exact: true })).toBeVisible();
    await window.getByRole('combobox', { name: 'Mode' }).selectOption('regex');
    await search(window, '([');
    await expect(window.getByRole('alert').filter({ hasText: 'Invalid regular expression' })).toContainText('/([/');
    await expect(resultsOf(window)).toHaveCount(0);
    await expect(pageOf(window)).toBeVisible();
  });

  test('Enter searches every database: the groups list the documents found, the summary says done', async () => {
    test.setTimeout(120_000);
    const { window } = await started();
    await goTo(window, 'Search documents');
    await search(window, 'mario');
    const results = resultsOf(window);
    await expect(results.getByRole('region', { name: 'shop.orders' })).toContainText('2 documents');
    await expect(results.getByRole('region', { name: 'crm.people' })).toContainText('1 document');
    await expect(window.getByRole('status').filter({ hasText: 'done' })).toContainText('documents found in 2');
    await expect(results.getByRole('region', { name: 'shop.orders' })).toContainText('note');
    await bothThemes(window);
  });

  test('Search documents… on the collection orders sets In to shop with orders ticked, and searches nothing', async () => {
    test.setTimeout(120_000);
    const { window } = await started();
    const connection = await firstConnection(window);
    await startIntent(
      window,
      'search.show',
      {},
      { kind: 'collection', connection, database: 'shop', collection: 'orders' },
    );
    const scope = window.getByRole('toolbar', { name: 'Where to search' });
    await expect(scope.getByRole('combobox')).toHaveValue('shop');
    await expect(scope.getByRole('checkbox', { name: 'orders' })).toBeChecked();
    await expect(scope.getByRole('checkbox', { name: 'All collections' })).not.toBeChecked();
    await expect(window.getByRole('checkbox', { name: 'Views' })).toBeDisabled();
    await expect(resultsOf(window)).toHaveCount(0);
  });

  test('Selecting an item shows its document in the inspector island; Enter opens it in a document tab', async () => {
    test.setTimeout(120_000);
    const { window } = await started();
    await goTo(window, 'Search documents');
    await search(window, 'Ada');
    const item = resultsOf(window).getByRole('listitem').filter({ hasText: 'Lovelace' });
    await item.click();
    const inspector = window.locator('[data-feature="nav.inspector@inspector"]');
    await expect(inspector.locator('pre')).toContainText('Ada Lovelace');
    await item.press('Enter');
    await expect(window.getByRole('tab', { name: /Search documents/u })).toHaveAttribute('aria-selected', 'false');
    await expect(window.getByRole('tab', { selected: true })).toContainText('2');
  });
});

test.describe('search.open-in-collection', () => {
  test('Open in collection opens shop.orders filtered on the documents found, which the table shows', async () => {
    test.setTimeout(120_000);
    const { window } = await started();
    await goTo(window, 'Search documents');
    await search(window, 'mario');
    await resultsOf(window)
      .getByRole('region', { name: 'shop.orders' })
      .getByRole('button', { name: 'Open in collection' })
      .click();
    await expect(window.getByRole('tab', { name: /orders/u, selected: true })).toBeVisible();
    await expect(gridOf(window)).toContainText('Mario Rossi');
    await expect(gridOf(window)).toContainText('mario bianchi');
    await expect(gridOf(window)).not.toContainText('Ada Lovelace');
  });
});

test.describe('search.copy-id', () => {
  test('Copy _id copies the _id in mongosh syntax, with the quotes of a string', async () => {
    test.setTimeout(120_000);
    const app = await started();
    const { window } = app;
    await goTo(window, 'Search documents');
    await search(window, 'mario');
    await resultsOf(window)
      .getByRole('region', { name: 'crm.people' })
      .getByRole('button', { name: 'Copy _id' })
      .click();
    await expect.poll(async () => clipboardText(app)).toBe('"A-17"');
    await expect(window.getByText('Copied to the clipboard', { exact: true })).toBeVisible();
  });
});
