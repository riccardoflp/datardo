/**
 * The query builder and the drag into the bar driven through the window (`query.builder`, `query.drag`): the rows and
 * **Filter** follow each other, the notes, **Clear**; the zones a dragged cell or header shows, and what a drop
 * writes. A drag is made of the events the table's drag sends, with its data. The open builder is checked for
 * accessibility in both themes, and used from the keyboard alone.
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import {
  barOf,
  bothThemes,
  dragOverBar,
  dropOnZone,
  editorText,
  endDragOutside,
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
    await db('shop')
      .collection('orders')
      .insertMany([
        { status: 'paid', total: 10, age: 25 },
        { status: 'paid', total: 50, age: 31 },
        { status: 'new', total: 70, age: 20 },
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

async function openOrders(): Promise<Page> {
  const started = await startWithMongo(mongo);
  running.push(started);
  await openCollection(started.window, 'shop', 'orders');
  await expect(documentRows(started.window)).toHaveCount(3);
  return started.window;
}

function documents(window: Page) {
  return documentRows(window);
}

function builderOf(window: Page) {
  return barOf(window).getByRole('group', { name: 'Match' });
}

async function openBuilder(window: Page): Promise<void> {
  await barOf(window).getByRole('button', { name: 'Builder' }).focus();
  await window.keyboard.press('Enter');
  await expect(builderOf(window)).toBeVisible();
}

test.describe('query.builder', () => {
  test('opened with an empty filter, one empty row with = and the cursor in its field, in both themes', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await openBuilder(window);
    const builder = builderOf(window);
    await expect(builder.getByLabel('Field of condition 1', { exact: true })).toBeFocused();
    await expect(builder.getByLabel('Operator of condition 1', { exact: true })).toHaveValue('eq');
    await expect(builder.getByLabel('Field of condition 2', { exact: true })).toHaveCount(0);
    await bothThemes(window);
  });

  test('a row filled from the keyboard writes the filter as it is typed, and Enter in the row runs it', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await openBuilder(window);
    await window.keyboard.type('status');
    await window.keyboard.press('Tab');
    await window.keyboard.press('Tab');
    await window.keyboard.type('paid');
    await expect.poll(() => editorText(window, 'Filter')).toBe('{ status: "paid" }');
    await expect(documents(window)).toHaveCount(3);
    await window.keyboard.press('Enter');
    await expect(documents(window)).toHaveCount(2);
    await expect(builderOf(window).getByLabel('Value of condition 1', { exact: true })).toHaveValue('paid');
  });

  test('a range in Filter shows two rows; a syntax error or $elemMatch shows a note and no rows', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await openBuilder(window);
    const builder = builderOf(window);
    await setEditor(window, 'Filter', '{ age: { $gte: 20, $lte: 30 } }');
    await expect(builder.getByLabel('Operator of condition 1', { exact: true })).toHaveValue('gte');
    await expect(builder.getByLabel('Operator of condition 2', { exact: true })).toHaveValue('lte');
    await expect(builder.getByLabel('Value of condition 2', { exact: true })).toHaveValue('30');
    await setEditor(window, 'Filter', '{ status: ');
    await expect(
      builder.getByText('The filter has a syntax error: fix it in the box above to edit it here.'),
    ).toBeVisible();
    await expect(builder.getByRole('button', { name: '+ Condition' })).toBeDisabled();
    const elemMatch = '{ items: { $elemMatch: { sku: "A1" } } }';
    await setEditor(window, 'Filter', elemMatch);
    await expect(builder.getByText(/This filter uses operators the rows can't show/u)).toBeVisible();
    await expect(builder.getByLabel('Field of condition 1', { exact: true })).toHaveCount(0);
    expect(await editorText(window, 'Filter')).toBe(elemMatch);
  });

  test('type puts string, exists removes the value, size x has a note, Clear empties Filter without running', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await openBuilder(window);
    const builder = builderOf(window);
    await builder.getByLabel('Field of condition 1', { exact: true }).fill('tags');
    const operator = builder.getByLabel('Operator of condition 1', { exact: true });
    await operator.selectOption('type');
    await expect(builder.getByLabel('Value of condition 1', { exact: true })).toHaveValue('string');
    await operator.selectOption('exists');
    await expect(builder.getByLabel('Value of condition 1', { exact: true })).toHaveCount(0);
    await expect.poll(() => editorText(window, 'Filter')).toBe('{ tags: { $exists: true } }');
    await operator.selectOption('size');
    await builder.getByLabel('Value of condition 1', { exact: true }).fill('3');
    await expect.poll(() => editorText(window, 'Filter')).toBe('{ tags: { $size: 3 } }');
    await builder.getByLabel('Value of condition 1', { exact: true }).fill('x');
    await expect(builder.getByText('tags: size needs a whole number')).toBeVisible();
    expect(await editorText(window, 'Filter')).toBe('{ tags: { $size: 3 } }');
    await builder.getByRole('button', { name: 'Clear' }).click();
    await expect.poll(() => editorText(window, 'Filter')).toBe('');
    await expect(builder.getByLabel('Field of condition 1', { exact: true })).toHaveValue('');
    await expect(documents(window)).toHaveCount(3);
  });
});

test.describe('query.drag', () => {
  test('a dragged cell shows its zones over Filter; a drop on = equals writes the condition and runs it', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    const dragged = { kind: 'cell', field: 'status', value: 'paid' } as const;
    await dragOverBar(window, dragged);
    const zones = barOf(window).locator('div[data-field="filter"] [data-zone]');
    await expect(zones).toHaveText([/= equals\s*status/u, /≠ not equal/u, /≥ from/u, /≤ to/u]);
    await dropOnZone(window, 'filter', '= equals', dragged);
    await expect(zones).toHaveCount(0);
    expect(await editorText(window, 'Filter')).toBe('{ status: "paid" }');
    await expect(documents(window)).toHaveCount(2);
  });

  test('total 10 on ≥ from, then 50 on ≤ to, make a range; a boolean shows = and ≠ only', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await dragOverBar(window, { kind: 'cell', field: 'total', value: 10 });
    await dropOnZone(window, 'filter', '≥ from', { kind: 'cell', field: 'total', value: 10 });
    await dragOverBar(window, { kind: 'cell', field: 'total', value: 50 });
    await dropOnZone(window, 'filter', '≤ to', { kind: 'cell', field: 'total', value: 50 });
    expect(await editorText(window, 'Filter')).toBe('{ total: { $gte: 10, $lte: 50 } }');
    await expect(documents(window)).toHaveCount(2);
    await dragOverBar(window, { kind: 'cell', field: 'shipped', value: true });
    await expect(barOf(window).locator('div[data-field="filter"] [data-zone]')).toHaveCount(2);
    await endDragOutside(window);
    await expect(barOf(window).locator('[data-zone]')).toHaveCount(0);
  });

  test('a header shows three zones over Filter, two over Sort and Project, and remove once it is in the sort', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    const header = { kind: 'header', field: 'createdAt' } as const;
    await dragOverBar(window, header);
    const bar = barOf(window);
    await expect(bar.locator('div[data-field="filter"] [data-zone]')).toHaveCount(3);
    await expect(bar.locator('div[data-field="sort"] [data-zone]')).toHaveCount(2);
    await expect(bar.locator('div[data-field="project"] [data-zone]')).toHaveCount(2);
    await dropOnZone(window, 'sort', '▼ descending', header);
    expect(await editorText(window, 'Sort')).toBe('{ createdAt: -1 }');
    await dragOverBar(window, header);
    await expect(bar.locator('div[data-field="sort"] [data-zone]')).toHaveCount(3);
    await endDragOutside(window);
  });

  test('a drop on a filter that cannot be read changes nothing and says to fix it first', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await setEditor(window, 'Filter', '{ status: ');
    const dragged = { kind: 'cell', field: 'status', value: 'paid' } as const;
    await dragOverBar(window, dragged);
    await dropOnZone(window, 'filter', '= equals', dragged);
    await expect(barOf(window).getByRole('alert')).toContainText(
      'Fix the filter before adding conditions by drag & drop:',
    );
    expect(await editorText(window, 'Filter')).toBe('{ status: ');
  });

  test('a drop updates the rows of the open builder', async () => {
    test.setTimeout(120_000);
    const window = await openOrders();
    await openBuilder(window);
    const dragged = { kind: 'cell', field: 'status', value: 'new' } as const;
    await dragOverBar(window, dragged);
    await dropOnZone(window, 'filter', '= equals', dragged);
    const builder = builderOf(window);
    await expect(builder.getByLabel('Field of condition 1', { exact: true })).toHaveValue('status');
    await expect(builder.getByLabel('Value of condition 1', { exact: true })).toHaveValue('"new"');
    await expect(fieldOf(window, 'Filter')).toBeVisible();
  });
});
