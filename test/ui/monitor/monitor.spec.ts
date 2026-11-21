/**
 * The Monitor page driven through the window (`monitor.show`, `monitor.operations`, `monitor.kill-operation`,
 * `monitor.slow-queries`, `monitor.set-profiler`, `monitor.create-suggested-index`, `monitor.stats`,
 * `monitor.replication` and `monitor.sharding` on a standalone server), on a mongod of this file: opened from Go to,
 * its sections chosen with the keyboard, the operations in progress with **Kill…** from the menu of a row, the slow
 * queries by query shape with the index one suggests created from the inspector island, the profiler set from the
 * section, the statistics of the server, of its databases and of the collections of one, and the sentences of a
 * standalone server. Each section is checked for accessibility in both themes (QA15, QA16). The profiler is turned
 * off after each test. `replication.spec.ts` and `sharding.spec.ts` drive the other two sections on a replica set and
 * on a sharded cluster.
 */
import { expect, test, type Page } from '@playwright/test';
import { Int32 } from 'mongodb';
import type { StartedApp } from '../app';
import { bothThemes, startWithMongo, testMongo } from '../query/collection-app';
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
        Array.from({ length: 300 }, (_, index) => ({
          _id: new Int32(index),
          status: index % 3 === 0 ? 'paid' : 'new',
        })),
      );
  });
});

test.afterEach(async () => {
  await closeAll(running);
  await mongo.use(async (db) => db('shop').command({ profile: 0, slowms: 100 }));
});

async function openMonitor(): Promise<Page> {
  const started = await startWithMongo(mongo);
  running.push(started);
  const { window } = started;
  await goTo(window, 'Monitor');
  await expect(window.getByRole('tablist', { name: 'Sections of the Monitor page' })).toBeVisible();
  return window;
}

function panelOf(window: Page, name: string) {
  return window.getByRole('tabpanel', { name });
}

test.describe('monitor.show', () => {
  test('opens on Operations from Go to, shows the built sections, and moves between them with the arrows', async () => {
    test.setTimeout(120_000);
    const window = await openMonitor();
    const bar = window.getByRole('tablist', { name: 'Sections of the Monitor page' });
    await expect(bar.getByRole('tab')).toHaveText(['Operations', 'Slow queries', 'Stats', 'Replication', 'Sharding']);
    await expect(bar.getByRole('tab', { name: 'Operations' })).toHaveAttribute('aria-selected', 'true');
    await expect(window.getByRole('toolbar', { name: 'Toolbar of the Monitor page' })).toContainText('Auto');
    await bothThemes(window);
    await bar.getByRole('tab', { name: 'Operations' }).focus();
    await window.keyboard.press('ArrowRight');
    await expect(bar.getByRole('tab', { name: 'Slow queries' })).toHaveAttribute('aria-selected', 'true');
    await expect(bar.getByRole('tab', { name: 'Slow queries' })).toBeFocused();
    await expect(panelOf(window, 'Slow queries')).toContainText('Profiler off');
    await bothThemes(window);
  });
});

test.describe('monitor.operations', () => {
  test('lists a find that runs, and Kill… from the menu of its row asks first, then kills it', async () => {
    test.setTimeout(120_000);
    const sleeping = mongo
      .use(async (db) =>
        db('shop')
          .collection<{ _id: Int32 }>('orders')
          .find({ _id: new Int32(0), $where: 'sleep(30000) || true' })
          .toArray(),
      )
      .catch((error: unknown) => error);
    const window = await openMonitor();
    const panel = panelOf(window, 'Operations');
    await panel.getByRole('searchbox', { name: 'Filter by namespace, type, client or command' }).fill('sleep');
    await expect
      .poll(async () => {
        await window
          .getByRole('toolbar', { name: 'Toolbar of the Monitor page' })
          .getByRole('button', { name: 'Refresh' })
          .click();
        return panel.getByRole('row').count();
      })
      .toBe(2);
    const row = panel.getByRole('row').nth(1);
    await row.click();
    await expect(window.locator('[data-feature="monitor.kill-operation@inspector"]')).toBeVisible();
    await row.getByRole('button', { name: /^More/u }).click();
    await window.locator('[data-feature="monitor.kill-operation@row-menu"]').click();
    const confirmation = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    await expect(confirmation).toContainText(/Kill operation \d+\?/u);
    await confirmation.getByRole('button', { name: 'Kill' }).click();
    await expect(confirmation).toBeHidden();
    expect(String(await sleeping)).toMatch(/interrupted|killed/iu);
    await expect(panel).toContainText('No operation matches the filters.');
    await bothThemes(window);
  });
});

