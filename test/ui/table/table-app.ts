/**
 * What the UI tests of the table share: the collections the cards work on (*the three people* of `shop.people`, a
 * value of each kind, and pages of numbered documents), a Datardo with a collection tab open on one of them, and the
 * parts of the grid found by their keys.
 */
import { expect, type Page } from '@playwright/test';
import { BSON, type Db } from 'mongodb';
import type { StartedApp } from '../app';
import { documentsOf, openCollection, startWithMongo, type TestMongo } from '../query/collection-app';

/** Ada, Bob and Cy of `shop.people`, as the cards write them. */
export const people = [
  {
    _id: 1,
    name: 'Ada',
    address: { city: 'Milano', zip: '20100' },
    items: [
      { sku: 'A1', qty: 2 },
      { sku: 'B2', qty: 1, options: { color: 'red' } },
    ],
    tags: ['a', 'b'],
  },
  { _id: 2, name: 'Bob', address: 'unknown', email: 'bob@example.com', items: [], tags: [] },
  {
    _id: 3,
    name: 'Cy',
    address: { city: 'Roma', geo: { lat: new BSON.Double(41.9), lng: new BSON.Double(12.5) } },
    items: [{ sku: 'C3', qty: 5, parts: [{ n: 1 }] }, 7],
  },
];

/** Seeds the collections of the table's tests. */
export async function seedTables(db: (name: string) => Db): Promise<void> {
  const shop = db('shop');
  await shop.collection('people').insertMany(people as never[]);
  await shop.collection('values').insertMany([
    { _id: 1, n: 5 },
    { _id: 2, n: BSON.Long.fromNumber(5) },
    { _id: 3, n: new BSON.Double(5) },
    { _id: 4, n: BSON.Decimal128.fromString('5') },
    { _id: 5, email: null },
    { _id: 6, email: '' },
  ] as never[]);
  await shop.collection('numbers').insertMany(
    Array.from({ length: 600 }, (_, index) => ({
      _id: index + 1,
      ...Object.fromEntries(Array.from({ length: 40 }, (__, field) => [`f${String(field)}`, index * 100 + field])),
    })) as never[],
  );
  await shop.createCollection('empty');
}

/** Starts Datardo with a tab open on a collection of `shop`, its documents shown. */
export async function openTable(
  mongo: TestMongo,
  running: StartedApp[],
  collection: string,
  documents: number,
): Promise<Page> {
  const started = await startWithMongo(mongo);
  running.push(started);
  await openCollection(started.window, 'shop', collection);
  await expect(gridOf(started.window)).toHaveAttribute('aria-rowcount', String(documents + 1));
  return started.window;
}

/** The grid of the active tab. */
export function gridOf(window: Page) {
  return documentsOf(window).getByRole('grid');
}

/** The heading of a column, by its key. */
export function headingOf(window: Page, key: string) {
  return gridOf(window).locator(`th[data-key="${key}"]`);
}

/** The cells of a column, by its key, in the order of the rows. */
export function cellsOf(window: Page, key: string) {
  return gridOf(window).locator(`td[data-column="${key}"]`);
}

/** The keys of the headings of the columns, in their order, without the group headings. */
export async function leafHeadings(window: Page): Promise<string[]> {
  return gridOf(window)
    .locator('th[data-key]:not([data-group])')
    .evaluateAll((headings) =>
      headings
        .map((heading) => ({
          key: heading.getAttribute('data-key') ?? '',
          at: Number(heading.getAttribute('aria-colindex')),
        }))
        .sort((a, b) => a.at - b.at)
        .map((each) => each.key),
    );
}

/** The element that has the focus: its `data-pos`. */
export async function focusedPosition(window: Page): Promise<string | null> {
  return window.evaluate(() => document.activeElement?.getAttribute('data-pos') ?? null);
}
