/**
 * The structure comparison of two databases through the window (M35): **Compare structure with…** on `shop` opens its
 * tab; choosing `shop_staging` changes the title and compares by itself; the list groups the differences by
 * collection, the arrows select one and the inspector island shows its steps; **Apply…** there creates the index after
 * a confirmation and the page compares again. With the accessibility check in both themes.
 */
import { expect, test } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, firstConnection, startIntent, startWithMongo, testMongo } from '../query/collection-app';
import { closeAll } from '../table/parts-app';

const mongo = testMongo();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async (db) => {
    await db('shop')
      .collection('orders')
      .insertOne({ _id: 1 as never, status: 'new' });
    await db('shop').collection('orders').createIndex({ status: 1 });
    await db('shop_staging')
      .collection('orders')
      .insertOne({ _id: 1 as never, status: 'new' });
  });
});

test.afterAll(async () => {
  await mongo.stop();
});

test.afterEach(async () => {
  await closeAll(running);
});

async function indexes(): Promise<readonly string[]> {
  return mongo.use(async (db) => {
    const listed = await db('shop_staging').collection('orders').indexes();
    return listed.map((each) => each.name ?? '');
  });
}

test.describe('structure.show', () => {
  test('Compare structure with… compares with the database chosen and applies the missing index', async () => {
    test.setTimeout(150_000);
    const started = await startWithMongo(mongo);
    running.push(started);
    const { window } = started;
    const connection = await firstConnection(window);
    await startIntent(window, 'structure.show', { connection, database: 'shop' }, { kind: 'connection', connection });
    await expect(window.getByRole('tab', { name: /Structure: shop/u })).toBeVisible();
    const database = window.getByRole('combobox', { name: 'Database', exact: true });
    await expect(database.locator('option', { hasText: 'shop_staging' })).toHaveCount(1);
    await expect(database.locator('option', { hasText: /^(shop|admin|local|config)$/u })).toHaveCount(0);
    await database.selectOption('shop_staging');
    await expect(window.getByRole('tab', { name: /Structure: shop ↔ shop_staging/u })).toBeVisible();
    const list = window.getByRole('grid', { name: 'Structure: shop ↔ shop_staging' });
    await expect(list.getByRole('row', { name: /index status_1/u })).toBeVisible({ timeout: 30_000 });
    await expect(window.getByText(/1 difference · /u)).toBeVisible();
    await bothThemes(window);

    await list.focus();
    await window.keyboard.press('ArrowDown');
    await expect(list.getByRole('row', { name: /index status_1/u })).toHaveAttribute('aria-selected', 'true');
    await expect(window.getByText('Steps on the right')).toBeVisible();
    await expect(window.getByText(/createIndex\(\{ status: 1 \}/u)).toBeVisible();
    await bothThemes(window);

    await window.locator('[data-feature="structure.apply@inspector"]').click();
    const dialog = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    await expect(dialog).toBeVisible();
    await bothThemes(window);
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect.poll(indexes).toContain('status_1');
    await expect(window.getByText(/The structures are the same · /u)).toBeVisible({ timeout: 30_000 });
  });
});
