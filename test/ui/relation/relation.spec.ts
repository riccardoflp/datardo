/**
 * References through the window (M34): the Relationship diagram of a database, its boxes, **Copy Mermaid** and
 * **Save SVG…** with the system's dialog answered by the test; **Go from here** under the selected document in the
 * inspector island, and a reference cell followed with `Ctrl`+click; with the accessibility check in both themes.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObjectId } from 'mongodb';
import type { StartedApp } from '../app';
import {
  bothThemes,
  firstConnection,
  openCollection,
  startIntent,
  startWithMongo,
  testMongo,
} from '../query/collection-app';
import { cellAt, clipboardText, closeAll, gridOf } from '../table/parts-app';

const mongo = testMongo();
const running: StartedApp[] = [];
let files = '';

const customers = Array.from({ length: 5 }, (_, index) => ({ _id: new ObjectId(), name: `Customer ${String(index)}` }));

test.beforeAll(async () => {
  test.setTimeout(180_000);
  files = await mkdtemp(join(tmpdir(), 'datardo-ui-relation-'));
  await mongo.start(async (db) => {
    await db('shop').collection('customers').insertMany(customers);
    await db('shop')
      .collection('orders')
      .insertMany(
        customers.map((customer, index) => ({
          _id: (index + 1) as never,
          customerId: customer._id,
          total: 10 * (index + 1),
        })),
      );
  });
});

test.afterAll(async () => {
  await mongo.stop();
  await rm(files, { recursive: true, force: true });
});

test.afterEach(async () => {
  await closeAll(running);
});

async function started(): Promise<StartedApp> {
  const app = await startWithMongo(mongo);
  running.push(app);
  return app;
}

async function openDiagram(window: Page): Promise<void> {
  const connection = await firstConnection(window);
  await startIntent(window, 'relation.diagram', {}, { kind: 'database', connection, database: 'shop' });
  await expect(window.getByRole('tab', { name: /Diagram: shop/u })).toHaveAttribute('aria-selected', 'true');
  await expect(window.getByRole('toolbar', { name: 'Relationship diagram' }).getByRole('status')).toContainText(
    '1 relation',
  );
}

test.describe('relation.diagram', () => {
  test('The diagram of shop samples its collections and draws a box for each, with the relation between them', async () => {
    test.setTimeout(120_000);
    const { window } = await started();
    await openDiagram(window);
    const drawing = window.getByRole('group', { name: 'shop' });
    await expect(drawing.locator('[data-box="customers"]')).toBeVisible();
    await expect(drawing.locator('[data-box="orders"]')).toBeVisible();
    await expect(window.getByRole('toolbar', { name: 'Relationship diagram' }).getByRole('status')).toContainText(
      '2 collections',
    );
    await bothThemes(window);
  });
});

test.describe('relation.export-mermaid', () => {
  test('Copy Mermaid puts an erDiagram of shop on the clipboard', async () => {
    test.setTimeout(120_000);
    const app = await started();
    const { window } = app;
    await openDiagram(window);
    await window.getByRole('button', { name: 'Copy Mermaid' }).click();
    await expect.poll(async () => clipboardText(app)).toMatch(/^erDiagram/u);
    await expect.poll(async () => clipboardText(app)).toContain('orders');
  });
});

test.describe('relation.export-svg', () => {
  test('Save SVG… writes the drawing to the file chosen in the system dialog, and says where', async () => {
    test.setTimeout(120_000);
    const { window, app } = await started();
    const path = join(files, 'shop-diagram.svg');
    await app.evaluate(({ dialog }, chosen) => {
      const stubbed = dialog as unknown as Record<string, unknown>;
      stubbed['showSaveDialog'] = () => Promise.resolve({ canceled: false, filePath: chosen });
    }, path);
    await openDiagram(window);
    await window.getByRole('button', { name: 'Save SVG…' }).click();
    await expect(window.getByText(`Saved the diagram of shop to ${path}.`, { exact: true })).toBeVisible();
    const written = await readFile(path, 'utf8');
    expect(written).toContain('<svg');
    expect(written).toContain('customers');
    await app.evaluate(({ shell }) => {
      const stubbed = shell as unknown as Record<string, unknown>;
      const calls: string[] = [];
      (globalThis as unknown as { shellCalls: string[] }).shellCalls = calls;
      stubbed['showItemInFolder'] = (shown: string) => calls.push(`show ${shown}`);
      stubbed['openPath'] = (opened: string) => {
        calls.push(`open ${opened}`);
        return Promise.resolve('');
      };
    });
    await window.getByRole('button', { name: 'Reveal', exact: true }).click();
    await expect
      .poll(() => app.evaluate(() => (globalThis as unknown as { shellCalls: string[] }).shellCalls))
      .toEqual([`show ${path}`]);
  });
});

test.describe('relation.follow', () => {
  test('Go from here under a selected order leads to its customer, in the customers tab', async () => {
    test.setTimeout(120_000);
    const { window } = await started();
    await openCollection(window, 'shop', 'orders');
    await expect(cellAt(window, 0, 1)).toBeVisible();
    await cellAt(window, 0, 1).click();
    await window.keyboard.press('Enter');
    const follow = window.getByRole('region', { name: 'Go from here' });
    await expect(follow).toContainText('customerId → customers', { timeout: 30_000 });
    await bothThemes(window);
    await follow.getByRole('button', { name: /customerId → customers/u }).click();
    await expect(window.getByRole('tab', { name: /customers/u, selected: true })).toBeVisible();
    await expect(gridOf(window)).toContainText('Customer 0');
    await expect(gridOf(window)).not.toContainText('Customer 1');
  });
});

test.describe('relation.open-referenced', () => {
  test('Ctrl+click on a customerId cell opens the customer it refers to', async () => {
    test.setTimeout(120_000);
    const { window } = await started();
    await openCollection(window, 'shop', 'orders');
    const link = gridOf(window).locator('td[data-feature="relation.open-referenced@table"]').nth(1);
    await expect(link).toBeVisible({ timeout: 30_000 });
    await link.click({ modifiers: ['Control'] });
    await expect(window.getByRole('tab', { name: /customers/u, selected: true })).toBeVisible();
    await expect(gridOf(window)).toContainText('Customer 1');
    await expect(gridOf(window)).not.toContainText('Customer 0');
  });
});
