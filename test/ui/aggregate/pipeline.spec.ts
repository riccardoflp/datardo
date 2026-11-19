/**
 * The pipeline editor driven through the window (M19): **Aggregate** in the mode menu shows the editor; **+** adds a
 * stage whose name is focused and selected, and renaming it changes its template; **Run** shows the output in the table
 * with its count; the number of a stage shows its output and **show full pipeline** the whole one; **Edit as text** and
 * back; a stage that does not build is marked and its message shown above the table; a `$out` asks its confirmation; a
 * header click adds a `$sort`; the pipeline is kept when going to Find and back; every control is reached with the
 * keyboard, and the accessibility check passes in both themes.
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import {
  barOf,
  bothThemes,
  documentRows,
  documentsOf,
  openCollection,
  startWithMongo,
  testMongo,
} from '../query/collection-app';

const mongo = testMongo();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async (db) => {
    const shop = db('shop');
    await shop.collection('orders').insertMany([
      { n: 1, customer: 'ann', status: 'paid', total: 30 },
      { n: 2, customer: 'bob', status: 'open', total: 10 },
      { n: 3, customer: 'ann', status: 'paid', total: 20 },
      { n: 4, customer: 'cid', status: 'paid', total: 5 },
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

async function started(): Promise<Page> {
  const app = await startWithMongo(mongo);
  running.push(app);
  return app.window;
}

function editorOf(window: Page) {
  return window.getByRole('region', { name: 'Pipeline editor' });
}

function cardOf(window: Page, number: number) {
  return editorOf(window).locator(`[data-stage="${String(number - 1)}"]`);
}

function lineOf(window: Page) {
  return editorOf(window).locator('p[aria-live="polite"]');
}

function statusOf(window: Page) {
  return window.getByRole('contentinfo');
}

/** Opens `shop.orders` and switches it to Aggregate with the mode menu. */
async function aggregateOrders(window: Page): Promise<void> {
  await openCollection(window, 'shop', 'orders');
  await expect(documentRows(window)).toHaveCount(4);
  await barOf(window).locator('button[data-feature="query.mode@query-bar"]').click();
  await window.getByRole('menuitemcheckbox', { name: 'Aggregate' }).click();
  await expect(editorOf(window)).toBeVisible();
}

/** Replaces the text of the body of a stage, as a paste does. */
async function setBody(window: Page, number: number, text: string): Promise<void> {
  await cardOf(window, number)
    .getByRole('textbox', { name: `Body of stage ${String(number)}` })
    .click();
  await window.keyboard.press('Control+A');
  await window.keyboard.insertText(text);
}

/** Adds a stage with **+** and names it. */
async function addStage(window: Page, name: string, body: string): Promise<void> {
  const before = await editorOf(window).locator('[data-stage]').count();
  const add = editorOf(window).locator(
    '[data-feature="aggregate.add-stage@list"], [data-feature="aggregate.add-stage@empty-state"]',
  );
  await add.first().click();
  const number = before + 1;
  const nameField = cardOf(window, number).getByRole('combobox', { name: 'Stage operator' });
  await expect(nameField).toBeFocused();
  await window.keyboard.insertText(name);
  await setBody(window, number, body);
}

async function run(window: Page): Promise<void> {
  await editorOf(window)
    .getByRole('toolbar', { name: 'Pipeline toolbar' })
    .getByRole('button', { name: 'Run' })
    .click();
}

