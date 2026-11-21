/**
 * The comparison of two collections through the window (M35): **Compare with…** on `shop.orders` opens its tab with
 * Local on the right; choosing `orders_2023` changes the title and compares by itself; the chips and the list show the
 * differences, the arrows select a row and the inspector island shows its difference; **→ Right** copies a document
 * after a confirmation and the page compares again. With the accessibility check in both themes.
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, firstConnection, startIntent, startWithMongo, testMongo } from '../query/collection-app';
import { closeAll } from '../table/parts-app';

const mongo = testMongo();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async (db) => {
    const shop = db('shop');
    await shop.collection('orders').insertMany([
      { _id: 1 as never, status: 'new' },
      { _id: 2 as never, total: 5 },
      { _id: 3 as never, only: 'left' },
    ]);
    await shop.collection('orders_2023').insertMany([
      { _id: 1 as never, status: 'paid' },
      { _id: 2 as never, total: 5 },
      { _id: 4 as never, only: 'right' },
    ]);
  });
});

test.afterAll(async () => {
  await mongo.stop();
});

test.afterEach(async () => {
  await closeAll(running);
});

async function openComparison(window: Page): Promise<void> {
  const connection = await firstConnection(window);
  await startIntent(
    window,
    'compare.show',
    { connection, database: 'shop', collection: 'orders' },
    { kind: 'connection', connection },
  );
}

async function inRight(): Promise<unknown> {
  return mongo.use(async (db) =>
    db('shop')
      .collection('orders_2023')
      .findOne({ _id: 3 as never }),
  );
}

test.describe('compare.show', () => {
  test('Compare with… compares with the collection chosen, lists the differences and copies one', async () => {
    test.setTimeout(150_000);
    const started = await startWithMongo(mongo);
    running.push(started);
    const { window } = started;
    await openComparison(window);
    await expect(window.getByRole('tab', { name: /Compare: orders/u })).toBeVisible();
    await expect(window.getByRole('combobox', { name: 'Connection', exact: true })).toContainText('same connection');
    const collection = window.getByRole('combobox', { name: 'Collection', exact: true });
    await expect(collection.locator('option', { hasText: 'orders_2023' })).toHaveCount(1);
    await expect(collection.locator('option', { hasText: /^orders$/u })).toHaveCount(0);
    await collection.selectOption('orders_2023');
    await expect(window.getByRole('tab', { name: /Compare: orders ↔ orders_2023/u })).toBeVisible();
    const list = window.getByRole('grid', { name: 'Compare: orders ↔ orders_2023' });
    await expect(list.getByRole('row')).toHaveCount(4, { timeout: 30_000 });
    await expect(window.getByText(/^3 differences · /u)).toBeVisible();
    await expect(window.getByRole('button', { name: '1 only left' })).toBeVisible();
    await bothThemes(window);

    await list.focus();
    await window.keyboard.press('ArrowDown');
    await expect(list.getByRole('row').nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(window.getByRole('table', { name: 'field' })).toContainText('status');
    await window.keyboard.press('ArrowDown');
    await expect(window.getByText('Missing on the right side')).toBeVisible();
    await expect(window.getByRole('complementary', { name: 'Inspector' })).toContainText('only: "left"');
    await bothThemes(window);

    const onlyLeft = list.getByRole('row').filter({ hasText: 'Only left' });
    await onlyLeft.getByRole('button', { name: '→ Right' }).click();
    const dialog = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    await expect(dialog).toBeVisible();
    await bothThemes(window);
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect.poll(inRight).not.toBeNull();
    await expect(list.getByRole('row')).toHaveCount(3, { timeout: 30_000 });
  });

  test('pressing a chip lists only its rows, and pressing it again lists them all', async () => {
    test.setTimeout(150_000);
    const started = await startWithMongo(mongo);
    running.push(started);
    const { window } = started;
    await openComparison(window);
    await window.getByRole('combobox', { name: 'Collection', exact: true }).selectOption('orders_2023');
    const list = window.getByRole('grid', { name: 'Compare: orders ↔ orders_2023' });
    await expect(list.getByRole('row').nth(1)).toBeVisible({ timeout: 30_000 });
    const rows = await list.getByRole('row').count();
    const chip = window.getByRole('button', { name: /only right$/u });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(list.getByRole('row')).toHaveCount(2);
    await chip.click();
    await expect(list.getByRole('row')).toHaveCount(rows);
  });
});
