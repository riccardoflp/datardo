/**
 * The Documents section and its grid driven through the window (`table.show`, `table.detect-columns`,
 * `table.cell-text`, `table.rows`): the grid of a page, its states, the header that stays in place while only the
 * rows near the visible ones are drawn, the text and the color of each kind of value, and the sub-rows of an expanded
 * array.
 */
import { expect, test } from '@playwright/test';
import type { StartedApp } from '../app';
import {
  bothThemes,
  documentRows,
  documentsOf,
  openCollection,
  setEditor,
  startWithMongo,
  testMongo,
} from '../query/collection-app';
import { cellsOf, gridOf, headingOf, leafHeadings, openTable, seedTables } from './table-app';

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

test.describe('table.show', () => {
  test('a collection opens on its first 50 documents in a grid with its numbers of rows and columns, in both themes', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'numbers', 50);
    const grid = gridOf(window);
    await expect(grid).toHaveAttribute('aria-rowcount', '51');
    await expect(grid).toHaveAttribute('aria-colcount', '42');
    await expect(window.getByRole('contentinfo').getByText(/^50 of 600 documents · \d+ ms$/u)).toBeVisible();
    await bothThemes(window);
  });

  test('500 rows scroll without drawing every row, under a header that stays in place', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'numbers', 50);
    await window.getByRole('group', { name: 'Paging' }).getByRole('combobox').selectOption('500');
    await expect(gridOf(window)).toHaveAttribute('aria-rowcount', '501');
    const drawn = await documentRows(window).count();
    expect(drawn).toBeGreaterThan(5);
    expect(drawn).toBeLessThan(100);
    const scroller = gridOf(window).locator('xpath=..');
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.scrollLeft = element.scrollWidth;
    });
    await expect(gridOf(window).locator('td[data-pos^="c:499:0:0"]')).toBeVisible();
    const top = await scroller.evaluate((element) => element.getBoundingClientRect().top);
    const header = await headingOf(window, 'f0').evaluate((element) => element.getBoundingClientRect().top);
    expect(Math.abs(header - top)).toBeLessThan(2);
    await expect(gridOf(window).locator('td[data-pos="c:499:0:0"]')).toHaveText('500');
  });

  test('an empty collection says so, and a filter that matches nothing offers Reset without the header row', async () => {
    test.setTimeout(120_000);
    const started = await startWithMongo(mongo);
    running.push(started);
    const { window } = started;
    await openCollection(window, 'shop', 'empty');
    await expect(documentsOf(window).getByText('This collection is empty.')).toBeVisible();
    await openCollection(window, 'shop', 'people');
    await expect(documentRows(window)).toHaveCount(3);
    await setEditor(window, 'Filter', '{ name: "none" }');
    await window.keyboard.press('Control+Enter');
    await expect(documentsOf(window).getByText('No documents match this query.')).toBeVisible();
    await expect(gridOf(window)).toHaveCount(0);
    await documentsOf(window).locator('[data-feature="query.reset@empty-state"]').click();
    await expect(documentRows(window)).toHaveCount(3);
  });

  test('a query that fails leaves the documents shown and puts the message under the bar', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'people', 3);
    await setEditor(window, 'Filter', '{ name: { $foo: 1 } }');
    await window.keyboard.press('Control+Enter');
    await expect(window.getByRole('search').getByText(/unknown operator: \$foo/u)).toBeVisible();
    await expect(documentRows(window)).toHaveCount(3);
  });
});

test.describe('table.detect-columns', () => {
  test('the three people give _id first, then the fields in the order first met', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'people', 3);
    expect(await leafHeadings(window)).toEqual(['_id', 'name', 'address', 'items', 'tags', 'email']);
    await expect(headingOf(window, 'address').getByRole('button', { name: 'Expand address' })).toBeVisible();
    await expect(headingOf(window, 'name').getByRole('button')).toHaveCount(0);
  });
});

