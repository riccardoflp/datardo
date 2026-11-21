/**
 * The Schema section driven through the window (M23): the analysis of the worked example of `schema.analyze` with its
 * shares, hints, nested fields, **Expand all** and **Collapse all**; a histogram; a click on a value that joins the
 * filter and analyzes again; **Sample**; a filter that is not valid; a view without **Validation rules…**; with the
 * keyboard and the accessibility check in both themes (QA15, QA16).
 */
import { expect, test, type Page } from '@playwright/test';
import { ObjectId, Double, Int32, Long } from 'mongodb';
import type { StartedApp } from '../app';
import { bothThemes, editorText, openCollection, setEditor, startWithMongo, testMongo } from '../query/collection-app';
import { closeAll, goTo } from '../table/parts-app';

const mongo = testMongo();
const running: StartedApp[] = [];

/** The sample of the worked example of `schema.analyze`, with its BSON types. */
const workedExample = [
  {
    _id: new ObjectId('65f1c0de9a1b2c3d4e5f6a01'),
    status: 'paid',
    total: new Double(42.5),
    qty: new Int32(2),
    address: { city: 'Milano', zip: '20100' },
    items: [
      { sku: 'A1', qty: new Int32(1) },
      { sku: 'B2', qty: new Int32(3) },
    ],
    tags: ['a', 'b'],
  },
  {
    _id: new ObjectId('65f1c0de9a1b2c3d4e5f6a02'),
    status: 'new',
    total: new Int32(12),
    qty: Long.fromNumber(5),
    address: { city: 'Roma' },
    items: [],
    tags: ['a'],
  },
  {
    _id: new ObjectId('65f1c0de9a1b2c3d4e5f6a03'),
    status: 'paid',
    total: null,
    address: 'unknown',
    items: [{ sku: 'A1', qty: new Int32(2) }],
  },
  { _id: new ObjectId('65f1c0de9a1b2c3d4e5f6a04'), status: 'paid', total: new Double(7) },
];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async (db) => {
    await db('shop').collection('orders').insertMany(workedExample);
    await db('shop')
      .collection<{ _id: Int32 }>('people')
      .insertMany(
        Array.from({ length: 100 }, (_, index) => ({ _id: new Int32(index), age: new Int32(18 + (index % 60)) })),
      );
    await db('shop').createCollection('paid_orders', { viewOn: 'orders', pipeline: [{ $match: { status: 'paid' } }] });
  });
});

test.afterAll(async () => {
  await mongo.stop();
});

test.afterEach(async () => {
  await closeAll(running);
});

function sectionOf(window: Page) {
  return window.getByRole('region', { name: 'Schema' });
}

function tableOf(window: Page) {
  return sectionOf(window).getByRole('table', { name: 'Schema' });
}

function rowOf(window: Page, name: string) {
  return tableOf(window)
    .locator('tbody tr')
    .filter({ has: window.locator(`td:first-child [title="${name}"]`) });
}

async function showSchema(collection: string, view = false): Promise<Page> {
  const started = await startWithMongo(mongo);
  running.push(started);
  const { window } = started;
  await openCollection(window, 'shop', collection, view);
  await window.getByRole('toolbar', { name: 'Sections' }).getByRole('button', { name: 'Schema' }).click();
  await expect(sectionOf(window).getByRole('status')).toContainText(/documents · \d+ ms/u);
  return window;
}

