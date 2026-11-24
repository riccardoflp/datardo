/**
 * Conditional formatting driven through the window (M41): **Format cells…** in the menu of a column header, the
 * Formatting view of the inspector island with a rule open, the keys of its list, **Hide formatting**, and the
 * **Formatting** button of the toolbar, with the accessibility check in both themes.
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, testMongo } from '../query/collection-app';
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

function paneOf(window: Page) {
  return window.locator('[data-feature="table.formatting@inspector"]');
}

function formattingButton(window: Page) {
  return window.locator('[data-feature="nav.toggle-inspector@toolbar"]');
}

/** **Format cells…** in the menu of the header of `key`. */
async function formatCells(window: Page, key: string): Promise<void> {
  await headerOf(window, key).click({ button: 'right' });
  await window
    .getByRole('menu', { name: `Menu of the column ${key}` })
    .getByRole('menuitem', { name: 'Format cells…' })
    .click();
}

test.describe('table.add-format-rule', () => {
  test('Format cells… on name with Ada selected opens a red rule on the cell of name, which colors it at once', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await cellAt(window, 0, 2).click();
    await formatCells(window, 'name');
    const pane = paneOf(window);
    await expect(pane).toBeVisible();
    await expect(pane.locator('[data-open-part="field"]')).toHaveValue('name');
    await expect(pane.locator('[data-field="condition"] .cm-content')).toContainText('{ name: "Ada" }');
    await expect(pane.getByRole('button', { name: 'Red', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(cellAt(window, 0, 2)).toHaveAttribute('data-format', 'red');
    await expect(cellAt(window, 1, 2)).not.toHaveAttribute('data-format', /./u);
    await expect(formattingButton(window)).toHaveText('Formatting (1)');
    await expect(formattingButton(window)).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('table.formatting', () => {
  test('passes the accessibility check in both themes with a rule open', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await formatCells(window, 'name');
    await expect(paneOf(window).locator('[data-field="condition"]')).toBeVisible();
    await bothThemes(window);
  });

  test('with the focus on the first line, Down then Enter opens the second rule; Esc closes it, the focus on its line', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await formatCells(window, 'name');
    await expect(cellAt(window, 0, 2)).toHaveAttribute('data-format', 'red');
    await formatCells(window, 'tags');
    const pane = paneOf(window);
    const lines = pane.locator('[data-line-control="main"]');
    await expect(lines).toHaveCount(2);
    await pane.locator('[data-open-part="name"]').focus();
    await window.keyboard.press('Escape');
    await expect(lines.nth(1)).toBeFocused();
    await window.keyboard.press('ArrowUp');
    await expect(lines.first()).toBeFocused();
    await window.keyboard.press('ArrowDown');
    await expect(lines.nth(1)).toBeFocused();
    await window.keyboard.press('Enter');
    await expect(pane.locator('[data-open-part="field"]')).toHaveValue('tags');
    await pane.locator('[data-open-part="name"]').focus();
    await window.keyboard.press('Escape');
    await expect(pane.locator('[data-open-part="name"]')).toHaveCount(0);
    await expect(lines.nth(1)).toBeFocused();
  });
});

test.describe('table.toggle-formatting', () => {
  test('Hide formatting takes every color off the table; the toolbar reads Formatting (off); Show formatting again', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await formatCells(window, 'name');
    await expect(cellAt(window, 0, 2)).toHaveAttribute('data-format', 'red');
    await paneOf(window).getByRole('button', { name: 'Hide formatting' }).click();
    await expect(gridOf(window).locator('[data-format]')).toHaveCount(0);
    await expect(formattingButton(window)).toHaveText('Formatting (off)');
    await paneOf(window).getByRole('button', { name: 'Show formatting' }).click();
    await expect(cellAt(window, 0, 2)).toHaveAttribute('data-format', 'red');
  });
});

test.describe('nav.toggle-inspector', () => {
  test('Formatting in the toolbar shows the Formatting view and is pressed; a second click shows the Selection view', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await formattingButton(window).click();
    await expect(paneOf(window)).toBeVisible();
    await expect(formattingButton(window)).toHaveAttribute('aria-pressed', 'true');
    await expect(paneOf(window).getByText('No formatting rules.', { exact: false })).toBeVisible();
    await formattingButton(window).click();
    await expect(paneOf(window)).toHaveCount(0);
    await expect(window.getByRole('tab', { name: 'Selection' })).toHaveAttribute('aria-selected', 'true');
  });
});
