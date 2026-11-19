/**
 * The commands of the table run from Go to (`table.selection`, `table.columns`, `table.arrange-columns`): they act
 * on the active collection tab, and on the column of the selected cell.
 */
import { expect, test } from '@playwright/test';
import type { StartedApp } from '../app';
import { testMongo } from '../query/collection-app';
import { cellAt, closeAll, gridOf, goTo, headerOf, seedPeople, startOnPeople } from './parts-app';

const mongo = testMongo();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await seedPeople(mongo);
});

test.afterAll(async () => {
  await mongo.stop();
});

test.afterEach(async () => {
  await closeAll(running);
});

test.describe('table.selection', () => {
  test('Select all documents of the page selects the three rows; Clear selection empties it', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await goTo(window, 'Select all documents of the page');
    await expect(gridOf(window).locator('tr[aria-selected="true"]')).toHaveCount(3);
    await expect(window.getByRole('toolbar', { name: 'Selection' }).getByRole('status')).toHaveText('3 selected');
    await goTo(window, 'Clear selection');
    await expect(gridOf(window).locator('tr[aria-selected="true"]')).toHaveCount(0);
  });
});

test.describe('table.columns', () => {
  test('Columns… opens the panel with the focus in its search', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await goTo(window, 'Columns…');
    await expect(
      window.getByRole('dialog', { name: 'Columns' }).getByRole('searchbox', { name: 'Search columns' }),
    ).toBeFocused();
  });
});

test.describe('table.arrange-columns', () => {
  test('Hide column hides the column of the selected cell; Show all columns brings it back', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await cellAt(window, 0, 2).click();
    await goTo(window, 'Hide column');
    await expect(headerOf(window, 'name')).toHaveCount(0);
    await goTo(window, 'Show all columns');
    await expect(headerOf(window, 'name')).toHaveCount(1);
  });
});
