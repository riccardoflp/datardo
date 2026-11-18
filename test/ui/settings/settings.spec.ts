import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { accessible, launch, startFeature, type Started } from '../runner/launch';

let started: Started;

test.beforeEach(async () => {
  started = await launch();
});

test.afterEach(async () => {
  await started.close();
});

async function stored(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(join(started.dataFolder, 'settings.json'), 'utf8')) as Record<string, unknown>;
  } catch {
    // Not written yet: nothing is stored.
    return {};
  }
}

/** The setting of the page whose title is given. */
function setting(window: Page, title: string): ReturnType<Page['locator']> {
  return window.locator('[data-feature="settings.change@form"]').filter({ hasText: title });
}

test('settings.page: opened at a group, with the focus on its first control, and accessible in both themes', async () => {
  const { window } = started;
  await startFeature(window, 'settings.page', { group: 'Undo history' });
  await expect(window.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(window.getByRole('switch', { name: 'Keep the undo history' })).toBeFocused();
  for (const scheme of ['light', 'dark'] as const) {
    await window.emulateMedia({ colorScheme: scheme });
    await accessible(window);
  }
});

test('settings.page: the filter "undo days" leaves Days to keep, and a filter that matches nothing says so', async () => {
  const { window } = started;
  await startFeature(window, 'settings.page');
  const filter = window.getByRole('searchbox', { name: 'Filter settings' });
  await filter.fill('undo days');
  await expect(window.locator('[data-feature="settings.change@form"]')).toHaveCount(1);
  await expect(window.getByRole('heading', { name: 'Undo history' })).toBeVisible();
  await expect(window.getByRole('heading', { name: 'Window' })).toBeHidden();
  await filter.fill('nothing like it');
  await expect(window.getByText('No setting matches "nothing like it".')).toBeVisible();
  await window.getByRole('button', { name: 'Clear filter' }).click();
  await expect(window.getByRole('heading', { name: 'Window' })).toBeVisible();
});

test('settings.change: a number is saved when it leaves the field, a value refused says why, and Reset puts the default back', async () => {
  const { window } = started;
  await startFeature(window, 'settings.page', { group: 'Undo history' });
  const days = window.getByRole('textbox', { name: 'Days to keep' });
  await days.fill('1.5');
  await expect(window.getByText('Enter a whole number, 0 or more.')).toBeVisible();
  await days.press('Escape');
  await expect(days).toHaveValue('7');
  await days.fill('14');
  await days.press('Tab');
  await expect.poll(stored, { timeout: 2000 }).toEqual({ version: 1, 'datardo.undo.maxDays': 14 });
  const row = setting(window, 'Days to keep');
  await expect(row).toHaveAttribute('data-changed', 'true');
  await row.getByRole('button', { name: 'Reset Days to keep' }).click();
  await expect(days).toHaveValue('7');
  await expect(row).not.toHaveAttribute('data-changed', 'true');
  await expect.poll(stored, { timeout: 2000 }).toEqual({ version: 1 });
});

test('settings.change: turning Keep the undo history off writes it, and the Log has the step', async () => {
  const { window } = started;
  await startFeature(window, 'settings.page', { group: 'Undo history' });
  const keep = window.getByRole('switch', { name: 'Keep the undo history' });
  await expect(keep).toBeChecked();
  await keep.click();
  await expect(keep).not.toBeChecked();
  await expect.poll(stored, { timeout: 2000 }).toEqual({ version: 1, 'datardo.undo.enabled': false });
  await startFeature(window, 'runner.log');
  await expect(window.getByRole('option', { name: /set datardo\.undo\.enabled to off/u })).toBeVisible();
});

test('settings.reset: Reset all settings… lists what changed, and leaves settings.json with its version only', async () => {
  const { window } = started;
  await startFeature(window, 'settings.page');
  const resetAll = window.getByRole('button', { name: 'Reset all settings…' });
  await expect(resetAll).toBeDisabled();
  await window.getByRole('switch', { name: 'Keep the undo history' }).click();
  await expect(resetAll).toBeEnabled();
  await resetAll.click();
  const confirmation = window.getByRole('dialog', { name: 'Reset all settings' });
  await expect(confirmation.getByText('Keep the undo history: off')).toBeVisible();
  await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await confirmation.getByRole('button', { name: 'Reset all' }).click();
  await expect(resetAll).toBeDisabled();
  await expect.poll(stored, { timeout: 2000 }).toEqual({ version: 1 });
});
