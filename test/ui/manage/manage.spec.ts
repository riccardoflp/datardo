/**
 * Databases and collections managed through the window (M21): **Create database…** in the menu of the connection
 * island, **Rename collection…** and **Drop collection…** from Go to on the active tab, the Definition section of a
 * view and the Validation section of a collection with `Ctrl+S`; each with the keyboard and the accessibility check
 * in both themes (QA15, QA16).
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, openCollection, startWithMongo, testMongo } from '../query/collection-app';
import { closeAll, goTo } from '../table/parts-app';

const mongo = testMongo();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async () => Promise.resolve());
});

test.afterAll(async () => {
  await mongo.stop();
});

test.beforeEach(async () => {
  await mongo.use(async (db) => {
    await db('shop').dropDatabase();
    await db('shop')
      .collection('orders')
      .insertMany([
        { _id: 1 as never, status: 'paid', total: 10 },
        { _id: 2 as never, status: 'new', total: 20 },
        { _id: 3 as never, status: 'paid', total: 30 },
      ]);
    await db('shop').createCollection('recent', { viewOn: 'orders', pipeline: [{ $match: { status: 'paid' } }] });
  });
});

test.afterEach(async () => {
  await closeAll(running);
});

async function started(): Promise<Page> {
  const app = await startWithMongo(mongo);
  running.push(app);
  return app.window;
}

async function collections(): Promise<readonly string[]> {
  return mongo.use(async (db) =>
    (await db('shop').listCollections().toArray())
      .map((each) => each.name)
      .filter((name) => !name.startsWith('system.'))
      .sort(),
  );
}

/** The editor whose content has the focus: its lines replaced by `text`, as a paste does. */
async function replaceFocusedText(window: Page, text: string): Promise<void> {
  await window.keyboard.press('Control+A');
  await window.keyboard.insertText(text);
}

test.describe('manage.create-database', () => {
  test('Create database… in the menu of the connection island creates it and opens its first collection', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await window.locator('[data-feature="connection.menu@connection-island"]').click();
    await window.getByRole('menuitem', { name: 'Create database…' }).click();
    const form = window.getByRole('dialog', { name: 'Create database' });
    await expect(form).toBeVisible();
    await form.getByLabel('Database name on Local').fill('shop');
    await expect(form).toContainText('This database already exists');
    await expect(form.getByRole('button', { name: 'Create' })).toBeDisabled();
    await form.getByLabel('Database name on Local').fill('sales');
    await form.getByLabel(/^Name of its first collection/u).fill('invoices');
    await bothThemes(window);
    await form.getByRole('button', { name: 'Create' }).click();
    await expect(window.getByRole('tab', { name: /invoices/u })).toHaveAttribute('aria-selected', 'true');
    const names = await mongo.use(async (db) => (await db('sales').listCollections().toArray()).map((e) => e.name));
    expect(names).toEqual(['invoices']);
    await mongo.use((db) => db('sales').dropDatabase());
  });
});

test.describe('manage.rename-collection', () => {
  test('Rename collection… from Go to renames orders, and its tab shows the new name with its documents', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await openCollection(window, 'shop', 'orders');
    await expect(window.getByRole('tab', { name: /orders/u })).toHaveAttribute('aria-selected', 'true');
    await goTo(window, 'Rename collection…');
    const form = window.getByRole('dialog', { name: 'Rename collection shop.orders' });
    await expect(form.getByLabel('New name')).toHaveValue('orders');
    await bothThemes(window);
    await form.getByLabel('New name').fill('orders_2024');
    await window.keyboard.press('Enter');
    await expect(window.getByRole('tab', { name: /orders_2024/u })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(collections).toEqual(['orders_2024', 'recent']);
    await expect(window.getByRole('grid', { name: 'Documents' })).toContainText('"paid"');
  });
});

test.describe('manage.drop-collection', () => {
  test('Drop collection… asks to type orders: Drop stays disabled until it is typed, then the tab closes', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await openCollection(window, 'shop', 'orders');
    await expect(window.getByRole('tab', { name: /orders/u })).toBeVisible();
    await goTo(window, 'Drop collection…');
    const dialog = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    await expect(dialog).toContainText('Deletes 3 documents and 1 index. This cannot be undone.');
    const drop = dialog.getByRole('button', { name: 'Drop' });
    await expect(drop).toBeDisabled();
    await bothThemes(window);
    await dialog.getByLabel('Type orders to confirm').fill('Orders');
    await expect(drop).toBeDisabled();
    await dialog.getByLabel('Type orders to confirm').fill('orders');
    await drop.click();
    await expect.poll(collections).toEqual(['recent']);
    await expect(window.getByRole('tab', { name: /orders/u })).toHaveCount(0);
  });
});

test.describe('manage.definition', () => {
  test('the Definition section of a view shows viewOn and its pipeline; [] is refused under the editor', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await openCollection(window, 'shop', 'recent', true);
    const bar = window.getByRole('toolbar', { name: 'Sections' });
    await expect(bar.getByRole('button', { name: 'Validation' })).toHaveCount(0);
    await bar.getByRole('button', { name: 'Definition' }).click();
    const editor = window.locator('[data-feature="manage.edit-view@editor"]');
    await expect(editor).toContainText('viewOn: "orders"');
    const save = window.locator('[data-feature="manage.edit-view@toolbar"]');
    await expect(save).toBeDisabled();
    await bothThemes(window);
    await editor.getByRole('textbox').click();
    await replaceFocusedText(window, '[]');
    await expect(save).toBeEnabled();
    await window.keyboard.press('Control+S');
    await expect(window.getByRole('alert').filter({ hasText: 'The definition must be an object' })).toBeVisible();
    await replaceFocusedText(window, '{ viewOn: "orders", pipeline: [{ $match: { status: "new" } }] }');
    await window.keyboard.press('Control+S');
    await expect(save).toBeDisabled();
    await bar.getByRole('button', { name: 'Documents' }).click();
    await expect(window.getByRole('grid', { name: 'Documents' })).toContainText('"new"');
  });
});

test.describe('manage.validation', () => {
  test('the Validation section proposes rules generated from 3 documents, and Ctrl+S applies them', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await openCollection(window, 'shop', 'orders');
    const bar = window.getByRole('toolbar', { name: 'Sections' });
    await expect(bar.getByRole('button', { name: 'Definition' })).toHaveCount(0);
    await bar.getByRole('button', { name: 'Validation' }).click();
    await expect(
      window.getByText(/orders has no validation rules: this \$jsonSchema was generated from 3 documents/u),
    ).toBeVisible();
    const editor = window.locator('[data-feature="manage.edit-validation@editor"]');
    await expect(editor).toContainText('validationLevel: "strict"');
    await bothThemes(window);
    await editor.getByRole('textbox').click();
    await window.keyboard.press('Control+S');
    await expect(window.getByText('Applied the validation rules of shop.orders.', { exact: true })).toBeVisible();
    const options = await mongo.use(async (db) => (await db('shop').listCollections({ name: 'orders' }).toArray())[0]);
    expect(JSON.stringify(options)).toContain('$jsonSchema');
  });
});