test.describe('schema.show', () => {
  test('shows All 4 documents and one row per field of the worked example, with shares, types and values', async () => {
    test.setTimeout(120_000);
    const window = await showSchema('orders');
    await expect(sectionOf(window).getByRole('status')).toContainText('All 4 documents');
    const names = tableOf(window).locator('tbody tr td:first-child');
    await expect(names).toHaveText(['_id', 'status', 'total', 'qty', '▸address', '▸items', 'tags']);
    await expect(rowOf(window, 'qty').locator('td').nth(1)).toHaveText('50%');
    await expect(rowOf(window, 'qty').locator('td').nth(1)).toHaveAttribute('title', 'In 2 of 4, missing in 2');
    await expect(rowOf(window, 'status').locator('td').nth(1)).toHaveAttribute('title', 'In all 4');
    await expect(rowOf(window, 'total').locator('td').nth(2).getByRole('button')).toHaveText([
      'double 50%',
      'int 25%',
      'null 25%',
    ]);
    await expect(rowOf(window, 'status').locator('td').nth(3)).toContainText('"paid"75%');
    await expect(rowOf(window, '_id').locator('td').nth(3)).toContainText('all distinct, e.g.');
    await expect(rowOf(window, 'tags').locator('td').nth(3)).toContainText('1–2 elements, avg 1.5');
    await bothThemes(window);
  });

  test('shows nested fields on a click, every level with Expand all and none with Collapse all', async () => {
    test.setTimeout(120_000);
    const window = await showSchema('orders');
    await tableOf(window).getByRole('button', { name: 'address' }).click();
    await expect(rowOf(window, 'address.city').locator('td').nth(1)).toHaveText('100%');
    await expect(rowOf(window, 'address.zip').locator('td').nth(1)).toHaveAttribute('title', 'In 1 of 2, missing in 1');
    await sectionOf(window).getByRole('button', { name: 'Expand all' }).click();
    await expect(rowOf(window, 'items[].sku')).toBeVisible();
    await sectionOf(window).getByRole('button', { name: 'Collapse all' }).click();
    await expect(tableOf(window).locator('tbody tr')).toHaveCount(7);
  });

  test('shows 100 integers from 18 to 77 as a histogram of 13 bars with 18 and 77 under it', async () => {
    test.setTimeout(120_000);
    const window = await showSchema('people');
    const values = rowOf(window, 'age').locator('td').nth(3);
    await expect(values.locator('[data-feature="schema.filter-from-value@table"]')).toHaveCount(13);
    await expect(values).toContainText('18');
    await expect(values).toContainText('77');
  });

  test('on a view hides Validation rules… and still analyzes', async () => {
    test.setTimeout(120_000);
    const window = await showSchema('paid_orders', true);
    await expect(sectionOf(window).getByRole('status')).toContainText('All 3 documents');
    await expect(sectionOf(window).getByRole('button', { name: 'Validation rules…' })).toHaveCount(0);
    await expect(sectionOf(window).locator('[data-feature="transfer.generate@toolbar"]')).toBeEnabled();
  });
});

test.describe('schema.filter-from-value', () => {
  test('a click on "paid" makes the filter { status: "paid" } and analyzes the 3 documents with that status', async () => {
    test.setTimeout(120_000);
    const window = await showSchema('orders');
    await rowOf(window, 'status')
      .getByRole('button', { name: /"paid"/u })
      .click();
    await expect.poll(() => editorText(window, 'Filter')).toContain('status: "paid"');
    await expect(sectionOf(window).getByRole('status')).toContainText('All 3 documents');
  });
});

test.describe('schema.sample', () => {
  test('a filter that is not valid sends nothing and is marked; Sample at 100 reads again', async () => {
    test.setTimeout(120_000);
    const window = await showSchema('orders');
    await sectionOf(window).getByLabel('Sample').selectOption('100');
    await expect(sectionOf(window).getByRole('status')).toContainText('All 4 documents');
    await setEditor(window, 'Filter', '{ status: ');
    await window.getByRole('search').locator('[data-feature="schema.sample@query-bar"]').click();
    await expect(sectionOf(window)).toContainText('Invalid query syntax — check the highlighted field.');
    await expect(tableOf(window)).toBeVisible();
    await setEditor(window, 'Filter', '{ status: "new" }');
    await goTo(window, 'Analyze schema');
    await expect(sectionOf(window).getByRole('status')).toContainText('All 1 document');
  });

  test('can be reached and run from the keyboard alone', async () => {
    test.setTimeout(120_000);
    const started = await startWithMongo(mongo);
    running.push(started);
    const { window } = started;
    await openCollection(window, 'shop', 'orders');
    await expect(window.getByRole('region', { name: 'Documents' })).toBeVisible();
    await goTo(window, 'Schema');
    await expect(sectionOf(window).getByRole('status')).toContainText('All 4 documents');
    await tableOf(window).getByRole('button', { name: 'address' }).focus();
    await window.keyboard.press('Enter');
    await expect(rowOf(window, 'address.city')).toBeVisible();
  });
});
