/**
 * The selection bar driven through the window (`table.selection-bar`): it appears with a second selected row, counts
 * them, copies them as one of the formats for several documents, and **Clear** empties the selection; the table does
 * not move when the bar appears or goes.
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, testMongo } from '../query/collection-app';
import { cellAt, clearClipboard, clipboardText, closeAll, gridOf, seedPeople, startOnPeople } from './parts-app';

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

function barOf(window: Page) {
  return window.getByRole('toolbar', { name: 'Selection' });
}

async function gridTop(window: Page): Promise<number> {
  return (await gridOf(window).boundingBox())?.y ?? Number.NaN;
}

test.describe('table.selection-bar', () => {
  test('no bar with one row; with a second it reads 2 selected, and the table does not move; in both themes', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await cellAt(window, 0, 0).click();
    await expect(barOf(window)).toBeHidden();
    const before = await gridTop(window);
    await cellAt(window, 2, 0).click({ modifiers: ['Control'] });
    await expect(barOf(window)).toBeVisible();
    await expect(barOf(window).getByRole('status')).toHaveText('2 selected');
    expect(await gridTop(window)).toBe(before);
    await expect(barOf(window).getByRole('button', { name: /Export|Update|Delete/u })).toHaveCount(0);
    await bothThemes(window);
    await cellAt(window, 1, 0).click({ modifiers: ['Control'] });
    await expect(barOf(window).getByRole('status')).toHaveText('3 selected');
  });

  test('Copy as › JSON copies the selected documents; Clear empties the selection and the bar goes', async () => {
    test.setTimeout(120_000);
    const started = await startOnPeople(mongo, running);
    const { window } = started;
    await clearClipboard(started);
    await cellAt(window, 0, 0).click();
    await cellAt(window, 2, 0).click({ modifiers: ['Control'] });
    await barOf(window).getByRole('button', { name: 'Copy as' }).click();
    await window.getByRole('menu', { name: 'Copy as' }).getByRole('menuitem', { name: 'JSON', exact: true }).click();
    await expect.poll(() => clipboardText(started)).toContain('"name": "Cy"');
    const copied = await clipboardText(started);
    expect(copied).toContain('"name": "Ada"');
    expect(copied).not.toContain('"name": "Bob"');
    await barOf(window).getByRole('button', { name: 'Clear' }).click();
    await expect(barOf(window)).toBeHidden();
    await expect(gridOf(window).locator('tr[aria-selected="true"]')).toHaveCount(0);
  });
});
