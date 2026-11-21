/**
 * The columns of the grid changed from its headings (`table.expand`, `table.collapse`, `table.layout`, and the parts
 * of `table.arrange-columns` that are on the headings): `▸` expands a field, its group heading collapses it, a heading
 * dropped on another moves its column, and the edge of a heading resizes it; what changes is remembered for the
 * collection.
 */
import { expect, test } from '@playwright/test';
import type { StartedApp } from '../app';
import { openCollection, startIntent, testMongo } from '../query/collection-app';
import { gridOf, headingOf, leafHeadings, openTable, seedTables } from './table-app';

const mongo = testMongo();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(seedTables);
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

async function closeActiveTab(window: import('@playwright/test').Page): Promise<void> {
  await window.keyboard.press('Control+W');
  await expect(gridOf(window)).toHaveCount(0);
}

test.describe('table.expand', () => {
  test('▸ of address shows city, zip and geo under its group heading, remembered when the tab opens again', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'people', 3);
    await headingOf(window, 'address').getByRole('button', { name: 'Expand address' }).click();
    await expect(headingOf(window, 'address')).toHaveAttribute('data-group', 'true');
    expect(await leafHeadings(window)).toEqual([
      '_id',
      'name',
      'address.city',
      'address.zip',
      'address.geo',
      'items',
      'tags',
      'email',
    ]);
    await expect(headingOf(window, 'address.city')).toHaveText('city');
    await expect(headingOf(window, 'address.city')).toHaveAttribute('title', /^address\.city\n/u);
    await closeActiveTab(window);
    await openCollection(window, 'shop', 'people');
    await expect(headingOf(window, 'address.city')).toBeVisible();
  });

  test('Alt with a click on ▸ of items also expands items.options', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'people', 3);
    await headingOf(window, 'items')
      .getByRole('button', { name: 'Expand items' })
      .click({ modifiers: ['Alt'] });
    await expect(headingOf(window, 'items.options.color')).toBeVisible();
    await expect(headingOf(window, 'items.options')).toHaveAttribute('data-group', 'true');
  });
});

test.describe('table.collapse', () => {
  test('a click on the group heading puts address back into one column, and expanding it again shows geo as it was', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'people', 3);
    await headingOf(window, 'address')
      .getByRole('button', { name: 'Expand address' })
      .click({ modifiers: ['Alt'] });
    await expect(headingOf(window, 'address.geo.lat')).toBeVisible();
    await headingOf(window, 'address').click();
    await expect(headingOf(window, 'address')).not.toHaveAttribute('data-group', 'true');
    await expect(headingOf(window, 'address.city')).toHaveCount(0);
    await headingOf(window, 'address').getByRole('button', { name: 'Expand address' }).click();
    await expect(headingOf(window, 'address.geo.lat')).toBeVisible();
    await headingOf(window, 'items').getByRole('button', { name: 'Expand items' }).click();
    const ada = gridOf(window).locator('td[data-pos="c:0:0:0"]');
    await expect(ada).toHaveAttribute('rowspan', '2');
    await headingOf(window, 'items').click();
    await expect(headingOf(window, 'items.sku')).toHaveCount(0);
    await expect(ada).toHaveAttribute('rowspan', '1');
  });
});

test.describe('table.arrange-columns on the headings', () => {
  test('tags dropped on the left half of name goes right before it, on the right half right after', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'people', 3);
    const name = headingOf(window, 'name');
    // The inspector island shows the selected document beside the table (M12): hidden, every heading is in sight.
    await startIntent(window, 'nav.toggle-inspector', { hidden: true });
    await expect(window.locator('[data-island="inspector"]')).toBeHidden();
    const box = await name.boundingBox();
    await headingOf(window, 'tags').dragTo(name, { targetPosition: { x: 4, y: 8 } });
    await expect.poll(() => leafHeadings(window)).toEqual(['_id', 'tags', 'name', 'address', 'items', 'email']);
    await headingOf(window, 'email').dragTo(name, { targetPosition: { x: (box?.width ?? 80) - 6, y: 8 } });
    await expect.poll(() => leafHeadings(window)).toEqual(['_id', 'tags', 'name', 'email', 'address', 'items']);
  });

  test('the edge of a heading resizes its column, never under 40 px, and a double click gives the automatic width', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'people', 3);
    const name = headingOf(window, 'name');
    const before = (await name.boundingBox())?.width ?? 0;
    const edge = name.locator('[data-feature="table.arrange-columns@table"]');
    const box = await edge.boundingBox();
    const x = (box?.x ?? 0) + 2;
    const y = (box?.y ?? 0) + 4;
    await window.mouse.move(x, y);
    await window.mouse.down();
    await window.mouse.move(x - 400, y, { steps: 4 });
    await window.mouse.up();
    await expect.poll(async () => Math.round((await name.boundingBox())?.width ?? 0)).toBe(40);
    await edge.dblclick();
    await expect.poll(async () => Math.round((await name.boundingBox())?.width ?? 0)).toBe(Math.round(before));
  });
});
