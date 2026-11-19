/**
 * `query.run`, `query.count`, `query.restore` and the keys of the query bar driven through the window: a collection
 * tab runs its query when it opens and the status line counts the documents; a query run is kept by the tab and runs
 * again at the next start; `Ctrl+F` and Go to reach the bar.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { firstWindow, type StartedApp } from '../app';
import {
  addMongo,
  documentsOf,
  editorText,
  fieldOf,
  openCollection,
  setEditor,
  startWithMongo,
  testMongo,
  documentRows,
} from './collection-app';

const mongo = testMongo();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async (db) => {
    const shop = db('shop');
    await shop.collection('orders').insertMany([
      { n: 1, status: 'paid', total: 30 },
      { n: 2, status: 'open', total: 10 },
      { n: 3, status: 'paid', total: 20 },
    ]);
    await shop.createCollection('paid_orders', { viewOn: 'orders', pipeline: [{ $match: { status: 'paid' } }] });
  });
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
});

async function started(): Promise<Page> {
  const app = await startWithMongo(mongo);
  running.push(app);
  return app.window;
}

function statusOf(window: Page) {
  return window.getByRole('contentinfo');
}

test.describe('query.run', () => {
  test('a collection tab runs its query when it opens and shows the documents of the page', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await openCollection(window, 'shop', 'orders');
    await expect(documentRows(window)).toHaveCount(3);
    await expect(statusOf(window).getByText(/^3 of 3 documents · \d+ ms$/u)).toBeVisible();
  });

  test('a filter, a sort and a projection run show the matching documents in their order with their fields', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await openCollection(window, 'shop', 'orders');
    await expect(documentRows(window)).toHaveCount(3);
    await setEditor(window, 'Filter', '{ status: "paid" }');
    await setEditor(window, 'Project', '{ total: 1, _id: 0 }');
    await setEditor(window, 'Sort', '{ total: 1 }');
    await window.keyboard.press('Enter');
    await expect(documentRows(window)).toHaveCount(2);
    const grid = documentsOf(window).getByRole('grid');
    await expect(grid.getByRole('columnheader')).toHaveText(['#', 'total ▲']);
    await expect(grid.locator('td[data-pos$=":0:1"] [class*="cell-text"]')).toHaveText(['20', '30']);
    await expect(statusOf(window).getByText(/^2 of 2 documents · \d+ ms$/u)).toBeVisible();
  });

  test('on a view the query runs the same', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await openCollection(window, 'shop', 'paid_orders', true);
    await expect(documentRows(window)).toHaveCount(2);
    await expect(statusOf(window).getByText(/^2 of 2 documents · \d+ ms$/u)).toBeVisible();
  });
});

test.describe('query.count', () => {
  test('the total of the status line follows the filter, and a click on it counts again', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await openCollection(window, 'shop', 'orders');
    const count = statusOf(window).locator('[data-feature="query.count@status-line"]');
    await expect(count).toHaveText(/^3 of 3 documents/u);
    await setEditor(window, 'Filter', '{ status: "open" }');
    await window.keyboard.press('Control+Enter');
    await expect(count).toHaveText(/^1 of 1 documents/u);
    await mongo.use(async (db) => {
      await db('shop').collection('orders').insertOne({ n: 4, status: 'open', total: 5 });
    });
    await count.click();
    await expect(count).toHaveText(/^1 of 2 documents/u);
    await expect(documentRows(window)).toHaveCount(1);
    await mongo.use(async (db) => {
      await db('shop').collection('orders').deleteOne({ n: 4 });
    });
  });
});

test.describe('query.count on the paging row', () => {
  test('an estimated total has the tooltip and counts exactly on a click; an exact one is not a button', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await openCollection(window, 'shop', 'orders');
    const paging = window.getByRole('group', { name: 'Paging' });
    const total = paging.locator('[data-feature="query.count@paging"]');
    await expect(total).toHaveText('3');
    await expect(total).toHaveAttribute('title', /^Estimated: the count the collection keeps of itself/u);
    await total.click();
    await expect(total).toHaveCount(0);
    await expect(paging.getByRole('status')).toHaveText('1–3 of 3');
    await setEditor(window, 'Filter', '{ status: "paid" }');
    await window.keyboard.press('Control+Enter');
    await expect(paging.getByRole('status')).toHaveText('1–2 of 2');
    await expect(total).toHaveCount(0);
  });
});

test.describe('query.bar', () => {
  test('Ctrl+F puts the cursor in Filter with its text selected, and Go to has Focus filter', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await openCollection(window, 'shop', 'orders');
    await expect(documentRows(window)).toHaveCount(3);
    await setEditor(window, 'Filter', '{ n: 1 }');
    await window.getByRole('region', { name: 'Documents' }).click();
    await window.keyboard.press('Control+F');
    await expect(fieldOf(window, 'Filter')).toBeFocused();
    await window.keyboard.type('{ n: 2 }');
    expect(await editorText(window, 'Filter')).toBe('{ n: 2 }');
    await window.keyboard.press('Control+Enter');
    await expect(documentRows(window)).toHaveCount(1);
    await documentsOf(window).click();
    await window.keyboard.press('Control+K');
    await window.keyboard.type('>Focus filter');
    await window.keyboard.press('Enter');
    await expect(fieldOf(window, 'Filter')).toBeFocused();
  });
});

test.describe('query.restore', () => {
  const apps: ElectronApplication[] = [];
  let folder = '';

  test.beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'datardo-ui-restore-'));
  });

  test.afterEach(async () => {
    for (const app of apps.splice(0)) {
      await app.close().catch((error: unknown) => {
        console.warn('Datardo was already closed:', error);
      });
    }
    await rm(folder, { recursive: true, force: true });
  });

  async function launch(): Promise<Page> {
    const app = await electron.launch({
      args: ['.'],
      env: {
        ...(process.env as Record<string, string>),
        DATARDO_TEST_UPDATE_ADDRESS: 'http://127.0.0.1:9/',
        DATARDO_DATA: folder,
        DATARDO_TEST: '1',
      },
    });
    apps.push(app);
    const window = await firstWindow(app);
    await window.setViewportSize({ width: 1440, height: 900 });
    await expect(window.getByRole('navigation', { name: 'Rail' })).toBeVisible();
    return window;
  }

  test('a tab opens at the next start with the query last run, not a text typed and not run, and runs it', async () => {
    test.setTimeout(180_000);
    const first = await launch();
    await addMongo(first, mongo.uri());
    await openCollection(first, 'shop', 'orders');
    await expect(documentRows(first)).toHaveCount(3);
    await setEditor(first, 'Filter', '{ status: "paid" }');
    await first.keyboard.press('Control+Enter');
    await expect(documentRows(first)).toHaveCount(2);
    await setEditor(first, 'Filter', '{ status: ');
    await apps.splice(0)[0]?.close();
    const second = await launch();
    const reconnect = documentsOf(second).getByRole('button', { name: 'Reconnect' });
    if (await reconnect.isVisible()) {
      await reconnect.click();
    }
    await expect(documentRows(second)).toHaveCount(2);
    expect(await editorText(second, 'Filter')).toBe('{ status: "paid" }');
  });
});
