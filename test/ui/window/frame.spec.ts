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

test('window.frame: the window has no menu bar, a minimum size and the background of its theme', async () => {
  const frame = await started.app.evaluate(({ BrowserWindow, Menu, nativeTheme }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return {
      windows: BrowserWindow.getAllWindows().length,
      menu: Menu.getApplicationMenu() === null,
      menuBarVisible: window?.isMenuBarVisible(),
      minimum: window?.getMinimumSize(),
      background: window?.getBackgroundColor().toLowerCase(),
      dark: nativeTheme.shouldUseDarkColors,
    };
  });
  expect(frame.windows).toBe(1);
  if (process.platform !== 'darwin') {
    expect(frame.menu).toBe(true);
    expect(frame.menuBarVisible).toBe(false);
  }
  expect(frame.minimum).toEqual([640, 400]);
  expect(frame.background).toBe(frame.dark ? '#0b0d11' : '#e8ebf0');
});

test('window.title: the window is named Datardo while no tab is open', async () => {
  await expect(started.window).toHaveTitle('Datardo');
  const title = await started.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle());
  expect(title).toBe('Datardo');
});
