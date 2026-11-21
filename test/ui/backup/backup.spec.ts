/**
 * Backups driven through the window (M25): **Back up…** and **Restore from backup…** in the menu of a MongoDB
 * connection; a backup of a database as an archive, through the system's save dialog, ending with **Copy mongorestore
 * command** and **Reveal file**; and that archive restored into another database, confirmed first. The system's
 * dialogs are answered in the main process; the files are written in a temporary folder.
 */
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, firstConnection, startIntent, testMongo } from '../query/collection-app';
import { closeAll, seedPeople, startOnPeople } from '../table/parts-app';

const mongo = testMongo();
const running: StartedApp[] = [];
let folder = '';

test.beforeAll(async () => {
  test.setTimeout(180_000);
  folder = await mkdtemp(join(tmpdir(), 'datardo-ui-m25-backup-'));
  await seedPeople(mongo);
});

test.afterAll(async () => {
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
});

test.afterEach(async () => {
  await closeAll(running);
});

async function answerDialogs(app: ElectronApplication, paths: { open?: string; save?: string }): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    const replaced = dialog as unknown as Record<string, unknown>;
    replaced['showOpenDialog'] = () =>
      Promise.resolve({
        canceled: chosen.open === undefined,
        filePaths: chosen.open === undefined ? [] : [chosen.open],
      });
    replaced['showSaveDialog'] = () => Promise.resolve({ canceled: chosen.save === undefined, filePath: chosen.save });
  }, paths);
}

test.describe('backup.create', () => {
  test('the menu of the connection offers Back up… and Restore from backup…', async () => {
    test.setTimeout(120_000);
    const { window } = await startOnPeople(mongo, running);
    await window.locator('[data-feature="connection.menu@connection-island"]').click();
    const menu = window.getByRole('menu', { name: 'Menu of Local' });
    await expect(menu.locator('[data-feature="backup.create@connection-island"]')).toHaveText('Back up…');
    await expect(menu.locator('[data-feature="backup.restore@connection-island"]')).toHaveText('Restore from backup…');
    await window.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('backs up a database as an archive, then restores it into another, confirmed first; in both themes', async () => {
    test.setTimeout(150_000);
    const { window, app } = await startOnPeople(mongo, running);
    const archive = join(folder, 'shop.agz');
    await answerDialogs(app, { save: archive, open: archive });
    const connection = await firstConnection(window);

    const backup = startIntent(window, 'backup.create', {}, { kind: 'database', connection, database: 'shop' });
    const formats = window.getByRole('dialog', { name: /format$/u });
    await expect(formats.getByRole('radio')).toHaveCount(3);
    await bothThemes(window);
    await formats.getByRole('radio', { name: /^Archive \(\.agz\)/u }).check();
    await formats.getByRole('button', { name: 'Choose' }).click();
    expect(await backup).toEqual({ kind: 'done' });
    await expect(window.getByText(/^Backed up .*shop.*to .*shop\.agz/u)).toBeVisible();
    await expect(window.getByRole('button', { name: 'Copy mongorestore command' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Reveal file' })).toBeVisible();
    expect((await stat(archive)).size).toBeGreaterThan(0);

    const restore = startIntent(window, 'backup.restore', {}, { kind: 'database', connection, database: 'shop_ui' });
    const kinds = window.getByRole('dialog', { name: /backup$/u });
    await kinds.getByRole('radio', { name: /^Archive/u }).check();
    await kinds.getByRole('button', { name: 'Choose' }).click();
    const confirmation = window.getByRole('dialog', { name: /Restore/u });
    await expect(confirmation).toContainText('Restore 1 collection into Local › shop_ui?');
    await confirmation.getByRole('button', { name: 'Restore', exact: true }).click();
    expect(await restore).toEqual({ kind: 'done' });
    const restored = await mongo.use((db) => db('shop_ui').collection('people').countDocuments());
    expect(restored).toBe(3);
  });
});
