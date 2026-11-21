/**
 * Reading and writing documents through the window (M12): the inspector of the selected row, the editor over a cell,
 * the document tab with `Ctrl+S`, the insert dialog, the delete of a row with its confirmation, and the form of Update
 * many; each with the keyboard and the accessibility check in both themes.
 */
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import {
  bothThemes,
  documentRows,
  documentsOf,
  firstConnection,
  startIntent,
  testMongo,
} from '../query/collection-app';
import { cellAt, closeAll, gridOf, seedPeople, startOnPeople } from '../table/parts-app';

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

/** The person of an `_id`, as another client reads it. */
async function person(id: number): Promise<Record<string, unknown> | null> {
  return mongo.use((db) =>
    db('shop')
      .collection('people')
      .findOne({ _id: id as never }),
  );
}

/** The editor whose content has the focus: its lines replaced by `text`, as a paste does. */
async function replaceFocusedText(window: Page, text: string): Promise<void> {
  await window.keyboard.press('Control+A');
  await window.keyboard.insertText(text);
}

/** The button of the runner's confirmation that goes on. */
async function confirm(window: Page, button: RegExp): Promise<void> {
  const dialog = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: button }).click();
}

test.describe('document.inspect', () => {
  test('Enter on a row shows its document in the inspector as a tree, read with the arrows', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await cellAt(window, 0, 1).click();
    await window.keyboard.press('Enter');
    const inspector = window.locator('[data-feature="document.inspect@table"]');
    await expect(inspector).toBeVisible();
    const tree = inspector.getByRole('tree');
    await expect(tree.getByRole('treeitem').first()).toBeFocused();
    await expect(tree.getByRole('treeitem', { name: /name/u })).toContainText('"Ada"');
    await window.keyboard.press('ArrowDown');
    await expect(tree.getByRole('treeitem').nth(1)).toBeFocused();
    await inspector.getByRole('button', { name: 'Text' }).click();
    await expect(inspector.locator('pre')).toContainText('name: "Ada"');
    await bothThemes(window);
  });
});

test.describe('document.inline-edit', () => {
  test('a double click on a value opens the editor over it; Enter saves, Esc cancels and writes nothing', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    const name = gridOf(window).locator('td[data-pos^="c:1:0:"]').filter({ hasText: '"Bob"' });
    await name.dblclick();
    const editor = window.locator('[data-feature="document.inline-edit@table"]');
    await expect(editor).toBeVisible();
    await expect(editor).toContainText('Enter to save · Shift+Enter new line · Esc to cancel');
    await bothThemes(window);
    await replaceFocusedText(window, '"Bobby"');
    await window.keyboard.press('Escape');
    await expect(editor).toBeHidden();
    expect((await person(2))?.['name']).toBe('Bob');
    await name.dblclick();
    await expect(editor).toBeVisible();
    await replaceFocusedText(window, '"Bobby"');
    await window.keyboard.press('Enter');
    await expect(editor).toBeHidden();
    await expect.poll(async () => (await person(2))?.['name']).toBe('Bobby');
    await expect(gridOf(window)).toContainText('"Bobby"');
    await mongo.use((db) =>
      db('shop')
        .collection('people')
        .updateOne({ _id: 2 as never }, { $set: { name: 'Bob' } }),
    );
  });
});

test.describe('document.open', () => {
  test('Open in a tab shows the document in the editor; typing marks the tab unsaved and Ctrl+S saves it', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await cellAt(window, 2, 0).click({ button: 'right' });
    await window
      .getByRole('menu', { name: 'Menu of document 3' })
      .getByRole('menuitem', { name: 'Open in a tab' })
      .click();
    const tab = window.getByRole('tab', { name: /people · 3/u });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    const editor = window.locator('[data-feature="document.save@editor"]');
    await expect(editor).toContainText('name: "Cy"');
    await bothThemes(window);
    await editor.getByRole('textbox').click();
    await replaceFocusedText(
      window,
      '{\n  _id: 3,\n  name: "Cyrus",\n  address: { city: "Roma" },\n  items: [ { sku: "C3", qty: 5 } ],\n  tags: [ "c" ]\n}',
    );
    await expect(tab).toHaveAttribute('aria-label', /unsaved changes/u);
    await window.keyboard.press('Control+S');
    await expect.poll(async () => (await person(3))?.['name']).toBe('Cyrus');
    await expect(tab).not.toHaveAttribute('aria-label', /unsaved changes/u);
    await mongo.use((db) =>
      db('shop')
        .collection('people')
        .updateOne({ _id: 3 as never }, { $set: { name: 'Cy' } }),
    );
  });
});

