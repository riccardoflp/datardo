/**
 * The document history through the window (M27): **History** in the inspector of a document opens its tab, which lists
 * the writes read from the oplog, newest first; the arrows choose one, Enter moves to its version in the inspector,
 * and **Restore this version…** writes it back after a confirmation. With the accessibility check in both themes.
 */
import { expect, test } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, openCollection, startWithMongo } from '../query/collection-app';
import { cellAt, closeAll } from '../table/parts-app';
import { testReplicaSet } from '../watch/replica-app';

const mongo = testReplicaSet();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async (db) => {
    const orders = db('shop').collection('orders');
    await orders.insertOne({ _id: 1 as never, status: 'new', total: 10 });
    await orders.updateOne({ _id: 1 as never }, { $set: { status: 'paid' } });
    await orders.updateOne({ _id: 1 as never }, { $set: { status: 'sent' }, $inc: { total: 5 } });
  });
});

test.afterAll(async () => {
  await mongo.stop();
});

test.afterEach(async () => {
  await closeAll(running);
});

async function status(): Promise<unknown> {
  return mongo.use(async (db) => {
    const order = await db('shop')
      .collection('orders')
      .findOne({ _id: 1 as never });
    return order?.['status'] as unknown;
  });
}

test.describe('history.show', () => {
  test('History in the inspector lists the writes, newest first; a version is restored after a confirmation', async () => {
    test.setTimeout(150_000);
    const started = await startWithMongo(mongo);
    running.push(started);
    const { window } = started;
    await openCollection(window, 'shop', 'orders');
    await expect(cellAt(window, 0, 1)).toBeVisible();
    await cellAt(window, 0, 1).click();
    await window.keyboard.press('Enter');
    const inspector = window.locator('[data-feature="document.inspect@table"]');
    await expect(inspector).toBeVisible();
    await inspector.locator('[data-feature="history.show@inspector"]').click();

    const list = window.getByRole('grid', { name: 'Document history' });
    await expect(list.getByRole('row')).toHaveCount(4, { timeout: 30_000 });
    await expect(list.getByRole('row').nth(1)).toContainText(/update/iu);
    await expect(list.getByRole('row').nth(3)).toContainText(/insert/iu);
    await expect(window.getByRole('tab', { name: /History: 1/u })).toBeVisible();
    await bothThemes(window);

    await list.focus();
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('ArrowDown');
    await expect(list.getByRole('row').nth(3)).toHaveAttribute('aria-selected', 'true');
    await window.keyboard.press('Enter');
    const restore = window.getByRole('button', { name: 'Restore this version…' });
    await expect(restore).toBeVisible();
    await bothThemes(window);
    await restore.click();
    const dialog = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    await expect(dialog).toBeVisible();
    await bothThemes(window);
    await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect.poll(status).toBe('new');
    await expect(list.getByRole('row')).toHaveCount(5, { timeout: 30_000 });
  });
});
