/**
 * The page of a GridFS bucket and its inspector through the window (M33): the table of files with its filter and its
 * sort, the preview of a picture (an SVG with a script, which does not run), a text and the files document, and the
 * keyboard alone on the selected row: the arrows, `Enter`, `F2`, `Delete` and `Shift+F10`; each with the
 * accessibility check in both themes. Nothing here hands a file to the system: `Enter` is tried on a type that is
 * refused.
 */
import { expect, test, type Page } from '@playwright/test';
import { GridFSBucket } from 'mongodb';
import type { StartedApp } from '../app';
import { bothThemes, firstConnection, startIntent, startWithMongo, testMongo } from '../query/collection-app';
import { closeAll } from '../table/parts-app';

const mongo = testMongo();
const running: StartedApp[] = [];

/** A picture of 1 by 1 pixel. */
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** An SVG whose script would mark the window, were it run. */
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>window.svgRan = true;</script>' +
  '<rect width="10" height="10" fill="red"/></svg>';

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async (db) => {
    const bucket = new GridFSBucket(db('shop'));
    const files: readonly [string, Buffer][] = [
      ['logo.png', pixel],
      ['picture.svg', Buffer.from(svg)],
      ['notes.txt', Buffer.from('Hello, GridFS!\n')],
      ['run.exe', Buffer.from([0x4d, 0x5a, 0, 0])],
    ];
    for (const [name, bytes] of files) {
      await new Promise<void>((resolve, reject) => {
        bucket.openUploadStream(name).on('finish', resolve).on('error', reject).end(bytes);
      });
    }
  });
});

test.afterAll(async () => {
  await mongo.stop();
});

test.afterEach(async () => {
  await closeAll(running);
});

/** Datardo with the page of `shop › fs` open, its four files shown. */
async function startOnBucket(): Promise<Page> {
  const started = await startWithMongo(mongo);
  running.push(started);
  const connection = await firstConnection(started.window);
  await startIntent(
    started.window,
    'gridfs.show',
    { connection, database: 'shop', bucket: 'fs' },
    { kind: 'database', connection, database: 'shop' },
  );
  await expect(filesOf(started.window).getByRole('row')).toHaveCount(5);
  return started.window;
}

function filesOf(window: Page) {
  return window.getByRole('grid', { name: 'Files' });
}

function rowOf(window: Page, name: string) {
  return filesOf(window).getByRole('row').filter({ hasText: name });
}

test.describe('gridfs.show', () => {
  test('lists the files with their summary, filters them by name and sorts them by a click on a heading', async () => {
    test.setTimeout(120_000);
    const window = await startOnBucket();
    await expect(window.getByRole('status').filter({ hasText: /^4 files · /u })).toBeVisible();
    await bothThemes(window);
    await window.getByRole('searchbox', { name: /Filter by name/u }).fill('NOTES');
    await expect(filesOf(window).getByRole('row')).toHaveCount(2);
    await expect(rowOf(window, 'notes.txt')).toBeVisible();
    await window.getByRole('searchbox', { name: /Filter by name/u }).fill('');
    await expect(filesOf(window).getByRole('row')).toHaveCount(5);
    await filesOf(window).getByRole('button', { name: 'Name' }).click();
    await expect(filesOf(window).getByRole('row').nth(1)).toContainText('logo.png');
    await expect(filesOf(window).getByRole('columnheader', { name: /Name/u })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });
});

test.describe('gridfs.inspect', () => {
  test('a picture is shown as an image, an SVG among them, and its script does not run', async () => {
    test.setTimeout(120_000);
    const window = await startOnBucket();
    await rowOf(window, 'picture.svg').click();
    const inspector = window.locator('[data-feature="gridfs.inspect@inspector"]');
    await expect(inspector.getByRole('img', { name: 'picture.svg' })).toBeVisible();
    expect(await window.evaluate(() => (window as unknown as { svgRan?: boolean }).svgRan)).toBeUndefined();
    await expect(inspector).toContainText('Files document');
    await bothThemes(window);
    await rowOf(window, 'notes.txt').click();
    await expect(inspector.locator('pre').first()).toHaveText('Hello, GridFS!\n');
    await expect(inspector.getByRole('button', { name: 'Edit metadata' })).toBeVisible();
    await expect(inspector.getByRole('button', { name: 'Copy _id' })).toBeVisible();
  });
});

test.describe('gridfs.open', () => {
  test('with the keyboard alone: the arrows select, Enter on a type not handed to the system is refused', async () => {
    test.setTimeout(120_000);
    const window = await startOnBucket();
    await window.getByRole('searchbox', { name: /Filter by name/u }).fill('run');
    await expect(filesOf(window).getByRole('row')).toHaveCount(2);
    await filesOf(window).focus();
    await window.keyboard.press('ArrowDown');
    await expect(rowOf(window, 'run.exe')).toHaveAttribute('aria-selected', 'true');
    await window.keyboard.press('Enter');
    await expect(
      window.getByText("Datardo doesn't open files of this type: download it instead.").first(),
    ).toBeVisible();
  });
});

test.describe('gridfs.rename', () => {
  test('F2 on the selected row asks the new name, the name selected up to its extension', async () => {
    test.setTimeout(120_000);
    const window = await startOnBucket();
    await rowOf(window, 'notes.txt').click();
    await filesOf(window).focus();
    await window.keyboard.press('F2');
    const dialog = window.getByRole('dialog', { name: 'Rename notes.txt' });
    await expect(dialog).toBeVisible();
    const field = dialog.getByRole('textbox');
    await expect(field).toHaveValue('notes.txt');
    await expect
      .poll(() => field.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd]))
      .toEqual([0, 5]);
    await bothThemes(window);
    await window.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('gridfs.delete', () => {
  test('Delete on the selected row asks first; Escape deletes nothing; Shift+F10 opens the menu of the row', async () => {
    test.setTimeout(120_000);
    const window = await startOnBucket();
    await rowOf(window, 'logo.png').click();
    await filesOf(window).focus();
    await window.keyboard.press('Delete');
    const confirmation = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    await expect(confirmation).toContainText('Delete logo.png (70 B) from Local › shop › fs?');
    await window.keyboard.press('Escape');
    await expect(confirmation).toBeHidden();
    await expect(rowOf(window, 'logo.png')).toBeVisible();
    await filesOf(window).focus();
    await window.keyboard.press('Shift+F10');
    const menu = window.getByRole('menu', { name: 'logo.png' });
    await expect(menu.getByRole('menuitem')).toHaveText(['Open', 'Download…', 'Rename…', 'Delete']);
    await bothThemes(window);
    await window.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });
});
