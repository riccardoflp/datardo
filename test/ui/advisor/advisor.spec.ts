/**
 * The Index advisor driven through the window (`advisor.show`, `advisor.turn-on-profiler`), on a mongod of this file:
 * opened on a database, its summary, where the slow operations come from and its three lists; **Create index…**,
 * which opens the index dialog with the keys of the advice and analyzes again once the index exists; **+N more
 * queries**; **Turn on…** with its confirmation; from the keyboard, and the accessibility check in both themes (QA15,
 * QA16). The profiler is turned off after each test.
 */
import { expect, test, type Page } from '@playwright/test';
import { Int32 } from 'mongodb';
import type { StartedApp } from '../app';
import { bothThemes, firstConnection, startIntent, startWithMongo, testMongo } from '../query/collection-app';
import { closeAll } from '../table/parts-app';

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
      .collection<{ _id: Int32 }>('orders')
      .insertMany(
        Array.from({ length: 300 }, (_, index) => ({
          _id: new Int32(index),
          customerId: new Int32(index % 30),
          createdAt: new Date(Date.UTC(2026, 10, 1) + index * 60_000),
        })),
      );
    await db('shop').collection('orders').createIndex({ note: 1 });
  });
});

test.afterEach(async () => {
  await closeAll(running);
  await mongo.use(async (db) => db('shop').command({ profile: 0, slowms: 100 }));
});

async function openAdvisor(): Promise<Page> {
  const started = await startWithMongo(mongo);
  running.push(started);
  const { window } = started;
  const connection = await firstConnection(window);
  await startIntent(window, 'advisor.show', { database: 'shop' }, { kind: 'database', connection, database: 'shop' });
  await expect(window.getByRole('toolbar', { name: 'Index advisor · shop' })).toBeVisible();
  return window;
}

function listOf(window: Page, name: string) {
  return window.getByRole('region', { name });
}

test.describe('advisor.show', () => {
  test('shows the summary, the sources and the lists; Create index… opens the dialog and the page analyzes again', async () => {
    test.setTimeout(120_000);
    await mongo.use(async (db) => {
      await db('shop').command({ profile: 1, slowms: 0 });
      for (let each = 0; each < 10; each += 1) {
        await db('shop')
          .collection('orders')
          .find({ customerId: new Int32(each) })
          .sort({ createdAt: -1 })
          .toArray();
      }
      await db('shop').command({ profile: 0, slowms: 100 });
    });
    const window = await openAdvisor();
    await expect(window.getByRole('status').filter({ hasText: 'collection' })).toContainText(
      /1 collection · 2 indexes · .* of indexes · \d+ suggestions?/u,
    );
    const create = listOf(window, 'Indexes to create');
    await expect(create).toContainText('{ customerId: 1, createdAt: -1 }');
    await expect(create).toContainText('read the whole collection');
    await expect(listOf(window, 'Unused indexes')).toContainText('Use is counted since the server started');
    await bothThemes(window);
    await create.getByRole('button', { name: 'Create index…' }).click();
    const dialog = window.getByRole('dialog', { name: 'Create index · orders' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Field 1', { exact: true })).toHaveValue('customerId');
    await expect(dialog.getByLabel('Field 2', { exact: true })).toHaveValue('createdAt');
    await dialog.getByLabel('Field 1', { exact: true }).focus();
    await window.keyboard.press('Control+Enter');
    await expect(dialog).toBeHidden();
    await expect
      .poll(() => mongo.use(async (db) => (await db('shop').collection('orders').indexes()).map((each) => each.name)))
      .toContain('customerId_1_createdAt_-1');
    await expect(create).toContainText('No slow operation needs a new index.');
  });

  test('Refresh is reached from the keyboard and analyzes again', async () => {
    test.setTimeout(120_000);
    const window = await openAdvisor();
    const toolbar = window.getByRole('toolbar', { name: 'Index advisor · shop' });
    await expect(toolbar).toContainText(/Analyzed at \d\d:\d\d:\d\d/u);
    await toolbar.getByRole('button', { name: 'Refresh' }).focus();
    await window.keyboard.press('Enter');
    await expect(toolbar.getByRole('button', { name: 'Refresh' })).toBeVisible();
    await expect(listOf(window, 'Redundant indexes')).toContainText('No index is the start of another one.');
    await bothThemes(window);
  });
});

test.describe('advisor.turn-on-profiler', () => {
  test('Turn on… asks first, then turns the profiler of shop on and analyzes again', async () => {
    test.setTimeout(120_000);
    const window = await openAdvisor();
    const turnOn = window.locator('[data-feature="advisor.turn-on-profiler@toolbar"]');
    await expect(turnOn).toBeVisible();
    await expect(window.getByText('The profiler of shop is off', { exact: false })).toBeVisible();
    await turnOn.click();
    const confirmation = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    await expect(confirmation).toContainText('Turn on the profiler of shop?');
    await confirmation.getByRole('button', { name: 'Turn on' }).click();
    await expect
      .poll(() => mongo.use(async (db) => (await db('shop').command({ profile: -1 }))['was'] as number))
      .toBe(1);
    await expect(turnOn).toBeHidden();
  });
});
