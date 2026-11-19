/**
 * The pages of a query (`table.paging`, `table.page-window`) and the page read again (`table.refresh`): the range and
 * its buttons, the page size, a page turn that keeps the query last run and does not count again, and `F5`.
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import { documentRows, editorText, setEditor, testMongo } from '../query/collection-app';
import { gridOf, openTable, seedTables } from './table-app';

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

function pagingOf(window: Page) {
  return window.getByRole('group', { name: 'Paging' });
}

function rangeOf(window: Page) {
  return pagingOf(window).getByRole('status');
}

test.describe('table.paging', () => {
  test('the range, Previous page disabled on the first page, Next page disabled on the last, in both directions', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'numbers', 50);
    await expect(rangeOf(window)).toHaveText('1–50 of 600');
    const previous = pagingOf(window).getByRole('button', { name: 'Previous page' });
    const next = pagingOf(window).getByRole('button', { name: 'Next page' });
    await expect(previous).toHaveAttribute('aria-disabled', 'true');
    await pagingOf(window).getByRole('combobox').selectOption('200');
    await expect(rangeOf(window)).toHaveText('1–200 of 600');
    await next.click();
    await next.click();
    await expect(rangeOf(window)).toHaveText('401–600 of 600');
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    await previous.click();
    await expect(rangeOf(window)).toHaveText('201–400 of 600');
  });

  test('Next page runs the query last run, not the one typed, without counting again, and shows the top of the grid', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'numbers', 50);
    await setEditor(window, 'Filter', '{ _id: { $lte: 120 } }');
    await window.keyboard.press('Control+Enter');
    await expect(rangeOf(window)).toHaveText('1–50 of 120');
    await gridOf(window).locator('td[data-pos="c:3:0:1"]').click();
    await gridOf(window)
      .locator('td[data-pos="c:5:0:1"]')
      .click({ modifiers: ['Control'] });
    await setEditor(window, 'Filter', '{ _id: 1 }');
    await mongo.use(async (db) => {
      await db('shop').collection<{ _id: number }>('numbers').deleteOne({ _id: 600 });
    });
    await pagingOf(window).getByRole('button', { name: 'Next page' }).click();
    await expect(rangeOf(window)).toHaveText('51–100 of 120');
    await expect(documentRows(window).first()).toHaveText('51');
    await expect(gridOf(window).locator('tbody tr[aria-selected="true"]')).toHaveCount(0);
    await expect(gridOf(window).locator('td[data-pos="c:0:0:1"]')).toHaveAttribute('data-selected', 'true');
    expect(await editorText(window, 'Filter')).toBe('{ _id: 1 }');
    await mongo.use(async (db) => {
      await db('shop').collection<{ _id: number }>('numbers').insertOne({ _id: 600 });
    });
  });
});

test.describe('table.page-window', () => {
  test('with Skip 10 and Limit 25 the first page shows 25 documents, numbered from 1', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'numbers', 50);
    await setEditor(window, 'Skip', '10');
    await setEditor(window, 'Limit', '25');
    await window.keyboard.press('Enter');
    await expect(rangeOf(window)).toHaveText('1–25 of 25');
    await expect(documentRows(window).first()).toHaveText('1');
    await expect(gridOf(window).locator('td[data-pos="c:0:0:1"] [class*="cell-text"]')).toHaveText('11');
    await expect(pagingOf(window).getByRole('button', { name: 'Next page' })).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('table.refresh', () => {
  test('F5 reads the query last run again with its count, keeps the selection and leaves the filter typed', async () => {
    test.setTimeout(120_000);
    const window = await openTable(mongo, running, 'numbers', 50);
    await setEditor(window, 'Filter', '{ _id: { $lte: 10 } }');
    await window.keyboard.press('Control+Enter');
    await expect(rangeOf(window)).toHaveText('1–10 of 10');
    await gridOf(window).locator('td[data-pos="c:1:0:1"]').click();
    await gridOf(window)
      .locator('td[data-pos="c:4:0:1"]')
      .click({ modifiers: ['Control'] });
    await setEditor(window, 'Filter', '{ _id: 0 }');
    await mongo.use(async (db) => {
      await db('shop').collection<{ _id: number }>('numbers').insertOne({ _id: 0 });
    });
    await gridOf(window).locator('td[data-pos="c:2:0:1"]').focus();
    await window.keyboard.press('F5');
    await expect(rangeOf(window)).toHaveText('1–11 of 11');
    await expect(gridOf(window).locator('tbody tr[aria-selected="true"] td[data-pos$=":0:0"]')).toHaveText(['3', '6']);
    expect(await editorText(window, 'Filter')).toBe('{ _id: 0 }');
    await mongo.use(async (db) => {
      await db('shop').collection<{ _id: number }>('numbers').deleteOne({ _id: 0 });
    });
  });
});
