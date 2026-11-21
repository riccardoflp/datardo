/**
 * The Indexes section driven through the window (M22): the table of indexes with its sort and the search part of a
 * server without search, the index dialog (Form and Text, TTL ticked by its value, `Ctrl+Enter`), an edit refused by
 * the server that opens the dialog again on the error, the row menu and the keys of the table, the inspector with
 * **Copy**; with the keyboard and the accessibility check in both themes (QA15, QA16).
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, openCollection, startWithMongo, testMongo } from '../query/collection-app';
import { clearClipboard, clipboardText, closeAll, goTo } from '../table/parts-app';

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
    const orders = db('shop').collection('orders');
    await orders.insertMany([
      { _id: 1 as never, email: 'a@b.c', status: 'paid', createdAt: new Date('2026-11-01') },
      { _id: 2 as never, email: 'a@b.c', status: 'new', createdAt: new Date('2026-11-02') },
      { _id: 3 as never, email: 'd@e.f', status: 'paid', createdAt: new Date('2026-11-03') },
    ]);
    await orders.createIndexes([
      { key: { status: 1 }, name: 'status_1' },
      { key: { email: 1 }, name: 'email_1' },
    ]);
  });
});

test.afterEach(async () => {
  await closeAll(running);
});

async function started(): Promise<StartedApp> {
  const app = await startWithMongo(mongo);
  running.push(app);
  await openCollection(app.window, 'shop', 'orders');
  await app.window.getByRole('toolbar', { name: 'Sections' }).getByRole('button', { name: 'Indexes' }).click();
  await expect(gridOf(app.window)).toContainText('status_1');
  return app;
}

function gridOf(window: Page) {
  return window.getByRole('grid', { name: 'Indexes' });
}

async function indexNames(): Promise<readonly string[]> {
  return mongo.use(async (db) => (await db('shop').collection('orders').indexes()).map((each) => String(each.name)));
}

test.describe('index.show', () => {
  test('lists the indexes, sorts them by name, and says that the server has no search', async () => {
    test.setTimeout(120_000);
    const { window } = await started();
    const section = window.getByRole('toolbar', { name: 'Sections' }).getByRole('button', { name: 'Indexes' });
    await expect(section).toHaveAttribute('aria-pressed', 'true');
    await expect(window.getByRole('toolbar', { name: 'Indexes', exact: true })).toContainText('3 indexes');
    await gridOf(window).getByRole('button', { name: /^Name/u }).click();
    const names = gridOf(window).locator('tbody tr td:first-child');
    await expect(names).toHaveText(['_id_', 'email_1', 'status_1']);
    await expect(window.getByRole('region', { name: 'Search indexes' })).toContainText('this server has no search');
    await expect(window.locator('[data-feature="index.create-search@toolbar"]')).toBeDisabled();
    await bothThemes(window);
  });
});

test.describe('index.dialog', () => {
  test('Create index… with a field, TTL ticked by its value and Text shows the command; Ctrl+Enter creates it', async () => {
    test.setTimeout(120_000);
    const { window } = await started();
    await window.locator('[data-feature="index.create@toolbar"]').click();
    const dialog = window.getByRole('dialog', { name: 'Create index · orders' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Field 1', { exact: true }).fill('createdAt');
    await dialog.getByLabel('TTL: after how long').fill('2');
    await dialog.getByLabel('TTL: unit').selectOption('hours');
    await expect(dialog.getByRole('checkbox', { name: 'TTL' })).toBeChecked();
    await expect(dialog).toContainText(
      'db.getCollection("orders").createIndex({ createdAt: 1 }, { expireAfterSeconds: 7200 })',
    );
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'createdAt_1');
    await bothThemes(window);
    await dialog.getByRole('button', { name: 'Text' }).click();
    await expect(dialog.getByRole('button', { name: 'Text' })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog).toContainText('expireAfterSeconds: 7200');
    await dialog.getByRole('button', { name: 'Form' }).click();
    await expect(dialog.getByLabel('Field 1', { exact: true })).toHaveValue('createdAt');
    await dialog.getByLabel('Field 1', { exact: true }).focus();
    await window.keyboard.press('Control+Enter');
    await expect(dialog).toBeHidden();
    await expect.poll(indexNames).toContain('createdAt_1');
    await expect(gridOf(window)).toContainText('createdAt_1');
  });

  test('two rows of the same field are refused before anything is sent, and Escape closes the dialog', async () => {
    test.setTimeout(120_000);
    const { window } = await started();
    await goTo(window, 'Create index…');
    const dialog = window.getByRole('dialog', { name: 'Create index · orders' });
    await dialog.getByLabel('Field 1', { exact: true }).fill('total');
    await dialog.getByRole('button', { name: '+ Field' }).click();
    await dialog.getByLabel('Field 2', { exact: true }).fill('total');
    await dialog.getByRole('button', { name: 'Create index' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('The field total is listed twice.');
    await window.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await indexNames()).toEqual(['_id_', 'status_1', 'email_1']);
  });
});

test.describe('index.edit', () => {
  test('Unique on a field with duplicates opens the dialog again on the error, the index created again as it was', async () => {
    test.setTimeout(120_000);
    const { window } = await started();
    await gridOf(window)
      .getByRole('row', { name: /email_1/u })
      .click();
    await gridOf(window).focus();
    await window.keyboard.press('Enter');
    const dialog = window.getByRole('dialog', { name: 'Edit index · email_1' });
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await expect(dialog).toContainText('No changes yet.');
    await dialog.getByRole('checkbox', { name: 'Unique' }).check();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    const confirmation = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    await expect(confirmation).toContainText('Drop and recreate the index email_1 of orders?');
    await confirmation.getByRole('button', { name: 'Drop and recreate' }).click();
    const again = window.getByRole('dialog', { name: 'Edit index · email_1' });
    await expect(again.getByRole('alert')).toContainText('E11000');
    await expect(again.getByRole('alert')).toContainText('The index email_1 was created again as it was.');
    await expect(again.getByRole('checkbox', { name: 'Unique' })).toBeChecked();
    await bothThemes(window);
    await again.getByRole('button', { name: 'Cancel' }).click();
    const email = await mongo.use(async (db) =>
      (await db('shop').collection('orders').indexes()).find((each) => each.name === 'email_1'),
    );
    expect(email?.unique).toBeUndefined();
  });
});

test.describe('index.drop', () => {
  test('Drop in the row menu asks to type the name of the index, then drops it', async () => {
    test.setTimeout(120_000);
    const { window } = await started();
    await gridOf(window).getByRole('button', { name: 'Actions of status_1' }).click();
    await window.getByRole('menuitem', { name: 'Drop' }).click();
    const dialog = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    await expect(dialog).toContainText('Drop index status_1 on orders?');
    await dialog.getByLabel('Type status_1 to confirm').fill('status_1');
    await dialog.getByRole('button', { name: 'Drop' }).click();
    await expect.poll(indexNames).toEqual(['_id_', 'email_1']);
    await expect(gridOf(window)).not.toContainText('status_1');
  });
});

test.describe('index.inspect', () => {
  test('the arrows select an index, which the inspector shows with its command, and Copy copies it', async () => {
    test.setTimeout(120_000);
    const app = await started();
    const { window } = app;
    await clearClipboard(app);
    await gridOf(window).focus();
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('ArrowDown');
    const inspector = window.locator('[data-feature="index.inspect@inspector"]');
    await expect(inspector).toContainText('status_1');
    await expect(inspector).toContainText('db.getCollection("orders").createIndex({ status: 1 })');
    await bothThemes(window);
    await inspector.getByRole('button', { name: 'Copy' }).click();
    await expect.poll(() => clipboardText(app)).toBe('db.getCollection("orders").createIndex({ status: 1 })');
  });
});
