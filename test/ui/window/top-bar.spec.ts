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

test('window.top-bar: the bar drags the window and its controls do not', async () => {
  const regions = await started.window.evaluate(() => {
    const region = (element: Element | null): string => {
      if (element === null) {
        return 'missing';
      }
      const style = getComputedStyle(element);
      return style.getPropertyValue('app-region') || style.getPropertyValue('-webkit-app-region');
    };
    return {
      bar: region(document.querySelector('header')),
      goTo: region(document.querySelector('[data-feature="palette.open@top-bar"]')),
      mcp: region(document.querySelector('[data-feature="mcp.setup@top-bar"]')),
    };
  });
  expect(regions).toEqual({ bar: 'drag', goTo: 'no-drag', mcp: 'no-drag' });
});

test('window.top-bar: the bar shows the name, the Go to field and the MCP state', async () => {
  const bar = started.window.locator('header');
  await expect(bar.getByText('Datardo', { exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Go to' })).toBeVisible();
  await expect(bar.getByText('Go to a collection, a key, a page or a command')).toBeVisible();
  await expect(bar.locator('[data-feature="mcp.setup@top-bar"]')).toBeVisible();
});

test('window.top-bar: in a narrow window only the Go to button is left', async () => {
  await resize(started.app, 700, 600);
  const bar = started.window.locator('header');
  await expect(bar.getByText('Go to a collection, a key, a page or a command')).toBeHidden();
  await expect(bar.getByRole('button', { name: 'Go to' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Go to' })).toHaveCount(1);
});

test('window.top-bar: the bar passes the accessibility check in both themes', async () => {
  await started.window.emulateMedia({ colorScheme: 'dark' });
  await expectAccessible(started.window);
  await started.window.emulateMedia({ colorScheme: 'light' });
  await expectAccessible(started.window);
});
