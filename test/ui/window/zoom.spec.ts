import { expect, test } from '@playwright/test';
import { closeAll, launch, newDataFolder, removeDataFolder, type Launched } from './launch';

let dataFolder: string;
let started: Launched;

test.beforeEach(async () => {
  dataFolder = await newDataFolder();
  started = await launch(dataFolder);
});

test.afterEach(async () => {
  await closeAll();
  await removeDataFolder(dataFolder);
});

async function zoomFactor(): Promise<number | undefined> {
  return started.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor());
}

test('window.zoom: the keys zoom in, out and back to 100%', async () => {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await started.window.locator('header').click({ position: { x: 600, y: 20 } });
  await started.window.keyboard.press(`${modifier}+Equal`);
  await expect.poll(zoomFactor).toBeCloseTo(1.1);
  await started.window.keyboard.press(`${modifier}+Minus`);
  await started.window.keyboard.press(`${modifier}+Minus`);
  await expect.poll(zoomFactor).toBeCloseTo(0.9);
  await started.window.keyboard.press(`${modifier}+Digit0`);
  await expect.poll(zoomFactor).toBeCloseTo(1);
});

test('window.theme: the theme follows the system until the user chooses one', async () => {
  const source = await started.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource);
  expect(source).toBe('system');
});
