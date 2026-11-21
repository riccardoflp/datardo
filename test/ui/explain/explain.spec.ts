/**
 * The Explain section driven through the window (M23): the explain of a find without an index, its verdict, numbers,
 * note, suggested index and winning plan; **Create…** that opens the index dialog with the suggested keys, and the
 * explain after the index exists; **Raw** and **Summary**; a sort that is not valid; a read-only connection; with the
 * keyboard and the accessibility check in both themes (QA15, QA16).
 */
import { expect, test, type Page } from '@playwright/test';
import { Int32 } from 'mongodb';
import type { StartedApp } from '../app';
import {
  bothThemes,
  firstConnection,
  openCollection,
  setEditor,
  startIntent,
  startWithMongo,
  testMongo,
} from '../query/collection-app';
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
      .collection<{ _id: Int32 }>('orders')
      .insertMany(
        Array.from({ length: 1000 }, (_, index) => ({
          _id: new Int32(index),
          status: index % 333 === 1 ? 'paid' : 'new',
          total: new Int32(index),
        })),
      );
  });
});

test.afterEach(async () => {
  await closeAll(running);
});

function sectionOf(window: Page) {
  return window.getByRole('region', { name: 'Explain' });
}

function planOf(window: Page) {
  return sectionOf(window).getByRole('region', { name: 'Winning plan' });
}

async function explainPaid(): Promise<Page> {
  const started = await startWithMongo(mongo);
  running.push(started);
  const { window } = started;
  await openCollection(window, 'shop', 'orders');
  await expect(window.getByRole('region', { name: 'Documents' })).toBeVisible();
  await setEditor(window, 'Filter', '{ status: "paid" }');
  await window.locator('[data-feature="explain.show@query-bar"]').first().click();
  await expect(sectionOf(window)).toContainText('Explain · find');
  await expect(planOf(window)).toContainText('COLLSCAN');
  return window;
}

test.describe('explain.show', () => {
  test('shows COLLSCAN, the numbers, the note, the suggested index and a plan of one row on a find without an index', async () => {
    test.setTimeout(120_000);
    const window = await explainPaid();
    const section = sectionOf(window);
    await expect(section.locator('[data-tone="warning"]').first()).toContainText('COLLSCAN');
    await expect(section.locator('dl')).toContainText('returned3');
    await expect(section.locator('dl')).toContainText('documents examined1,000');
    await expect(section).toContainText('333 documents examined for each one returned.');
    await expect(section).toContainText('Suggested index:{ status: 1 }');
    await expect(planOf(window).getByRole('listitem')).toHaveCount(1);
    await bothThemes(window);
  });

  test('Create… opens the index dialog with the suggested keys; once created the explain uses the index', async () => {
    test.setTimeout(120_000);
    const window = await explainPaid();
    await sectionOf(window).getByRole('button', { name: 'Create…' }).click();
    const dialog = window.getByRole('dialog', { name: 'Create index · orders' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Field 1', { exact: true })).toHaveValue('status');
    await expect(dialog).toContainText('db.getCollection("orders").createIndex({ status: 1 })');
    await dialog.getByLabel('Field 1', { exact: true }).focus();
    await window.keyboard.press('Control+Enter');
    await expect(dialog).toBeHidden();
    await expect
      .poll(() => mongo.use(async (db) => (await db('shop').collection('orders').indexes()).map((each) => each.name)))
      .toContain('status_1');
    await window.getByRole('search').locator('[data-feature="explain.run@query-bar"]').click();
    await expect(sectionOf(window)).toContainText('index status_1');
    await expect(planOf(window).getByRole('listitem')).toHaveText([/^FETCH/u, /^└ IXSCAN/u]);
    await expect(sectionOf(window)).not.toContainText('Suggested index:');
  });

  test('shows the suggestion without Create… on a read-only connection', async () => {
    test.setTimeout(120_000);
    const window = await explainPaid();
    await startIntent(window, 'connection.read-only', null, {
      kind: 'connection',
      connection: await firstConnection(window),
    });
    await window.getByRole('search').locator('[data-feature="explain.run@query-bar"]').click();
    await expect(sectionOf(window)).toContainText('Suggested index:');
    await expect(sectionOf(window).getByRole('button', { name: 'Create…' })).toHaveCount(0);
  });
});

test.describe('explain.raw', () => {
  test('Raw shows the output at its first level in the server order, and Summary shows the summary again', async () => {
    test.setTimeout(120_000);
    const window = await explainPaid();
    await sectionOf(window).locator('[data-feature="explain.raw@toolbar"]').click();
    const raw = sectionOf(window).getByRole('list', { name: 'Raw' });
    const first = raw.locator(':scope > li').filter({ hasText: /^▾?\s*\w+: [{[]/u });
    await expect(raw).toContainText('queryPlanner: {');
    await expect(raw).toContainText('executionStats: {');
    await expect(raw).toContainText('serverInfo: {');
    expect(await first.count()).toBeGreaterThan(0);
    await bothThemes(window);
    await sectionOf(window).getByRole('button', { name: 'Summary' }).click();
    await expect(planOf(window)).toContainText('COLLSCAN');
  });
});

test.describe('explain.run', () => {
  test('a sort that is not valid sends nothing and is marked; Run explain from Go to runs it again', async () => {
    test.setTimeout(120_000);
    const window = await explainPaid();
    await setEditor(window, 'Sort', '{ total: ');
    await window.getByRole('search').locator('[data-feature="explain.run@query-bar"]').click();
    await expect(sectionOf(window)).toContainText('Invalid query syntax — check the highlighted field.');
    await expect(window.getByRole('search').locator('[data-field="sort"]').first()).toBeVisible();
    await setEditor(window, 'Sort', '{ total: -1 }');
    await goTo(window, 'Run explain');
    await expect(sectionOf(window)).toContainText('in-memory sort');
  });
});
