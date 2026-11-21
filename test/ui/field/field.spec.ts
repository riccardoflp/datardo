/**
 * The column actions through the window (M21): **Rename field…** in the menu of a column header, with its tooltip, its
 * dialog and its confirmation, after which the column has its new name; **Convert type…** from Go to on the column of
 * the selected cell; each with the keyboard and the accessibility check in both themes (QA15, QA16).
 */
import { expect, test } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, testMongo } from '../query/collection-app';
import { cellAt, closeAll, goTo, gridOf, headerOf, seedPeople, startOnPeople } from '../table/parts-app';

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

test.describe('field.rename', () => {
  test('Rename field… on the header of email renames it in every document, and the column follows', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await headerOf(window, 'email').click({ button: 'right' });
    const menu = window.getByRole('menu', { name: 'Menu of the column email' });
    const entry = menu.getByRole('menuitem', { name: 'Rename field…' });
    await expect(entry).toHaveAttribute('title', '$rename in the documents matching the filter');
    await entry.click();
    const form = window.getByRole('dialog', { name: 'Rename email' });
    await expect(form.getByRole('textbox')).toHaveValue('email');
    await bothThemes(window);
    await form.getByRole('textbox').fill('mail');
    await window.keyboard.press('Enter');
    const confirmation = window.getByRole('alertdialog').or(window.getByRole('dialog')).last();
    await expect(confirmation).toContainText('Rename email to mail in 1 document of people?');
    await expect(confirmation).toContainText('The filter is empty, so every document of the collection is affected.');
    await bothThemes(window);
    await confirmation.getByRole('button', { name: 'Rename in all' }).click();
    await expect(headerOf(window, 'mail')).toBeVisible();
    const bob = await mongo.use((db) =>
      db('shop')
        .collection('people')
        .findOne({ _id: 2 as never }),
    );
    expect(bob?.['mail']).toBe('bob@example.com');
    await mongo.use((db) =>
      db('shop')
        .collection('people')
        .updateOne({ _id: 2 as never }, { $rename: { mail: 'email' } }),
    );
  });
});

test.describe('field.convert-type', () => {
  test('Convert type… from Go to acts on the column of the selected cell, and lists the current types', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await cellAt(window, 0, 1).click();
    const score = gridOf(window).locator('td[data-pos^="c:0:0:"]').filter({ hasText: '42' }).first();
    await score.click();
    await goTo(window, 'Convert type…');
    const list = window.getByRole('dialog', { name: 'Convert score' });
    await expect(list).toContainText('Type to convert the values to · now: int 1');
    await bothThemes(window);
    await window.keyboard.press('Escape');
    await expect(list).toBeHidden();
  });
});