test.describe('table.cell-text', () => {
  test('5 as an int, a long, a double and a decimal are four values, with their types; null, "" and nothing differ', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'values', 6);
    const n = cellsOf(window, 'n');
    await expect(n.locator('[class*="cell-text"]')).toHaveText(['5', '5', '5.0', 'NumberDecimal("5")', '', '']);
    await expect(n.nth(0)).toHaveAttribute('title', '5\nint');
    await expect(n.nth(1)).toHaveAttribute('title', 'NumberLong(5)\nlong');
    await expect(n.nth(2)).toHaveAttribute('title', 'Double(5)\ndouble');
    await expect(n.nth(3)).toHaveAttribute('title', 'NumberDecimal("5")\ndecimal');
    await expect(n.nth(0)).toHaveAttribute('data-syntax', 'number');
    await expect(n.nth(4)).toHaveAttribute('data-content', 'missing');
    const email = cellsOf(window, 'email');
    await expect(email.locator('[class*="cell-text"]')).toHaveText(['', '', '', '', 'null', '""']);
    await expect(email.nth(0)).toHaveAttribute('data-content', 'missing');
    await expect(email.nth(4)).toHaveAttribute('data-syntax', 'bool');
    await expect(email.nth(5)).toHaveAttribute('data-syntax', 'string');
    await expect(n.nth(1)).toContainText('long');
  });
});

test.describe('table.rows', () => {
  test('with items expanded Ada and Cy take two sub-rows, Bob one with a note, and the row number covers them', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'people', 3);
    await headingOf(window, 'items').getByRole('button', { name: 'Expand items' }).click();
    await expect(headingOf(window, 'items.sku')).toBeVisible();
    await expect(cellsOf(window, 'items.sku').locator('[class*="cell-text"]')).toHaveText(['"A1"', '"B2"', '"C3"']);
    await expect(cellsOf(window, 'items')).toHaveCount(2);
    await expect(cellsOf(window, 'items').nth(0)).toHaveAttribute(
      'title',
      /^items is not an array of sub-documents here/u,
    );
    await expect(cellsOf(window, 'items').nth(1)).toHaveAttribute(
      'title',
      /^This element of items is not a sub-document/u,
    );
    await expect(gridOf(window).locator('td[data-pos="c:0:0:0"]')).toHaveAttribute('rowspan', '2');
    await expect(gridOf(window).locator('td[data-pos="c:1:0:0"]')).toHaveAttribute('rowspan', '1');
    await expect(gridOf(window).locator('td[data-pos="c:0:0:0"]')).toHaveAttribute('title', 'Inspect document');
  });

  test('the sku of the second sub-row of Ada is dragged with the value "B2" and the array items; a missing value is not dragged', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'people', 3);
    await headingOf(window, 'items').getByRole('button', { name: 'Expand items' }).click();
    const sku = cellsOf(window, 'items.sku').nth(1);
    await expect(sku).toContainText('"B2"');
    const carried = await sku.evaluate((element) => {
      const transfer = new DataTransfer();
      element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
      const data = transfer.getData('application/x-datardo-drag');
      element.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }));
      return data;
    });
    expect(JSON.parse(carried)).toEqual({ kind: 'cell', field: 'items.sku', value: 'B2', within: 'items' });
    await expect(cellsOf(window, 'email').first()).toHaveAttribute('data-content', 'missing');
    await expect(cellsOf(window, 'email').first()).toHaveAttribute('draggable', 'false');
  });

  test('on page 3 with page size 10 the rows are numbered from 21', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'numbers', 50);
    const paging = window.getByRole('group', { name: 'Paging' });
    await paging.getByRole('combobox').selectOption('10');
    await expect(documentRows(window)).toHaveCount(10);
    await paging.getByRole('button', { name: 'Next page' }).click();
    await paging.getByRole('button', { name: 'Next page' }).click();
    await expect(documentRows(window).first()).toHaveText('21');
    await expect(documentRows(window).last()).toHaveText('30');
  });
});
