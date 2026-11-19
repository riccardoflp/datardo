/**
 * The copies of the table driven through the window (`table.copy-as`, `table.copy-value`, `table.copy-path`): what
 * lands on the clipboard, and *Copied to the clipboard* on the status line.
 */
import { expect, test } from '@playwright/test';
import type { StartedApp } from '../app';
import { testMongo } from '../query/collection-app';
import {
  cellAt,
  clearClipboard,
  clipboardText,
  closeAll,
  goTo,
  headerOf,
  seedPeople,
  startOnPeople,
  statusLineOf,
} from './parts-app';

const mongo = testMongo();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await seedPeople(mongo);
});

test.afterAll(async () => {
  await mongo.stop();
});

test.afterEach(async () => {
  await closeAll(running);
});

test.describe('table.copy-as', () => {
  test('Copy as › mongosh on a row copies the document as mongosh text, and the status line says so', async () => {
    test.setTimeout(120_000);
    const started = await startOnPeople(mongo, running);
    const { window } = started;
    await clearClipboard(started);
    await cellAt(window, 1, 0).click({ button: 'right' });
    await window.getByRole('menu', { name: 'Menu of document 2' }).getByRole('menuitem', { name: 'Copy as' }).hover();
    await window.getByRole('menu', { name: 'Copy as' }).getByRole('menuitem', { name: 'mongosh' }).click();
    await expect(statusLineOf(window).getByText('Copied to the clipboard')).toBeVisible();
    const copied = await clipboardText(started);
    expect(copied).toContain('name: "Bob"');
    expect(copied).toContain('email: "bob@example.com"');
  });

  test('Copy document as JSON from Go to copies the document of the selected cell', async () => {
    test.setTimeout(120_000);
    const started = await startOnPeople(mongo, running);
    const { window } = started;
    await clearClipboard(started);
    await cellAt(window, 2, 2).click();
    await goTo(window, 'Copy document as JSON');
    await expect.poll(() => clipboardText(started)).toContain('"name": "Cy"');
  });
});

test.describe('table.copy-value', () => {
  test('Copy value of a cell copies it in mongosh syntax with its type; from Go to too', async () => {
    test.setTimeout(120_000);
    const started = await startOnPeople(mongo, running);
    const { window } = started;
    await clearClipboard(started);
    await cellAt(window, 0, 2).click({ button: 'right' });
    await window
      .getByRole('menu', { name: 'Menu of name in document 1' })
      .getByRole('menuitem', { name: 'Copy value' })
      .click();
    await expect.poll(() => clipboardText(started)).toBe('"Ada"');
    await expect(statusLineOf(window).getByText('Copied to the clipboard')).toBeVisible();
    await cellAt(window, 0, 6).click();
    await goTo(window, 'Copy value');
    await expect.poll(() => clipboardText(started)).toBe('42');
  });
});

test.describe('table.copy-path', () => {
  test('Copy field path on a cell and on a header copies the key, without quotes', async () => {
    test.setTimeout(120_000);
    const started = await startOnPeople(mongo, running);
    const { window } = started;
    await clearClipboard(started);
    await cellAt(window, 1, 7).click({ button: 'right' });
    await window
      .getByRole('menu', { name: 'Menu of email in document 2' })
      .getByRole('menuitem', { name: 'Copy field path' })
      .click();
    await expect.poll(() => clipboardText(started)).toBe('email');
    await headerOf(window, 'tags').click({ button: 'right' });
    await window
      .getByRole('menu', { name: 'Menu of the column tags' })
      .getByRole('menuitem', { name: 'Copy field path' })
      .click();
    await expect.poll(() => clipboardText(started)).toBe('tags');
  });
});
