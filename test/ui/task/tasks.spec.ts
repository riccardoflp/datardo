/**
 * The Scheduled tasks page driven through the window (M26): the empty page from the rail; **Schedule…** in the menu of
 * the connection island opening the form of a new task of the connection; the problems of the form; a task saved, run
 * with **Run now**, its details opened with the keyboard, and deleted with `Delete` after its confirmation; the
 * accessibility check in both themes. The outputs go to a temporary folder.
 */
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, startWithMongo, testMongo } from '../query/collection-app';
import { closeAll, seedPeople } from '../table/parts-app';

const mongo = testMongo();
const running: StartedApp[] = [];
let folder = '';

test.beforeAll(async () => {
  test.setTimeout(180_000);
  folder = await mkdtemp(join(tmpdir(), 'datardo-ui-m26-'));
  await seedPeople(mongo);
});

test.afterAll(async () => {
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
});

test.afterEach(async () => {
  await closeAll(running);
});

async function started(): Promise<Page> {
  const app = await startWithMongo(mongo);
  running.push(app);
  return app.window;
}

/** **Schedule…** in the menu of the connection island: the page with the form of a new task of Local. */
async function schedule(window: Page): Promise<ReturnType<Page['getByRole']>> {
  await window.locator('[data-feature="connection.menu@connection-island"]').click();
  await window.locator('[data-feature="task.edit@connection-island"]').click();
  const form = window.getByRole('form', { name: 'New scheduled task' });
  await expect(form).toBeVisible();
  return form;
}

test.describe('task.show', () => {
  test('the rail opens the empty page, which offers New task…; in both themes', async () => {
    test.setTimeout(120_000);
    const window = await started();
    await window.locator('[data-feature="task.show@rail"]').click();
    await expect(
      window.getByText(
        'No scheduled tasks yet. New task… (or Schedule… on a connection, a database or a collection) backs up or exports periodically.',
      ),
    ).toBeVisible();
    await expect(window.locator('[data-feature="task.edit@empty-state"]')).toHaveText('New task…');
    await expect(window.getByRole('toolbar', { name: 'Scheduled tasks' })).toContainText('0 tasks, 0 enabled');
    await bothThemes(window);
  });
});

test.describe('task.edit', () => {
  test('Schedule… opens the form of a new backup of the connection, which says what is wrong', async () => {
    test.setTimeout(120_000);
    const window = await started();
    const form = await schedule(window);
    await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Back up Local');
    await expect(form.getByLabel('Connection')).toHaveValue(/.+/u);
    await expect(form.getByText('Daily at 02:00. Next:', { exact: false })).toBeVisible();
    await bothThemes(window);
    await form.getByLabel('Name', { exact: true }).fill('');
    await form.getByLabel('Folder', { exact: true }).focus();
    await expect(form.getByText('Enter a name')).toBeVisible();
    await form.getByLabel('Name', { exact: true }).fill('Orders');
    await form.getByRole('radio', { name: 'Export' }).check();
    await form.getByRole('button', { name: 'Create task' }).click();
    await expect(form.getByText('An export is of one collection: enter it')).toBeVisible();
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: 'Cancel' }).click();
    await expect(form).toBeHidden();
  });

  test('saves a task, runs it with Run now, shows its runs, and deletes it with Delete', async () => {
    test.setTimeout(150_000);
    const window = await started();
    const form = await schedule(window);
    await form.getByLabel('Folder', { exact: true }).fill(folder);
    await form.getByRole('button', { name: 'Create task' }).click();
    await expect(form).toBeHidden();
    await expect(window.getByText(/^Saved "Back up Local" \(Daily at 02:00\)\. Next run: /u)).toBeVisible();
    const item = window.getByRole('listitem', { name: 'Back up Local' });
    await expect(item).toContainText('Backup, Archive (.agz)');
    await item.locator('[data-feature="task.run@list"]').click();
    await expect(item).toContainText('done', { timeout: 60_000 });
    expect((await readdir(folder)).some((name) => name.endsWith('.agz'))).toBe(true);

    await item.focus();
    await window.keyboard.press('Enter');
    await expect(item).toContainText(`Writes: Archive (.agz) in ${folder}, named {name}_{date}_{time}`);
    await expect(item.locator('[data-feature="task.show@list"]')).toHaveText(/\.agz$/u);
    await bothThemes(window);

    await item.focus();
    await window.keyboard.press('Delete');
    const confirmation = window.getByRole('dialog', { name: /Delete the scheduled task "Back up Local"\?/u });
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(window.locator('[data-feature="task.edit@empty-state"]')).toBeVisible();
    expect((await readdir(folder)).some((name) => name.endsWith('.agz'))).toBe(true);
  });
});
