import { expect, test } from '@playwright/test';
import { accessible, launch, notice, read, startFeature, type Started } from './launch';

let started: Started;

test.beforeEach(async () => {
  started = await launch();
});

test.afterEach(async () => {
  await started.close();
});

test('runner.run: a question, a read, then a destructive plan of three steps, confirmed by typing the name', async () => {
  const { window } = started;
  await startFeature(window, 'test.destroy');
  const question = window.getByRole('dialog', { name: 'Destroy test keys' });
  await expect(question).toBeVisible();
  const name = question.getByLabel('Name');
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('orders');
  await expect(question.getByRole('button', { name: 'Choose' })).toBeVisible();
  for (const scheme of ['light', 'dark'] as const) {
    await window.emulateMedia({ colorScheme: scheme });
    await accessible(window);
  }
  await name.press('Enter');

  const confirmation = window.getByRole('dialog', { name: 'Destroy test keys' });
  const typed = confirmation.getByLabel('Type orders to confirm');
  await expect(typed).toBeFocused();
  await expect(confirmation.getByText('3 keys')).toBeVisible();
  await expect(confirmation.getByRole('list', { name: 'Steps' }).getByRole('listitem')).toHaveCount(3);
  const remove = confirmation.getByRole('button', { name: 'Delete' });
  await expect(remove).toBeDisabled();
  for (const scheme of ['light', 'dark'] as const) {
    await window.emulateMedia({ colorScheme: scheme });
    await accessible(window);
  }
  await typed.fill('Orders');
  await expect(remove).toBeDisabled();
  await typed.press('Enter');
  await expect(confirmation).toBeVisible();
  await typed.fill('orders');
  await expect(remove).toBeEnabled();
  await remove.click();

  const notifications = window.getByRole('region', { name: 'Notifications' });
  await expect(notice(notifications, 'Deleted 3 keys of orders.')).toBeVisible();
  expect(await read(window, 'test.sent')).toEqual(['DEL orders:1', 'DEL orders:2', 'DEL orders:3']);
  await accessible(window);

  await notifications.getByRole('button', { name: 'Show in log' }).click();
  const lines = window.getByRole('listbox', { name: 'Lines of the Log' });
  // Three steps of two lines each, and the line of the notification; the window's own lines are left out.
  await expect(lines.getByRole('option').filter({ hasText: '[test.destroy]' })).toHaveCount(7);
  await expect(lines.getByRole('option', { name: /\[test\.destroy\] DEL orders:1/u })).toBeVisible();
  await expect(lines.getByRole('option', { selected: true })).toContainText('Deleted 3 keys of orders.');
});

test('runner.ask: Esc cancels the question: nothing runs and the Log has no line', async () => {
  const { window } = started;
  await startFeature(window, 'test.destroy');
  const question = window.getByRole('dialog', { name: 'Destroy test keys' });
  await expect(question).toBeVisible();
  await window.keyboard.press('Escape');
  await expect(question).toBeHidden();
  expect(await read(window, 'test.sent')).toEqual([]);
  await startFeature(window, 'runner.log');
  await expect(window.getByText('Nothing has run yet.')).toBeVisible();
});

test('runner.refuse: a plan on a read-only connection is refused as a warning, with its code under Details', async () => {
  const { window } = started;
  await startFeature(window, 'test.destroy', { connection: 'test-read-only' });
  await window.getByRole('dialog', { name: 'Destroy test keys' }).getByLabel('Name').press('Enter');
  const notifications = window.getByRole('region', { name: 'Notifications' });
  await expect(notice(notifications, 'The connection Production is read-only.')).toBeVisible();
  await expect(window.getByRole('dialog')).toBeHidden();
  await notifications.getByRole('button', { name: 'Details' }).click();
  await expect(notifications.getByText('runner.run/read-only', { exact: true })).toBeVisible();
  expect(await read(window, 'test.sent')).toEqual([]);
  await accessible(window);
});

test('runner.log: the toolbar filters the lines by kind and by text', async () => {
  const { window } = started;
  await startFeature(window, 'test.destroy', { connection: 'test-read-only' });
  await window.getByRole('dialog', { name: 'Destroy test keys' }).getByLabel('Name').press('Enter');
  await startFeature(window, 'runner.log');
  const lines = window.getByRole('listbox', { name: 'Lines of the Log' });
  await expect(lines.getByRole('option')).toHaveCount(1);
  await expect(lines.getByRole('option')).toContainText('refused: runner.run/read-only');
  await window.getByRole('combobox', { name: 'All kinds' }).selectOption('steps');
  await expect(window.getByText('No line matches.')).toBeVisible();
  await window.getByRole('combobox', { name: 'All kinds' }).selectOption('');
  await window.getByRole('searchbox', { name: 'Filter the Log' }).fill('production');
  await expect(lines.getByRole('option')).toHaveCount(1);
  for (const scheme of ['light', 'dark'] as const) {
    await window.emulateMedia({ colorScheme: scheme });
    await accessible(window);
  }
  await window.getByRole('button', { name: 'Clear' }).click();
  await expect(window.getByText('Nothing has run yet.')).toBeVisible();
});
