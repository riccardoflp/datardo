/**
 * The query bar driven through the window (`query.bar`, `query.mode`, `query.reset`, `query.highlight`,
 * `query.autocomplete`): its fields and buttons, the keys that run a query, the outlines and the error line, Cancel,
 * the mode switch and Reset. Used from the keyboard alone where the cards ask, and checked for accessibility in both
 * themes.
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import {
  barOf,
  bothThemes,
  editorText,
  fieldOf,
  openCollection,
  setEditor,
  startWithMongo,
  testMongo,
  documentRows,
} from './collection-app';

const mongo = testMongo();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async (db) => {
    const orders = [
      ...Array.from({ length: 4 }, (_each, index) => ({ n: index, status: 'paid', total: index * 10 })),
      ...Array.from({ length: 2 }, (_each, index) => ({ n: 10 + index, status: 'new', total: 5 })),
    ];
    await db('shop').collection('orders').insertMany(orders);
  });
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

async function openOrders(): Promise<Page> {
  const started = await startWithMongo(mongo);
  running.push(started);
  await openCollection(started.window, 'shop', 'orders');
  await expect(documentRows(started.window)).toHaveCount(6);
  return started.window;
}

function documents(window: Page) {
  return documentRows(window);
}

test.describe('query.bar', () => {
  test('a tab opened for the first time shows Find, the five empty fields and no error line, in both themes', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    const bar = barOf(window);
    await expect(bar.getByRole('button', { name: 'Query mode' })).toHaveText(/Find/u);
    for (const name of ['Filter', 'Sort', 'Project', 'Skip', 'Limit']) {
      await expect(fieldOf(window, name)).toBeVisible();
    }
    expect(await editorText(window, 'Filter')).toBe('');
    await expect(bar.getByText('{ field: "value" }  —  or drag a cell / column here')).toBeVisible();
    await expect(fieldOf(window, 'Skip')).toHaveAttribute('placeholder', '0');
    await expect(fieldOf(window, 'Limit')).toHaveAttribute('placeholder', 'no limit');
    await expect(bar.getByRole('button', { name: 'Builder' })).toHaveAttribute('aria-pressed', 'false');
    await expect(bar.getByRole('alert')).toHaveCount(0);
    await bothThemes(window);
  });

  test('Tab goes through the controls in order, each with its name', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await barOf(window).getByRole('button', { name: 'Query mode' }).focus();
    const names: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      names.push(await window.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''));
      await window.keyboard.press('Tab');
    }
    expect(names).toEqual([
      'Query mode, Find',
      'Filter',
      'Sort',
      'Project',
      'Skip',
      'Limit',
      'Builder',
      'Queries',
      'Reset',
      'Run query, Find',
    ]);
  });

  test('Ctrl+Enter runs from Filter, Enter adds a line there and runs from Limit, which takes digits only', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await setEditor(window, 'Filter', '{ status: "new" }');
    await window.keyboard.press('Control+Enter');
    await expect(documents(window)).toHaveCount(2);
    await setEditor(window, 'Filter', '{ status: "paid" }');
    await window.keyboard.press('End');
    await window.keyboard.press('Enter');
    expect(await editorText(window, 'Filter')).toBe('{ status: "paid" }\n');
    await expect(documents(window)).toHaveCount(2);
    await fieldOf(window, 'Limit').click();
    await window.keyboard.type('3a!');
    await expect(fieldOf(window, 'Limit')).toHaveValue('3');
    await window.keyboard.press('Enter');
    await expect(documents(window)).toHaveCount(3);
  });

  test('a field that cannot be read is outlined when run, and the outline goes as soon as it is edited', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await setEditor(window, 'Sort', '[1]');
    await window.keyboard.press('Enter');
    await expect(barOf(window).getByRole('alert')).toHaveText(/Invalid query syntax — check the highlighted field\./u);
    await expect(fieldOf(window, 'Sort')).toHaveAttribute('aria-invalid', 'true');
    await expect(documents(window)).toHaveCount(6);
    await window.keyboard.press('Backspace');
    await expect(fieldOf(window, 'Sort')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('a message of the server has Details and Run again, the documents stay, and a success empties the line', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await setEditor(window, 'Filter', '{ $foo: 1 }');
    await window.keyboard.press('Control+Enter');
    const line = barOf(window).getByRole('alert');
    await expect(line).toContainText('$foo');
    await expect(documents(window)).toHaveCount(6);
    await line.getByRole('button', { name: 'Details' }).click();
    await expect(line.locator('pre')).toContainText('$foo');
    await setEditor(window, 'Filter', '{ status: "new" }');
    await line.getByRole('button', { name: 'Run again' }).click();
    await expect(documents(window)).toHaveCount(2);
    await expect(barOf(window).getByRole('alert')).toHaveCount(0);
  });

  test('while a query runs the run button reads Cancel; cancelling says so and keeps the table', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await setEditor(window, 'Filter', '{ $where: "sleep(2000) || true" }');
    await window.keyboard.press('Control+Enter');
    const cancel = barOf(window).getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeVisible();
    await window.waitForTimeout(500);
    await cancel.click();
    await expect(barOf(window).getByRole('alert')).toContainText('Cancelled');
    await expect(barOf(window).getByRole('button', { name: 'Run query' })).toBeVisible();
    await expect(documents(window)).toHaveCount(6);
  });
});

test.describe('query.highlight', () => {
  test('a text the parser refuses is still colored: a key and a string', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await setEditor(window, 'Filter', '{ status: "pai');
    const filter = fieldOf(window, 'Filter');
    await expect(filter.locator('[data-syntax="key"]')).toHaveText('status');
    await expect(filter.locator('[data-syntax="string"]')).toHaveText('"pai');
  });
});

test.describe('query.autocomplete', () => {
  test('in { st the list shows status; Enter writes it and the values of status follow', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await fieldOf(window, 'Filter').click();
    await window.keyboard.type('{ st');
    const list = window.getByRole('listbox', { name: 'Suggestions' });
    await expect(list.getByRole('option', { name: /status/u })).toBeVisible();
    await list
      .getByRole('option', { name: /status/u })
      .first()
      .click();
    expect(await editorText(window, 'Filter')).toBe('{ status: ');
    await expect(list.getByRole('option', { name: /"paid"/u })).toBeVisible();
    await expect(list.getByRole('option', { name: /"new"/u })).toBeVisible();
    await expect(fieldOf(window, 'Filter')).toBeFocused();
  });
});

test.describe('query.mode', () => {
  test('the mode switch has Find ticked; choosing it sends nothing and leaves the bar as it was', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await setEditor(window, 'Filter', '{ status: "new" }');
    await barOf(window).getByRole('button', { name: 'Query mode' }).focus();
    await window.keyboard.press('Enter');
    const menu = window.getByRole('menu', { name: 'Query mode' });
    await expect(menu.getByRole('menuitemcheckbox', { name: 'Find' })).toHaveAttribute('aria-checked', 'true');
    await window.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect(documents(window)).toHaveCount(6);
    expect(await editorText(window, 'Filter')).toBe('{ status: "new" }');
  });
});

test.describe('query.reset', () => {
  test('Reset empties the fields, the outline and the error line, and shows the collection again', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await setEditor(window, 'Filter', '{ status: "new" }');
    await setEditor(window, 'Sort', '{ total: -1 }');
    await window.keyboard.press('Enter');
    await expect(documents(window)).toHaveCount(2);
    await setEditor(window, 'Project', '[1]');
    await window.keyboard.press('Enter');
    await expect(fieldOf(window, 'Project')).toHaveAttribute('aria-invalid', 'true');
    await barOf(window).getByRole('button', { name: 'Reset' }).click();
    await expect(documents(window)).toHaveCount(6);
    for (const name of ['Filter', 'Sort', 'Project']) {
      expect(await editorText(window, name)).toBe('');
    }
    await expect(fieldOf(window, 'Project')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(barOf(window).getByRole('alert')).toHaveCount(0);
  });
});
