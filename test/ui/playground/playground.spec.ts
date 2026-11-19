/**
 * Playgrounds driven through the window (M28): the tab with its toolbar, its editor and its **Run** buttons, a run
 * from `Ctrl+Enter` and from a **Run** button reached with the keyboard, the results as a table and as JSON, an error
 * and its line, **Stop** of a script that never waits, a drop confirmed first, and the dot of unsaved changes. The
 * accessibility check runs in both themes on the tab before and after a run.
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, firstConnection, startIntent, startWithMongo, testMongo } from '../query/collection-app';

const mongo = testMongo();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async (db) => {
    await db('shop')
      .collection('orders')
      .insertMany([
        { n: 1, status: 'paid', total: 30 },
        { n: 2, status: 'open', total: 10 },
        { n: 3, status: 'paid', total: 20 },
      ]);
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

/** A Datardo with the connection *Local*, and a playground on `shop` opened with `script`. */
async function withPlayground(script: string): Promise<Page> {
  const app = await startWithMongo(mongo);
  running.push(app);
  const { window } = app;
  const connection = await firstConnection(window);
  await startIntent(window, 'playground.open', { script }, { kind: 'database', connection, database: 'shop' });
  await expect(toolbarOf(window)).toBeVisible();
  return window;
}

function toolbarOf(window: Page) {
  return window.getByRole('toolbar', { name: 'Playground' });
}

function editorOf(window: Page) {
  return window.getByRole('textbox', { name: 'Script' });
}

function resultsOf(window: Page) {
  return window.getByRole('region', { name: 'Results' });
}

