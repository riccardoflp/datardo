import { expect, test } from '@playwright/test';
import { expectAccessible } from '../app';
import { closeAll, launch, newDataFolder, removeDataFolder, resize, type Launched } from './launch';

let dataFolder: string;
let started: Launched;

test.beforeEach(async () => {
  dataFolder = await newDataFolder();
  started = await launch(dataFolder);
  await resize(started.app, 1440, 900);
});

test.afterEach(async () => {
  await closeAll();
  await removeDataFolder(dataFolder);
});

/** Asks the window to open About as the menu bar of macOS does, by counting `aboutAsked` up. */
async function askAbout(): Promise<void> {
  await started.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('datardo:event', {
      slice: 'window',
      type: 'changed',
      window: { aboutAsked: 1 },
    });
  });
}

test('window.about: About shows the version, the runtime, the data folder and the links', async () => {
  await askAbout();
  const about = started.window.getByRole('dialog', { name: 'About Datardo' });
  await expect(about).toBeVisible();
  await expect(about.getByText(/^Datardo \d+\.\d+\.\d+/u)).toBeVisible();
  await expect(about.getByText(/Electron .+, Chromium .+, Node\.js .+\.$/u)).toBeVisible();
  await expect(about.getByText(dataFolder)).toBeVisible();
  await expect(about.locator('[data-feature="window.open-data-folder@dialog"]')).toBeVisible();
  await expect(about.getByRole('button', { name: 'Documentation' })).toBeVisible();
  await expect(about.getByRole('button', { name: 'Report an issue' })).toBeVisible();
  await expect(about.locator('[data-feature="window.check-update@dialog"]')).toBeVisible();
  await expectAccessible(started.window);
});

test('window.about: Copy puts the four lines on the clipboard and reads Copied', async () => {
  await askAbout();
  const about = started.window.getByRole('dialog', { name: 'About Datardo' });
  await about.getByRole('button', { name: 'Copy' }).click();
  await expect(about.getByRole('button', { name: 'Copied' })).toBeVisible();
  const copied = await started.app.evaluate(({ clipboard }) => clipboard.readText());
  // The clipboard of Windows ends its lines with CR LF.
  const lines = copied.split(/\r?\n/u);
  expect(lines).toHaveLength(4);
  expect(lines[0]).toMatch(/^Datardo \d+\.\d+\.\d+/u);
  expect(lines[1]).toBe('MongoDB and Redis client.');
});

test('window.about: Esc closes About', async () => {
  await askAbout();
  const about = started.window.getByRole('dialog', { name: 'About Datardo' });
  await expect(about).toBeVisible();
  await started.window.keyboard.press('Escape');
  await expect(about).toBeHidden();
});
