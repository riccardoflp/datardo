/**
 * The grid used from the keyboard and the mouse (`table.navigate`, `table.selection`, `table.sort`): the selected cell
 * moved by the keys, the table one stop for `Tab`, the rows selected by clicks and keys, and the sort of a heading.
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import { editorText, fieldOf, testMongo } from '../query/collection-app';
import { focusedPosition, gridOf, headingOf, openTable, seedTables } from './table-app';

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

function cell(window: Page, position: string) {
  return gridOf(window).locator(`[data-pos="${position}"]`);
}

async function selectedRows(window: Page): Promise<string[]> {
  return gridOf(window)
    .locator('tbody tr[aria-selected="true"] td[data-pos$=":0:0"]')
    .evaluateAll((cells) => cells.map((each) => each.textContent));
}

test.describe('table.navigate', () => {
  test('Tab reaches the grid in one stop from the bar; the arrows move between cells and the heading', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'people', 3);
    await fieldOf(window, 'Limit').click();
    await window.keyboard.press('Tab');
    for (let index = 0; index < 4 && (await focusedPosition(window)) === null; index += 1) {
      await window.keyboard.press('Tab');
    }
    expect(await focusedPosition(window)).toBe('c:0:0:1');
    await window.keyboard.press('ArrowDown');
    expect(await focusedPosition(window)).toBe('c:1:0:1');
    await window.keyboard.press('ArrowRight');
    expect(await focusedPosition(window)).toBe('c:1:0:2');
    await window.keyboard.press('ArrowUp');
    await window.keyboard.press('ArrowUp');
    expect(await focusedPosition(window)).toBe('h:2');
    await window.keyboard.press('ArrowDown');
    expect(await focusedPosition(window)).toBe('c:0:0:2');
    await window.keyboard.press('Home');
    await window.keyboard.press('ArrowLeft');
    await window.keyboard.press('ArrowLeft');
    expect(await focusedPosition(window)).toBe('c:0:0:0');
    await window.keyboard.press('End');
    await window.keyboard.press('ArrowRight');
    expect(await focusedPosition(window)).toBe('c:0:0:6');
    await window.keyboard.press('Tab');
    expect(await focusedPosition(window)).toBeNull();
    await expect(window.getByRole('group', { name: 'Paging' }).locator(':focus')).toHaveCount(1);
  });

  test('↓ goes through the sub-rows of an expanded array, then to the next document', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'people', 3);
    await headingOf(window, 'items').getByRole('button', { name: 'Expand items' }).click();
    await expect(headingOf(window, 'items.sku')).toBeVisible();
    const sku = await headingOf(window, 'items.sku').getAttribute('aria-colindex');
    const column = String(Number(sku) - 1);
    await cell(window, `c:0:0:${column}`).click();
    await window.keyboard.press('ArrowDown');
    expect(await focusedPosition(window)).toBe(`c:0:1:${column}`);
    await expect(cell(window, `c:0:1:${column}`)).toContainText('"B2"');
    await window.keyboard.press('ArrowDown');
    expect(await focusedPosition(window)).toBe(`c:1:0:${column}`);
    await cell(window, 'c:0:0:2').click();
    await window.keyboard.press('ArrowDown');
    expect(await focusedPosition(window)).toBe('c:1:0:2');
  });

  test('Ctrl+End selects the last cell of the last row and scrolls it into view; the selected cell is outlined', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'numbers', 50);
    await cell(window, 'c:0:0:1').click();
    await window.keyboard.press('Control+End');
    await expect.poll(() => focusedPosition(window)).toBe('c:49:0:41');
    await expect(cell(window, 'c:49:0:41')).toBeInViewport();
    await expect(cell(window, 'c:49:0:41')).toHaveAttribute('data-selected', 'true');
    await window.keyboard.press('Control+Home');
    await expect.poll(() => focusedPosition(window)).toBe('c:0:0:1');
  });
});

test.describe('table.selection', () => {
  test('a click, Ctrl and Shift with a click, Ctrl+A and Esc select the rows of the page', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'numbers', 50);
    await cell(window, 'c:1:0:1').click();
    await cell(window, 'c:4:0:1').click({ modifiers: ['Control'] });
    expect(await selectedRows(window)).toEqual(['2', '5']);
    await cell(window, 'c:1:0:1').click({ modifiers: ['Control'] });
    expect(await selectedRows(window)).toEqual(['5']);
    await cell(window, 'c:1:0:1').click();
    await cell(window, 'c:5:0:1').click({ modifiers: ['Shift'] });
    expect(await selectedRows(window)).toEqual(['2', '3', '4', '5', '6']);
    await cell(window, 'c:3:0:1').click({ modifiers: ['Shift'] });
    expect(await selectedRows(window)).toEqual(['2', '3', '4']);
    await window.keyboard.press('Shift+ArrowDown');
    await window.keyboard.press('Control+a');
    await expect(gridOf(window).locator('tbody tr[aria-selected="true"]').first()).toBeVisible();
    await expect(window.getByRole('toolbar', { name: /selection/iu }).getByRole('status')).toHaveText(/^50 selected$/u);
    await window.keyboard.press('Escape');
    expect(await selectedRows(window)).toEqual([]);
  });

  test('with items expanded a click on the second sub-row selects the whole document', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'people', 3);
    await headingOf(window, 'items').getByRole('button', { name: 'Expand items' }).click();
    await expect(headingOf(window, 'items.sku')).toBeVisible();
    await gridOf(window).locator('td[data-column="items.sku"]').nth(1).click();
    await expect(gridOf(window).locator('tbody tr[aria-selected="true"]')).toHaveCount(2);
    expect(await selectedRows(window)).toEqual(['1']);
  });
});

test.describe('table.sort', () => {
  test('a click on a heading sorts by it, again the other way, again not at all, and the heading says so', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'people', 3);
    const name = headingOf(window, 'name');
    await name.click();
    await expect(name).toHaveAttribute('aria-sort', 'ascending');
    expect(await editorText(window, 'Sort')).toBe('{ name: 1 }');
    await name.click();
    await expect(name).toHaveAttribute('aria-sort', 'descending');
    await expect(gridOf(window).locator('td[data-column="name"]').first()).toContainText('"Cy"');
    await name.click();
    await expect(name).not.toHaveAttribute('aria-sort', /./u);
    expect(await editorText(window, 'Sort')).toBe('');
  });

  test('a sort typed shows ▲ and ▼ on its headings; Enter on a heading sorts; the resize edge and ▸ do not sort', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'people', 3);
    await fieldOf(window, 'Sort').click();
    await window.keyboard.insertText('{ name: 1, _id: -1 }');
    await window.keyboard.press('Enter');
    await expect(headingOf(window, 'name')).toContainText('▲');
    await expect(headingOf(window, '_id')).toContainText('▼');
    await headingOf(window, 'address').getByRole('button', { name: 'Expand address' }).click();
    await expect(headingOf(window, 'address.city')).toBeVisible();
    expect(await editorText(window, 'Sort')).toBe('{ name: 1, _id: -1 }');
    await headingOf(window, 'tags').locator('[data-feature="table.arrange-columns@table"]').click();
    expect(await editorText(window, 'Sort')).toBe('{ name: 1, _id: -1 }');
    await headingOf(window, 'tags').focus();
    await window.keyboard.press('Enter');
    await expect(headingOf(window, 'tags')).toHaveAttribute('aria-sort', 'ascending');
  });
});
