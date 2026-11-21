/**
 * Watch changes through the window (M27): **Watch changes** under **Pages of** the connection watches all databases in
 * a tab named after the connection; the change events arrive in the list, newest first; the arrows choose one and
 * Enter moves to it in the inspector; the type toggles hide some; **Stop** ends the stream. From the toolbar of a
 * collection, the page watches the collection, and **Filter** is applied by the server. With the accessibility check
 * in both themes.
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, openCollection, startWithMongo } from '../query/collection-app';
import { closeAll } from '../table/parts-app';
import { testReplicaSet } from './replica-app';

const mongo = testReplicaSet();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async (db) => {
    await db('shop')
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

function listOf(window: Page) {
  return window.getByRole('grid', { name: 'Watch changes' });
}

function toolbarOf(window: Page) {
  return window.getByRole('toolbar', { name: 'Watch changes' });
}

async function watching(window: Page): Promise<void> {
  await expect(toolbarOf(window).getByRole('status')).toContainText('Watching', { timeout: 30_000 });
}

/** The filter and the status of the stream of the only Watch changes page, as the app's state holds them. */
async function streamOf(window: Page): Promise<unknown> {
  return window.evaluate(async () => {
    const bridge = (
      globalThis as unknown as {
        datardo: { state: () => Promise<{ watch: Record<string, { filter: string; status: string }> }> };
      }
    ).datardo;
    const pages = Object.values((await bridge.state()).watch);
    return pages.length === 1 ? { filter: pages[0]?.filter, status: pages[0]?.status } : undefined;
  });
}

test.describe('watch.show', () => {
  test('Watch changes in the tree watches all databases; the events are read with the keyboard', async () => {
    test.setTimeout(150_000);
    const started = await startWithMongo(mongo);
    running.push(started);
    const { window } = started;
    await window
      .getByRole('tree', { name: 'Tree' })
      .getByRole('treeitem', { name: /^Watch changes/u })
      .click();
    await expect(window.getByRole('tab', { name: /Watch: Local/u })).toBeVisible();
    await expect(toolbarOf(window)).toContainText('all databases');
    await watching(window);

    await mongo.use(async (db) => {
      await db('shop')
        .collection('orders')
        .insertOne({ _id: 2 as never, status: 'paid' });
      await db('crm')
        .collection('people')
        .insertOne({ _id: 7 as never, name: 'Ada' });
    });
    const list = listOf(window);
    await expect(list.getByRole('row')).toHaveCount(3, { timeout: 30_000 });
    await expect(list.getByRole('row').nth(1)).toContainText('people');
    await bothThemes(window);

    await list.focus();
    await window.keyboard.press('ArrowDown');
    await expect(list.getByRole('row').nth(1)).toHaveAttribute('aria-selected', 'true');
    await window.keyboard.press('Enter');
    await expect(window.getByRole('heading', { name: 'insert · crm.people' })).toBeVisible();
    await bothThemes(window);

    const insert = window.getByRole('group', { name: 'Types of change events' }).getByRole('button', {
      name: /^insert/u,
    });
    await insert.click();
    await expect(insert).toHaveAttribute('aria-pressed', 'false');
    await expect(window.getByText('No change event matches the filters.')).toBeVisible();

    await toolbarOf(window).getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(toolbarOf(window).getByRole('status')).toContainText('Stopped');
    await bothThemes(window);
  });

  test('from the toolbar of a collection, the filter is applied by the server', async () => {
    test.setTimeout(150_000);
    const started = await startWithMongo(mongo);
    running.push(started);
    const { window } = started;
    await openCollection(window, 'shop', 'orders');
    await window.locator('[data-feature="watch.show@toolbar"]').click();
    await expect(window.getByRole('tab', { name: /Watch: orders/u })).toBeVisible();
    await watching(window);

    const filter = window.getByRole('textbox', { name: /^Filter/u });
    await filter.fill('{ "operationType": "update" }');
    await filter.press('Enter');
    await expect
      .poll(async () => streamOf(window), { timeout: 30_000 })
      .toEqual({
        filter: '{ "operationType": "update" }',
        status: 'watching',
      });
    await mongo.use(async (db) => {
      const orders = db('shop').collection('orders');
      await orders.insertOne({ _id: 3 as never, status: 'new' });
      await orders.updateOne({ _id: 3 as never }, { $set: { status: 'paid' } });
    });
    const list = listOf(window);
    await expect(list.getByRole('row')).toHaveCount(2, { timeout: 30_000 });
    await expect(list.getByRole('row').nth(1)).toContainText(/update/iu);
    await bothThemes(window);
  });
});