test.describe('aggregate.show', () => {
  test('Aggregate shows the empty pipeline, which returns the documents unchanged', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await aggregateOrders(window);
    await expect(
      editorOf(window).getByText(
        'No stages: the pipeline returns the documents unchanged. Add a stage, paste a pipeline with "Edit as text", or drag a cell here.',
      ),
    ).toBeVisible();
    await expect(documentRows(window)).toHaveCount(4);
    await bothThemes(window);
  });

  test('a stage added, typed and run shows its output with its count, and every control has its name', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await aggregateOrders(window);
    await addStage(window, '$match', '{ status: "paid" }');
    await expect(lineOf(window)).toHaveText('1 of 1 stage enabled');
    await addStage(window, '$group', '{ _id: "$customer", total: { $sum: "$total" } }');
    await expect(lineOf(window)).toHaveText('2 of 2 stages enabled');
    await run(window);
    await expect(documentRows(window)).toHaveCount(2);
    await expect(statusOf(window).getByText(/^2 of 2 documents · \d+ ms$/u)).toBeVisible();
    await expect(cardOf(window, 2).getByRole('button', { name: 'Show the output up to this stage' })).toBeVisible();
    await expect(
      cardOf(window, 1).getByRole('checkbox', { name: 'Enabled (uncheck to skip this stage)' }),
    ).toBeChecked();
    await expect(cardOf(window, 1).getByRole('button', { name: 'Move left' })).toBeDisabled();
    await expect(cardOf(window, 2).getByRole('button', { name: 'Move right' })).toBeDisabled();
    await bothThemes(window);
  });

  test('renaming a new stage gives it the template of its new name', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await aggregateOrders(window);
    await editorOf(window).locator('[data-feature="aggregate.add-stage@empty-state"]').click();
    const name = cardOf(window, 1).getByRole('combobox', { name: 'Stage operator' });
    await expect(name).toBeFocused();
    await expect(name).toHaveValue('$match');
    await window.keyboard.insertText('$limit');
    await expect(name).toHaveValue('$limit');
    await expect(cardOf(window, 1).getByRole('textbox', { name: 'Body of stage 1' })).toHaveText('10');
  });

  test('the number of a stage shows its output, and show full pipeline the whole one', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await aggregateOrders(window);
    await addStage(window, '$match', '{ status: "paid" }');
    await addStage(window, '$limit', '1');
    await run(window);
    await expect(documentRows(window)).toHaveCount(1);
    await cardOf(window, 1).getByRole('button', { name: 'Show the output up to this stage' }).click();
    await expect(lineOf(window)).toHaveText('Output of stage 1 ($match) · show full pipeline');
    await expect(documentRows(window)).toHaveCount(3);
    await expect(cardOf(window, 2)).toHaveAttribute('data-dimmed', 'true');
    await expect(
      cardOf(window, 1).getByRole('button', { name: 'Previewing this stage — click to show the full pipeline' }),
    ).toBeVisible();
    await lineOf(window).getByRole('button', { name: 'show full pipeline' }).click();
    await expect(lineOf(window)).toHaveText('2 of 2 stages enabled');
    await expect(documentRows(window)).toHaveCount(1);
  });

  test('Edit as text shows the pipeline as text, and Edit as stages reads it back', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await aggregateOrders(window);
    await addStage(window, '$match', '{ status: "paid" }');
    await addStage(window, '$limit', '10');
    const toolbar = editorOf(window).getByRole('toolbar', { name: 'Pipeline toolbar' });
    await toolbar.getByRole('button', { name: 'Edit as text' }).click();
    const text = editorOf(window).getByRole('textbox', { name: 'Pipeline as text' });
    await expect(text).toBeFocused();
    await expect(text.locator('.cm-line')).toHaveText([
      '[',
      '  { $match: { status: "paid" } },',
      '  { $limit: 10 }',
      ']',
    ]);
    await window.keyboard.press('Control+A');
    await window.keyboard.insertText('[ { a: 1 } ]');
    await toolbar.getByRole('button', { name: 'Edit as stages' }).click();
    await expect(
      barOf(window).getByText('Invalid pipeline: Stage 1 must be an object with a single $operator key'),
    ).toBeVisible();
    await text.click();
    await window.keyboard.press('Control+A');
    await window.keyboard.insertText('[ { $match: { total: { $gte: 20 } } }, { $sort: { total: -1 } } ]');
    await toolbar.getByRole('button', { name: 'Edit as stages' }).click();
    await expect(editorOf(window).locator('[data-stage]')).toHaveCount(2);
    await expect(cardOf(window, 2).getByRole('combobox', { name: 'Stage operator' })).toHaveValue('$sort');
  });

  test('a stage that does not build is marked and its message shown; nothing runs', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await aggregateOrders(window);
    await addStage(window, '$match', '{ status: "paid" }');
    await addStage(window, '$group', '{ _id: ');
    await run(window);
    await expect(barOf(window).getByText('Stage 2 ($group): JSON5: invalid end of input at 1:8')).toBeVisible();
    await expect(cardOf(window, 2)).toHaveAttribute('data-error', 'true');
    await expect(cardOf(window, 2).getByRole('list', { name: 'Marks' })).toContainText('The body does not parse');
    await expect(documentRows(window)).toHaveCount(4);
  });

  test('a $out asks its confirmation; cancelled, nothing is written; confirmed, the table says where it went', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await aggregateOrders(window);
    await addStage(window, '$match', '{ status: "paid" }');
    await addStage(window, '$out', '"paid_orders"');
    await expect(cardOf(window, 2).getByRole('list', { name: 'Marks' })).toContainText('writes');
    await run(window);
    const confirmation = window.getByRole('dialog', { name: 'Run pipeline' });
    await expect(confirmation.getByText('Run this pipeline? Its $out stage writes to "paid_orders".')).toBeVisible();
    await bothThemes(window);
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(barOf(window).getByText('Not run: the $out stage was cancelled.')).toBeVisible();
    await run(window);
    await window.getByRole('dialog', { name: 'Run pipeline' }).getByRole('button', { name: 'Run' }).click();
    await expect(documentsOf(window).getByText('Pipeline output written by $out to "paid_orders".')).toBeVisible();
    const written = await mongo.use((db) => db('shop').collection('paid_orders').countDocuments());
    expect(written).toBe(3);
  });

  test('a header click adds a $sort after the stage shown and sorts the output', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await aggregateOrders(window);
    await addStage(window, '$match', '{ status: "paid" }');
    await run(window);
    await expect(documentRows(window)).toHaveCount(3);
    const grid = documentsOf(window).getByRole('grid');
    await grid.getByRole('columnheader', { name: 'total' }).click();
    await expect(cardOf(window, 2).getByRole('combobox', { name: 'Stage operator' })).toHaveValue('$sort');
    await expect(grid.locator('th[data-key="total"]')).toHaveText('total ▲');
    await expect(grid.locator('th[data-key="total"]')).toHaveAttribute('aria-sort', 'ascending');
    await expect(documentsOf(window).locator('td[data-pos$=":0:5"] [class*="cell-text"]')).toHaveText([
      '5',
      '20',
      '30',
    ]);
  });

  test('going to Find and back to Aggregate keeps the stages, the disabled ones and the stage shown', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await aggregateOrders(window);
    await addStage(window, '$match', '{ status: "paid" }');
    await addStage(window, '$limit', '2');
    await addStage(window, '$sort', '{ total: 1 }');
    await cardOf(window, 2).getByRole('checkbox', { name: 'Enabled (uncheck to skip this stage)' }).uncheck();
    await cardOf(window, 1).getByRole('button', { name: 'Show the output up to this stage' }).click();
    await expect(lineOf(window)).toHaveText('Output of stage 1 ($match) · show full pipeline');
    const mode = barOf(window).locator('button[data-feature="query.mode@query-bar"]');
    await mode.click();
    await window.getByRole('menuitemcheckbox', { name: 'Find' }).click();
    await expect(editorOf(window)).toBeHidden();
    await mode.click();
    await window.getByRole('menuitemcheckbox', { name: 'Aggregate' }).click();
    await expect(editorOf(window).locator('[data-stage]')).toHaveCount(3);
    await expect(cardOf(window, 2).getByRole('checkbox')).not.toBeChecked();
    await expect(lineOf(window)).toHaveText('Output of stage 1 ($match) · show full pipeline');
  });

  test('the controls of a card are reached with the keyboard, and its context menu with Shift+F10', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await aggregateOrders(window);
    await addStage(window, '$match', '{ status: "paid" }');
    const card = cardOf(window, 1);
    await card.getByRole('button', { name: 'Show the output up to this stage' }).focus();
    await window.keyboard.press('Tab');
    await expect(card.getByRole('combobox', { name: 'Stage operator' })).toBeFocused();
    await window.keyboard.press('Tab');
    await expect(card.getByRole('checkbox', { name: 'Enabled (uncheck to skip this stage)' })).toBeFocused();
    await window.keyboard.press('Shift+F10');
    const menu = window.getByRole('menu', { name: 'Stage 1 menu' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Disable stage' }).click();
    await expect(card.getByRole('checkbox')).not.toBeChecked();
    await expect(lineOf(window)).toHaveText('0 of 1 stage enabled');
  });
});