test.describe('playground.show', () => {
  test('shows the toolbar, a Run button for each statement and what a playground does, accessible in both themes', async () => {
    test.setTimeout(120_000);
    const window = await withPlayground('use("shop");\ndb.orders.find()\n\ndb.orders.countDocuments()\n');
    const toolbar = toolbarOf(window);
    await expect(toolbar.getByRole('button', { name: 'Run all' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Local › shop' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Open…' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(window.getByRole('button', { name: /^Run the statement at line \d+$/u })).toHaveCount(3);
    await expect(window.getByRole('button', { name: 'Run the statement at line 4' })).toBeVisible();
    await expect(resultsOf(window).getByText('Run a playground with Ctrl+Enter.')).toBeVisible();
    await expect(resultsOf(window).getByText(/^A playground runs what its script says\./u)).toBeVisible();
    await bothThemes(window);
  });

  test('typing gives the tab the dot of unsaved changes, and deleting it takes the dot away', async () => {
    test.setTimeout(120_000);
    const window = await withPlayground('db.orders.find()');
    const close = window.locator('[data-feature="tab.close@tab-strip"]').last();
    await expect(close).not.toHaveAttribute('data-unsaved', 'true');
    await editorOf(window).click();
    await window.keyboard.press('Control+End');
    await window.keyboard.type('x');
    await expect(close).toHaveAttribute('data-unsaved', 'true');
    await window.keyboard.press('Backspace');
    await expect(close).not.toHaveAttribute('data-unsaved', 'true');
  });
});

test.describe('playground.open', () => {
  test('the page Playground of the tree opens a new playground on the connection, with the example', async () => {
    test.setTimeout(120_000);
    const app = await startWithMongo(mongo);
    running.push(app);
    const { window } = app;
    await window.getByRole('treeitem', { name: 'Playground, page', exact: true }).click();
    await expect(toolbarOf(window)).toBeVisible();
    await expect(window.getByRole('tab', { name: /Playground 1/u })).toBeVisible();
    await expect(editorOf(window)).toContainText('// Datardo playground');
  });
});

test.describe('playground.run', () => {
  test('Ctrl+Enter runs the script and shows the documents of its last expression as a table, then as JSON', async () => {
    test.setTimeout(120_000);
    const window = await withPlayground('db.orders.find({}, { _id: 0 }).sort({ n: 1 })');
    await editorOf(window).click();
    await window.keyboard.press('Control+Enter');
    const results = resultsOf(window);
    await expect(results.getByText(/^Playground 1 · Local › shop · \d+ ms · 3 documents$/u)).toBeVisible();
    await expect(results.getByRole('table').locator('tbody tr')).toHaveCount(3);
    await expect(results.getByRole('columnheader', { name: 'status' })).toBeVisible();
    await bothThemes(window);
    await results.getByRole('button', { name: 'JSON', exact: true }).click();
    await expect(results.getByText(/status: "paid"/u).first()).toBeVisible();
    await expect(results.getByRole('table')).toHaveCount(0);
  });

  test('the Run button of a statement, reached with the keyboard, runs that statement alone', async () => {
    test.setTimeout(120_000);
    const window = await withPlayground('print("first");\ndb.orders.countDocuments({ status: "paid" })');
    const button = window.getByRole('button', { name: 'Run the statement at line 2' });
    await button.focus();
    await window.keyboard.press('Enter');
    const results = resultsOf(window);
    await expect(results.getByText(/^Playground 1 \(line 2\) · Local › shop · \d+ ms$/u)).toBeVisible();
    await expect(results.getByText('2', { exact: true })).toBeVisible();
    await expect(results.getByText('first')).toHaveCount(0);
  });

  test('an error shows its message and its line, which the link puts the caret on', async () => {
    test.setTimeout(120_000);
    const window = await withPlayground('const a = 1;\nprint("before");\nnotDefined.call()\nprint("after")');
    await editorOf(window).click();
    await window.keyboard.press('Control+Enter');
    const results = resultsOf(window);
    await expect(results.getByText(/^ReferenceError: notDefined is not defined/u)).toBeVisible();
    await expect(results.getByText('before')).toBeVisible();
    await expect(window.locator('[data-failed="true"]')).toHaveText('notDefined.call()');
    await results.getByRole('button', { name: 'line 3' }).click();
    await expect(editorOf(window)).toBeFocused();
    await window.keyboard.type('// ');
    await expect(window.locator('.cm-line').nth(2)).toHaveText('// notDefined.call()');
  });
});

test.describe('playground.stop', () => {
  test('Stop ends a script that never waits, and the results say it was cancelled', async () => {
    test.setTimeout(120_000);
    const window = await withPlayground('print("start");\nwhile (true) {}');
    await editorOf(window).click();
    await window.keyboard.press('Control+Enter');
    const stop = toolbarOf(window).getByRole('button', { name: 'Stop' });
    await expect(stop).toBeVisible();
    await expect(resultsOf(window).getByText(/^Running Playground 1 on Local › shop…$/u)).toBeVisible();
    const pressed = Date.now();
    await stop.click();
    await expect(
      resultsOf(window).getByText('Cancelled. Operations already sent may still complete on the server.'),
    ).toBeVisible({ timeout: 1000 });
    expect(Date.now() - pressed).toBeLessThan(1500);
    await expect(toolbarOf(window).getByRole('button', { name: 'Run all' })).toBeVisible();
  });

  test('Cancel on the status line stops a run as Stop does', async () => {
    test.setTimeout(120_000);
    const window = await withPlayground('sleep(600000)');
    await editorOf(window).click();
    await window.keyboard.press('Control+Enter');
    const cancel = window.getByRole('contentinfo').locator('[data-feature="playground.stop@status-line"]');
    await expect(cancel).toBeVisible();
    await cancel.click();
    await expect(
      resultsOf(window).getByText('Cancelled. Operations already sent may still complete on the server.'),
    ).toBeVisible({ timeout: 1000 });
  });
});

test.describe('playground.writes', () => {
  test('a drop is confirmed first: Cancel throws in the script, and the collection is still there', async () => {
    test.setTimeout(120_000);
    const window = await withPlayground('db.orders.drop();\nprint("after")');
    await editorOf(window).click();
    await window.keyboard.press('Control+Enter');
    const dialog = window.getByRole('dialog').or(window.getByRole('alertdialog'));
    await expect(dialog.getByText('Drop collection shop.orders')).toBeVisible();
    await bothThemes(window);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    const results = resultsOf(window);
    await expect(results.getByText('Dropping shop.orders was cancelled.')).toBeVisible();
    await expect(results.getByText('after')).toHaveCount(0);
    const names = await mongo.use(async (db) =>
      (await db('shop').listCollections().toArray()).map((each) => each.name),
    );
    expect(names).toContain('orders');
  });
});
