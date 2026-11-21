/**
 * The context menus of the table driven through the window (`table.row-menu`, `table.cell-menu`,
 * `table.column-menu`): opened by a right click or from the keyboard, used with the arrows, `→` and `Enter`, closed
 * by `Esc` with the focus back where it was; only the entries whose feature is built are drawn.
 */
import { expect, test } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, editorText, testMongo } from '../query/collection-app';
import { cellAt, closeAll, gridOf, headerOf, seedPeople, startOnPeople } from './parts-app';

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

test.describe('table.row-menu', () => {
  test('a right click on a row selects it and opens the menu of one row, with Copy as and its five formats', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await cellAt(window, 1, 0).click({ button: 'right' });
    const menu = window.getByRole('menu', { name: 'Menu of document 2' });
    await expect(menu).toBeVisible();
    await expect(cellAt(window, 1, 0).locator('xpath=..')).toHaveAttribute('aria-selected', 'true');
    await menu.getByRole('menuitem', { name: 'Copy as' }).hover();
    const formats = window.getByRole('menu', { name: 'Copy as' });
    await expect(formats.getByRole('menuitem')).toHaveText([
      'mongosh',
      'Extended JSON',
      'JSON',
      'YAML',
      'insertOne command',
    ]);
    await expect(menu.getByRole('menuitem', { name: 'Inspect document' })).toHaveCount(1);
    await bothThemes(window);
  });

  test('on one of three selected rows it is the menu of the selection; Clear selection empties it', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await cellAt(window, 0, 0).click();
    await cellAt(window, 2, 0).click({ modifiers: ['Shift'] });
    await cellAt(window, 1, 0).click({ button: 'right' });
    const menu = window.getByRole('menu', { name: 'Menu of document 2' });
    await menu.getByRole('menuitem', { name: 'Copy 3 documents as' }).hover();
    await expect(window.getByRole('menu', { name: 'Copy 3 documents as' }).getByRole('menuitem')).toHaveCount(7);
    await menu.getByRole('menuitem', { name: 'Clear selection' }).click();
    await expect(gridOf(window).locator('[aria-selected="true"]')).toHaveCount(0);
  });

  test('Shift+F10 on a row number opens it, the arrows and → move through it, Esc gives the focus back', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await cellAt(window, 0, 0).click();
    await expect(cellAt(window, 0, 0)).toBeFocused();
    await window.keyboard.press('Shift+F10');
    const menu = window.getByRole('menu', { name: 'Menu of document 1' });
    await expect(menu).toBeVisible();
    await window.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Inspect document' })).toBeFocused();
    // The entries of the document area come first (M12): the arrows go down to Copy as.
    const copyAs = menu.getByRole('menuitem', { name: 'Copy as' });
    for (let presses = 0; presses < 6; presses += 1) {
      if (await copyAs.evaluate((item) => item === document.activeElement)) {
        break;
      }
      await window.keyboard.press('ArrowDown');
    }
    await expect(copyAs).toBeFocused();
    await window.keyboard.press('ArrowRight');
    await expect(
      window.getByRole('menu', { name: 'Copy as' }).getByRole('menuitem', { name: 'mongosh' }),
    ).toBeFocused();
    await window.keyboard.press('Escape');
    await window.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(cellAt(window, 0, 0)).toBeFocused();
  });
});

test.describe('table.cell-menu', () => {
  test('on a text cell: Copy value, Copy field path and Add to filter; = equals writes the filter and runs', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await cellAt(window, 0, 2).click({ button: 'right' });
    const menu = window.getByRole('menu', { name: 'Menu of name in document 1' });
    await expect(menu.getByRole('menuitem', { name: 'Copy value' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Copy field path' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Edit value' })).toHaveCount(1);
    await menu.getByRole('menuitem', { name: 'Add to filter' }).hover();
    const conditions = window.getByRole('menu', { name: 'Add to filter' });
    await conditions.getByRole('menuitem', { name: /equals/u }).click();
    expect(await editorText(window, 'Filter')).toBe('{ name: "Ada" }');
    await expect(gridOf(window).locator('td[data-pos^="c:"][aria-colindex="1"]')).toHaveCount(1);
  });

  test('a number has four conditions; an empty cell has no Copy value and no Add to filter', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await cellAt(window, 0, 6).click({ button: 'right' });
    await window
      .getByRole('menu', { name: 'Menu of score in document 1' })
      .getByRole('menuitem', { name: 'Add to filter' })
      .hover();
    await expect(window.getByRole('menu', { name: 'Add to filter' }).getByRole('menuitem')).toHaveCount(4);
    await window.keyboard.press('Escape');
    await window.keyboard.press('Escape');
    await cellAt(window, 1, 6).click({ button: 'right' });
    const empty = window.getByRole('menu', { name: 'Menu of score in document 2' });
    await expect(empty.getByRole('menuitem', { name: 'Copy field path' })).toBeVisible();
    await expect(empty.getByRole('menuitem', { name: 'Copy value' })).toHaveCount(0);
    await expect(empty.getByRole('menuitem', { name: 'Add to filter' })).toHaveCount(0);
  });
});

test.describe('table.column-menu', () => {
  test('Sort › ▼ descending writes the sort and runs; Hide and Pin name the column; # has two entries', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await headerOf(window, 'name').click({ button: 'right' });
    const menu = window.getByRole('menu', { name: 'Menu of the column name' });
    await expect(menu.getByRole('menuitem', { name: 'Hide name' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Pin name to the left' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Reset width' })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: 'Rename field…' })).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Sort' }).hover();
    await window
      .getByRole('menu', { name: 'Sort' })
      .getByRole('menuitem', { name: /descending/u })
      .click();
    expect(await editorText(window, 'Sort')).toBe('{ name: -1 }');
    await expect(cellAt(window, 0, 2)).toHaveText(/Cy/u);
    await gridOf(window).locator('th[data-pos="h:0"]').click({ button: 'right' });
    await expect(window.getByRole('menu', { name: 'Menu of the column #' }).getByRole('menuitem')).toHaveText([
      'Columns…',
      'Reset all columns',
    ]);
  });
});
