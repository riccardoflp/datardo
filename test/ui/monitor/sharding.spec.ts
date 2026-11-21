/**
 * The Sharding section driven through the window (`monitor.sharding`, `monitor.set-balancer`,
 * `monitor.set-collection-balancing`) on a sharded cluster of this file (`cluster-app.ts`), skipped when there is no
 * mongos next to `MONGOMS_SYSTEM_BINARY`: the shards and the sharded collections, **Stop balancer…** and **Start
 * balancer…** confirmed, and a collection's balancing control in the inspector island. Checked for accessibility in both
 * themes (QA15, QA16).
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, startWithMongo } from '../query/collection-app';
import { closeAll, goTo } from '../table/parts-app';
import { mongosBinary, testCluster } from './cluster-app';

const cluster = testCluster();
const running: StartedApp[] = [];

test.skip(mongosBinary() === undefined, 'No mongos next to MONGOMS_SYSTEM_BINARY.');

test.beforeAll(async () => {
  test.setTimeout(240_000);
  await cluster.start(async (db) => {
    await db('admin').command({ shardCollection: 'shop.orders', key: { customerId: 'hashed' } });
    await db('shop')
      .collection<{ _id: number; customerId: number }>('orders')
      .insertMany(Array.from({ length: 200 }, (_, index) => ({ _id: index, customerId: index % 20 })));
  });
});

test.afterAll(async () => {
  await cluster.stop();
});

test.afterEach(async () => {
  await closeAll(running);
  await cluster.use(async (db) => db('admin').command({ balancerStart: 1 }));
});

async function openSharding(): Promise<Page> {
  const started = await startWithMongo(cluster);
  running.push(started);
  const { window } = started;
  await goTo(window, 'Monitor');
  await window.getByRole('tab', { name: 'Sharding' }).click();
  return window;
}

async function balancerMode(): Promise<unknown> {
  const status: Record<string, unknown> = await cluster.use(async (db) => db('admin').command({ balancerStatus: 1 }));
  return status['mode'];
}

test.describe('monitor.sharding', () => {
  test('shows the two shards and the sharded collection, and stops and starts the balancer after asking', async () => {
    test.setTimeout(180_000);
    const window = await openSharding();
    const panel = window.getByRole('tabpanel', { name: 'Sharding' });
    const shards = panel.getByRole('region', { name: 'Shards' });
    await expect(shards.getByRole('row').filter({ hasText: /^shard0[12]/u })).toHaveCount(2);
    const collections = panel.getByRole('region', { name: 'Sharded collections' });
    await expect(collections.getByRole('row').filter({ hasText: 'shop.orders' })).toContainText(
      '{ customerId: "hashed" }',
    );
    await bothThemes(window);
    await panel.locator('[data-feature="monitor.set-balancer@toolbar"]').click();
    const stop = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    await expect(stop).toContainText('Stop the balancer?');
    await stop.getByRole('button', { name: 'Stop balancer' }).click();
    await expect(panel).toContainText('The balancer is stopped.');
    await expect.poll(balancerMode).toBe('off');
    await expect(panel.locator('[data-feature="monitor.set-balancer@toolbar"]')).toHaveText('Start balancer…');
    await panel.locator('[data-feature="monitor.set-balancer@toolbar"]').click();
    const start = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    await start.getByRole('button', { name: 'Start balancer' }).click();
    await expect.poll(balancerMode).toBe('full');
  });

  test('shows a selected collection in the inspector island with Disable balancing…', async () => {
    test.setTimeout(180_000);
    const window = await openSharding();
    const panel = window.getByRole('tabpanel', { name: 'Sharding' });
    await panel
      .getByRole('region', { name: 'Sharded collections' })
      .getByRole('row')
      .filter({ hasText: 'shop.orders' })
      .click();
    const control = window.locator('[data-feature="monitor.set-collection-balancing@inspector"]');
    await expect(control).toHaveText('Disable balancing…');
    await expect(window.getByRole('button', { name: 'Copy shard key' })).toBeVisible();
    await bothThemes(window);
  });
});
