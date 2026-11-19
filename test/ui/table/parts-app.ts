/**
 * What the UI tests of the parts around the table share: *the three people* of `shop.people` on a MongoDB server,
 * Datardo started with the connection *Local* and the tab of `shop.people` open, the grid and its cells, the
 * clipboard, and Go to.
 */
import { expect, type Page } from '@playwright/test';
import { BSON } from 'mongodb';
import type { StartedApp } from '../app';
import { openCollection, startWithMongo, type TestMongo } from '../query/collection-app';

/** Seeds `shop.people` with Ada, Bob and Cy. */
export async function seedPeople(mongo: TestMongo): Promise<void> {
  await mongo.start(async (db) => {
    await db('shop')
      .collection('people')
      .insertMany([
        {
          _id: 1 as never,
          name: 'Ada',
          address: { city: 'Milano', zip: '20100' },
          items: [
            { sku: 'A1', qty: 2 },
            { sku: 'B2', qty: 1 },
          ],
          tags: ['a', 'b'],
          score: new BSON.Int32(42),
        },
        { _id: 2 as never, name: 'Bob', address: 'unknown', email: 'bob@example.com', items: [], tags: [] },
        { _id: 3 as never, name: 'Cy', address: { city: 'Roma' }, items: [{ sku: 'C3', qty: 5 }], tags: ['c'] },
      ]);
  });
}

/** Datardo with the tab of `shop.people` open and its three rows shown. */
export async function startOnPeople(mongo: TestMongo, running: StartedApp[]): Promise<StartedApp> {
  const started = await startWithMongo(mongo);
  running.push(started);
  await openCollection(started.window, 'shop', 'people');
  await expect(gridOf(started.window).locator('td[data-pos="c:2:0:0"]')).toBeVisible();
  return started;
}

/** The grid of the active collection tab. */
export function gridOf(window: Page) {
  return window.getByRole('grid', { name: 'Documents' });
}

/** A cell of the grid by its place: the document in the page, the drawn column (0 is the row number). */
export function cellAt(window: Page, row: number, column: number) {
  return gridOf(window).locator(`td[data-pos="c:${String(row)}:0:${String(column)}"]`);
}

/** The header of a column by its key: its tooltip starts with the key and a new line (`\a ` in CSS). */
export function headerOf(window: Page, key: string) {
  return gridOf(window).locator(`th[data-feature="table.sort@table"][title^="${key}\\a "]`);
}

/** The text on the clipboard. */
export async function clipboardText(started: StartedApp): Promise<string> {
  return started.app.evaluate(({ clipboard }) => clipboard.readText());
}

/** Empties the clipboard. */
export async function clearClipboard(started: StartedApp): Promise<void> {
  await started.app.evaluate(({ clipboard }) => clipboard.writeText(''));
}

/** Runs a command from Go to by its title. */
export async function goTo(window: Page, title: string): Promise<void> {
  await window.keyboard.press('Control+K');
  await window.keyboard.type(`>${title}`);
  await window.keyboard.press('Enter');
}

/** The status line. */
export function statusLineOf(window: Page) {
  return window.getByRole('contentinfo');
}

/** Closes every Datardo a test started, even when it failed. */
export async function closeAll(running: StartedApp[]): Promise<void> {
  for (const started of running.splice(0)) {
    await started.close().catch((error: unknown) => {
      console.warn('Datardo was already closed:', error);
    });
  }
}