test.describe('monitor.slow-queries', () => {
  test('shows a collection scan repeated ten times as one row, and creates the index it suggests', async () => {
    test.setTimeout(120_000);
    await mongo.use(async (db) => {
      await db('shop').command({ profile: 1, slowms: 0 });
      for (let each = 0; each < 10; each += 1) {
        await db('shop')
          .collection('orders')
          .find({ status: each % 2 === 0 ? 'paid' : 'new' })
          .limit(50)
          .toArray();
      }
      await db('shop').command({ profile: 0, slowms: 0 });
    });
    const window = await openMonitor();
    await window.getByRole('tab', { name: 'Slow queries' }).click();
    const panel = panelOf(window, 'Slow queries');
    await expect(panel.getByRole('combobox', { name: 'Database' })).toHaveValue(/.+/u);
    const row = panel.getByRole('row').filter({ hasText: '{ status: ? }' });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('An index could help');
    await expect(row.getByRole('gridcell').first()).toHaveText('10');
    await panel.getByRole('grid').focus();
    await window.keyboard.press('ArrowDown');
    const create = window.locator('[data-feature="monitor.create-suggested-index@inspector"]');
    await expect(create).toBeVisible();
    await expect(window.getByText('An index on { status: 1 }', { exact: false })).toBeVisible();
    await bothThemes(window);
    await create.click();
    const confirmation = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    await expect(confirmation).toContainText('Create the index { status: 1 } on shop.orders?');
    await confirmation.getByRole('button', { name: 'Create index' }).click();
    await expect
      .poll(() => mongo.use(async (db) => (await db('shop').collection('orders').indexes()).map((each) => each.name)))
      .toContain('status_1');
  });

  test('Apply sets the profiler of the database, and By query / All switch the table', async () => {
    test.setTimeout(120_000);
    const window = await openMonitor();
    await window.getByRole('tab', { name: 'Slow queries' }).click();
    const panel = panelOf(window, 'Slow queries');
    await expect(panel).toContainText('Profiler off');
    await panel.getByRole('combobox', { name: 'Profiler level' }).selectOption({ index: 1 });
    await panel.getByRole('spinbutton', { name: 'Threshold in ms' }).fill('250');
    await panel.locator('[data-feature="monitor.set-profiler@toolbar"]').click();
    await expect(panel).toContainText('Recording operations slower than 250 ms');
    await expect
      .poll(() => mongo.use(async (db) => (await db('shop').command({ profile: -1 }))['was'] as number))
      .toBe(1);
    await panel.getByRole('button', { name: 'All' }).click();
    await expect(panel.getByRole('columnheader').first()).toHaveText('Time');
    await bothThemes(window);
  });
});

test.describe('monitor.stats', () => {
  test('shows the tiles of the server and its databases, and the collections of the database a click chooses', async () => {
    test.setTimeout(120_000);
    const window = await openMonitor();
    await window.getByRole('tab', { name: 'Stats' }).click();
    const panel = panelOf(window, 'Stats');
    await expect(panel).toContainText('Uptime');
    await expect(panel).toContainText('Connections');
    const databases = panel.getByRole('region', { name: 'Databases' });
    const shop = databases.getByRole('row').filter({ hasText: /^shop/u });
    await expect(shop).toHaveCount(1);
    await shop.click();
    const collections = panel.getByRole('region', { name: 'Collections of shop' });
    await expect(collections.getByRole('row').filter({ hasText: 'orders' })).toContainText('300');
    await collections.getByRole('row').filter({ hasText: 'orders' }).click();
    await expect(window.getByText(/storageSize/u).first()).toBeVisible();
    await bothThemes(window);
  });
});

test.describe('monitor.replication', () => {
  test('says a standalone server has no replication, and the Sharding section that it is no cluster', async () => {
    test.setTimeout(120_000);
    const window = await openMonitor();
    await window.getByRole('tab', { name: 'Replication' }).click();
    await expect(panelOf(window, 'Replication')).toContainText(
      'is a standalone server: it is not part of a replica set',
    );
    await bothThemes(window);
    await window.getByRole('tab', { name: 'Sharding' }).click();
    await expect(panelOf(window, 'Sharding')).toContainText(
      'is a standalone server: it is not part of a sharded cluster',
    );
    await expect(window.locator('[data-feature="monitor.set-balancer@toolbar"]')).toHaveCount(0);
    await bothThemes(window);
  });
});
