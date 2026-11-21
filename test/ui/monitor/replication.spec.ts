/**
 * The Replication section driven through the window (`monitor.replication`, `monitor.step-down`) on a replica set of
 * this file (`../watch/replica-app.ts`): its members with the server Datardo is connected to marked, its oplog filtered
 * by namespace, and **Step down…**, whose confirmation is cancelled: a set of one member would elect the same primary.
 * Checked for accessibility in both themes (QA15, QA16).
 */
import { expect, test } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, startWithMongo } from '../query/collection-app';
import { closeAll, goTo } from '../table/parts-app';
import { testReplicaSet } from '../watch/replica-app';

const replicaSet = testReplicaSet();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await replicaSet.start(async (db) => {
    await db('shop')
      .collection<{ _id: number; status: string }>('orders')
      .insertMany(Array.from({ length: 5 }, (_, index) => ({ _id: index, status: 'new' })));
    await db('shop')
      .collection<{ _id: number; status: string }>('orders')
      .updateOne({ _id: 2 }, { $set: { status: 'paid' } });
  });
});

test.afterAll(async () => {
  await replicaSet.stop();
});

test.afterEach(async () => {
  await closeAll(running);
});

async function primaryOf(): Promise<unknown> {
  const hello: Record<string, unknown> = await replicaSet.use(async (db) => db('admin').command({ hello: 1 }));
  return hello['primary'];
}

test.describe('monitor.replication', () => {
  test('lists the member and the oplog of shop, and cancels Step down… without stepping down', async () => {
    test.setTimeout(150_000);
    const started = await startWithMongo(replicaSet);
    running.push(started);
    const { window } = started;
    await goTo(window, 'Monitor');
    await window.getByRole('tab', { name: 'Replication' }).click();
    const panel = window.getByRole('tabpanel', { name: 'Replication' });
    const members = panel.getByRole('region', { name: 'Members' });
    await expect(members.getByRole('row').filter({ hasText: 'PRIMARY' })).toHaveCount(1);
    const oplog = panel.getByRole('region', { name: 'Oplog' });
    await oplog.getByRole('searchbox', { name: 'Database or collection (shop, shop.users)' }).fill('shop.orders');
    await expect(oplog.getByRole('row').filter({ hasText: 'update' })).toHaveCount(1);
    await bothThemes(window);
    const primaryBefore = await primaryOf();
    await panel.locator('[data-feature="monitor.step-down@toolbar"]').click();
    const confirmation = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    await expect(confirmation).toContainText(/Step down the primary .+\?/u);
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation).toBeHidden();
    expect(await primaryOf()).toBe(primaryBefore);
  });
});