test.describe('document.open', () => {
  test('after Make read-only an open document tab cannot be typed in, and after Allow changes it can again', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await cellAt(window, 0, 0).click({ button: 'right' });
    await window
      .getByRole('menu', { name: 'Menu of document 1' })
      .getByRole('menuitem', { name: 'Open in a tab' })
      .click();
    const textbox = window.locator('[data-feature="document.save@editor"]').getByRole('textbox');
    await expect(textbox).toBeVisible();
    const target = { kind: 'connection', connection: await firstConnection(window) };
    await startIntent(window, 'connection.read-only', null, target);
    await expect(textbox).toHaveAttribute('aria-readonly', 'true');
    await expect(window.getByRole('toolbar', { name: '1', exact: true }).getByText('Read-only')).toBeVisible();
    await expect(window.locator('[data-feature="document.save@toolbar"]')).toBeDisabled();
    await bothThemes(window);
    const allowed = startIntent(window, 'connection.allow-changes', null, target);
    const asked = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    // Allow changes may ask first: whichever comes first, the question or the end, under the load of a whole suite.
    const shown = asked
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => 'asked' as const)
      .catch(() => 'not asked' as const);
    if ((await Promise.race([allowed.then(() => 'ended' as const), shown])) === 'asked') {
      await asked.getByRole('button').last().click();
    }
    await allowed;
    await expect(textbox).not.toHaveAttribute('aria-readonly', 'true');
  });
});

test.describe('document.save', () => {
  test('Save in the toolbar is disabled until the text changes', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await cellAt(window, 0, 0).click({ button: 'right' });
    await window
      .getByRole('menu', { name: 'Menu of document 1' })
      .getByRole('menuitem', { name: 'Open in a tab' })
      .click();
    const save = window.locator('[data-feature="document.save@toolbar"]');
    await expect(save).toBeDisabled();
    await window.locator('[data-feature="document.save@editor"]').getByRole('textbox').click();
    await window.keyboard.press('End');
    await window.keyboard.type(' ');
    await expect(save).toBeEnabled();
  });
});

test.describe('document.insert', () => {
  test('Insert opens the dialog; Ctrl+Enter inserts the document typed and the table shows it', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await documentsOf(window).getByRole('toolbar').getByRole('button', { name: 'Insert', exact: true }).click();
    const dialog = window.getByRole('dialog', { name: 'Insert into people' });
    await expect(dialog).toBeVisible();
    await bothThemes(window);
    await dialog.getByRole('textbox').click();
    await replaceFocusedText(window, '{ _id: 4, name: "Dee" }');
    await expect(dialog).toContainText('1 document(s) to insert');
    await window.keyboard.press('Control+Enter');
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await person(4))?.['name']).toBe('Dee');
    await expect(documentRows(window)).toHaveCount(4);
    await mongo.use((db) =>
      db('shop')
        .collection('people')
        .deleteOne({ _id: 4 as never }),
    );
  });
});

test.describe('document.insert-from-tab', () => {
  test('Open in a tab of the dialog opens New document 1 with the text; Ctrl+S inserts it', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await documentsOf(window).getByRole('toolbar').getByRole('button', { name: 'Insert', exact: true }).click();
    const dialog = window.getByRole('dialog', { name: 'Insert into people' });
    await dialog.getByRole('textbox').click();
    await replaceFocusedText(window, '{ _id: 5, name: "Eve" }');
    await window.locator('[data-feature="document.open@dialog"]').click();
    await expect(dialog).toBeHidden();
    const tab = window.getByRole('tab', { name: /New document 1/u });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    const editor = window.locator('[data-feature="document.insert-from-tab@editor"]');
    await expect(editor).toContainText('name: "Eve"');
    await editor.getByRole('textbox').click();
    await window.keyboard.press('Control+S');
    await expect.poll(async () => (await person(5))?.['name']).toBe('Eve');
    await expect(window.getByRole('tab', { name: /people · 5/u })).toBeVisible();
    await mongo.use((db) =>
      db('shop')
        .collection('people')
        .deleteOne({ _id: 5 as never }),
    );
  });
});

test.describe('document.delete', () => {
  test('Delete on a row asks first; Delete deletes the document and the table no longer shows it', async () => {
    test.setTimeout(120_000);
    await mongo.use((db) =>
      db('shop')
        .collection('people')
        .insertOne({ _id: 6 as never, name: 'Gone' }),
    );
    const { window } = await startOnPeople(mongo, running);
    await expect(documentRows(window)).toHaveCount(4);
    await cellAt(window, 3, 1).click();
    await window.keyboard.press('Delete');
    await bothThemes(window);
    await confirm(window, /^Delete$/u);
    await expect.poll(async () => person(6)).toBeNull();
    await expect(documentRows(window)).toHaveCount(3);
  });
});

test.describe('document.update-many', () => {
  test('Update many… opens the form with the count; Continue and the confirmation update the documents', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await documentsOf(window).getByRole('toolbar').getByRole('button', { name: 'Update many…' }).click();
    const form = window.getByRole('dialog', { name: 'Update many · people' });
    await expect(form).toContainText('3 documents match the filter.');
    await bothThemes(window);
    await form.getByRole('textbox').click();
    await replaceFocusedText(window, '{ $set: { seen: true } }');
    await form.getByRole('button', { name: 'Continue' }).click();
    await confirm(window, /^Update/u);
    await expect.poll(async () => (await person(1))?.['seen']).toBe(true);
    await mongo.use((db) =>
      db('shop')
        .collection('people')
        .updateMany({}, { $unset: { seen: '' } }),
    );
  });
});
