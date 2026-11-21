/**
 * The Code section driven through the window (M24): **Code** of the query bar on a tab in Find, the languages as tabs
 * moved between with the arrow keys, **Full program**, the choices kept when the tab is closed and reopened, **Copy**
 * and its line on the status line, a filter that cannot be written as code, and **Code** of a pipeline; with the
 * keyboard and the accessibility check in both themes (QA15, QA16).
 */
import { expect, test, type Page } from '@playwright/test';
import { Int32, ObjectId } from 'mongodb';
import type { StartedApp } from '../app';
import { barOf, bothThemes, openCollection, setEditor, startWithMongo, testMongo } from '../query/collection-app';
import { clearClipboard, clipboardText, closeAll, goTo, statusLineOf } from '../table/parts-app';

const mongo = testMongo();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async (db) => {
    await db('shop')
      .collection('orders')
      .insertMany([
        { _id: new ObjectId('65f1c0de9a1b2c3d4e5f6a01'), status: 'paid', total: new Int32(120) },
        { _id: new ObjectId('65f1c0de9a1b2c3d4e5f6a02'), status: 'new', total: new Int32(20) },
      ]);
  });
});

test.afterAll(async () => {
  await mongo.stop();
});

test.afterEach(async () => {
  await closeAll(running);
});

function sectionOf(window: Page) {
  return window.getByRole('region', { name: 'Code' });
}

function languages(window: Page) {
  return sectionOf(window).getByRole('tablist', { name: 'Language' });
}

async function showCode(): Promise<StartedApp> {
  const started = await startWithMongo(mongo);
  running.push(started);
  const { window } = started;
  await openCollection(window, 'shop', 'orders');
  await expect(window.getByRole('region', { name: 'Documents' })).toBeVisible();
  await setEditor(window, 'Filter', '{ status: "paid" }');
  await window.locator('[data-feature="codegen.show@query-bar"]').first().click();
  await expect(sectionOf(window)).toBeVisible();
  return started;
}

test.describe('codegen.show', () => {
  test('Code on a tab in Find shows Code · orders · find and the Node.js lines of the filter', async () => {
    test.setTimeout(120_000);
    const { window } = await showCode();
    await expect(sectionOf(window).getByRole('heading')).toHaveText('Code · orders · find');
    await expect(languages(window).getByRole('tab', { selected: true })).toHaveText('Node.js');
    await expect(sectionOf(window).locator('pre')).toContainText('const filter = { status: "paid" };');
    await expect(sectionOf(window).getByRole('checkbox', { name: 'Full program' })).not.toBeChecked();
    await bothThemes(window);
  });

  test('the languages are tabs moved between with the arrow keys; the choices stay after the tab is reopened', async () => {
    test.setTimeout(120_000);
    const { window } = await showCode();
    await languages(window).getByRole('tab', { selected: true }).focus();
    await window.keyboard.press('ArrowRight');
    await expect(languages(window).getByRole('tab', { selected: true })).toHaveText('Python');
    await expect(languages(window).getByRole('tab', { name: 'Python' })).toBeFocused();
    await expect(sectionOf(window).locator('pre')).toContainText('query = {"status": "paid"}');
    await sectionOf(window).getByRole('checkbox', { name: 'Full program' }).check();
    await expect(sectionOf(window).locator('pre')).toContainText('from pymongo import MongoClient');
    await window.keyboard.press('Control+w');
    await expect(sectionOf(window)).toBeHidden();
    await window.keyboard.press('Control+Shift+T');
    await goTo(window, 'Code');
    await expect(languages(window).getByRole('tab', { selected: true })).toHaveText('Python');
    await expect(sectionOf(window).getByRole('checkbox', { name: 'Full program' })).toBeChecked();
  });

  test('Code of a pipeline is titled by its enabled stages', async () => {
    test.setTimeout(120_000);
    const { window } = await showCode();
    await window.locator('[data-feature="table.show@section-bar"]').click();
    await barOf(window).locator('button[data-feature="query.mode@query-bar"]').click();
    await window.getByRole('menuitemcheckbox', { name: 'Aggregate' }).click();
    await window.locator('[data-feature="codegen.show@query-bar"]').first().click();
    await expect(sectionOf(window).getByRole('heading')).toHaveText(/^Code · orders · aggregate \(\d+ stages?\)$/u);
  });
});

test.describe('codegen.copy', () => {
  test('Copy puts the code shown on the clipboard and the status line says so', async () => {
    test.setTimeout(120_000);
    const started = await showCode();
    const { window } = started;
    await clearClipboard(started);
    await sectionOf(window).locator('[data-feature="codegen.copy@toolbar"]').click();
    await expect(statusLineOf(window)).toContainText('Copied to the clipboard');
    const shown = await sectionOf(window).locator('pre').textContent();
    await expect.poll(() => clipboardText(started)).toBe(shown);
    expect(shown?.endsWith('\n')).toBe(true);
  });

  test('with the filter [1] the section shows the message, Copy is disabled and Go to does not offer Copy code', async () => {
    test.setTimeout(120_000);
    const { window } = await showCode();
    await window.locator('[data-feature="table.show@section-bar"]').click();
    await setEditor(window, 'Filter', '[1]');
    await window.locator('[data-feature="codegen.show@query-bar"]').first().click();
    await expect(sectionOf(window)).toContainText('Invalid query: Filter must be an object');
    await expect(sectionOf(window).locator('pre')).toHaveCount(0);
    await expect(sectionOf(window).locator('[data-feature="codegen.copy@toolbar"]')).toBeDisabled();
    await window.keyboard.press('Control+K');
    await window.keyboard.type('>Copy code');
    await expect(window.getByRole('option', { name: /Copy code/u })).toHaveCount(0);
    await window.keyboard.press('Escape');
  });
});
