/**
 * The **Columns** panel and the changes of the layout driven through the window (`table.columns`,
 * `table.arrange-columns`): hidden, shown, pinned and reset columns, the button that counts the hidden ones, the
 * panel used from the keyboard, and the layout kept when the tab is opened again.
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, openCollection, startIntent, testMongo } from '../query/collection-app';
import { closeAll, headerOf, seedPeople, startOnPeople } from './parts-app';

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

function columnsButton(window: Page) {
  return window.locator('[data-feature="table.columns@toolbar"]');
}

function panelOf(window: Page) {
  return window.getByRole('dialog', { name: 'Columns' });
}

test.describe('table.columns', () => {
  test('unticking name hides it at once and the panel stays open; the button counts it; Show all, in both themes', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await expect(columnsButton(window)).toHaveText('Columns');
    await columnsButton(window).click();
    const panel = panelOf(window);
    await expect(panel.getByRole('searchbox', { name: 'Search columns' })).toBeFocused();
    await bothThemes(window);
    await panel.getByRole('checkbox', { name: 'name', exact: true }).uncheck();
    await expect(headerOf(window, 'name')).toHaveCount(0);
    await expect(columnsButton(window)).toHaveText('Columns (1 hidden)');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Show all' }).click();
    await expect(headerOf(window, 'name')).toHaveCount(1);
    await expect(columnsButton(window)).toHaveText('Columns');
  });

  test('from the keyboard: the arrows move through the rows, Space ticks, Esc closes and the focus goes back', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await columnsButton(window).focus();
    await window.keyboard.press('Enter');
    const panel = panelOf(window);
    await panel.getByRole('checkbox', { name: '_id', exact: true }).focus();
    await window.keyboard.press('ArrowDown');
    await expect(panel.getByRole('checkbox', { name: 'name', exact: true })).toBeFocused();
    await window.keyboard.press('Space');
    await expect(headerOf(window, 'name')).toHaveCount(0);
    await window.keyboard.press('Space');
    await expect(headerOf(window, 'name')).toHaveCount(1);
    await window.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(columnsButton(window)).toBeFocused();
  });

  test('a search narrows the rows; No columns when none matches; a click outside closes it', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await columnsButton(window).click();
    const panel = panelOf(window);
    await window.keyboard.type('ta');
    await expect(panel.getByRole('checkbox')).toHaveCount(1);
    await expect(panel.getByRole('checkbox', { name: 'tags' })).toBeVisible();
    await window.keyboard.type('zz');
    await expect(panel.getByText('No columns')).toBeVisible();
    await headerOf(window, 'name').click({ position: { x: 4, y: 4 } });
    await expect(panel).toBeHidden();
  });
});

test.describe('table.arrange-columns', () => {
  test('Hide name from its menu counts it on the button; the layout is kept when the tab is opened again', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await headerOf(window, 'name').click({ button: 'right' });
    await window
      .getByRole('menu', { name: 'Menu of the column name' })
      .getByRole('menuitem', { name: 'Hide name' })
      .click();
    await expect(headerOf(window, 'name')).toHaveCount(0);
    await expect(columnsButton(window)).toHaveText('Columns (1 hidden)');
    await startIntent(window, 'tab.close', null);
    await openCollection(window, 'shop', 'people');
    await expect(headerOf(window, 'email')).toHaveCount(1);
    await expect(headerOf(window, 'name')).toHaveCount(0);
  });

  test('Pin tags to the left puts it first; Reset all columns puts back the natural layout', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await columnsButton(window).click();
    await panelOf(window).getByRole('button', { name: 'Pin tags' }).click();
    await expect(window.locator('th[data-pos="h:1"]')).toHaveAttribute('title', /^tags\n/u);
    await panelOf(window).getByRole('button', { name: 'Unpin' }).click();
    await expect(window.locator('th[data-pos="h:1"]')).toHaveAttribute('title', /^_id\n/u);
    await panelOf(window).getByRole('checkbox', { name: 'email', exact: true }).uncheck();
    await panelOf(window).getByRole('button', { name: 'Reset' }).click();
    await expect(headerOf(window, 'email')).toHaveCount(1);
  });
});
