/**
 * Go to driven through the window (`palette.open`, `palette.key-press`, `palette.run-command`, `palette.open-result`),
 * with the keyboard alone and the accessibility check in both themes. The milestone's exit test is the first: with the
 * pointer unused, a command is found by its title and run, and Home is reached and left. Each test closes its
 * Datardo even when it fails.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, startApp, type StartedApp } from '../app';

let started: StartedApp | undefined;

test.afterEach(async () => {
  await started?.close();
  started = undefined;
});

async function launch(): Promise<Page> {
  started = await startApp();
  const { window } = started;
  await expect(window.getByRole('navigation', { name: 'Rail' })).toBeVisible();
  return window;
}

function field(window: Page): ReturnType<Page['getByRole']> {
  return window.getByRole('combobox', { name: 'Go to' });
}

function page(window: Page): ReturnType<Page['locator']> {
  return window.locator('[data-island="main"] [data-page]');
}

test.describe('palette.open', () => {
  test('with the keyboard alone, a command is found by its title in Go to and run, and Home is reached and left', async () => {
    const window = await launch();
    await expect(page(window)).toHaveAttribute('data-page', 'home');
    await window.keyboard.press('Control+k');
    await expect(field(window)).toBeFocused();
    await window.keyboard.type('>show log');
    await expect(window.getByRole('option').first()).toHaveAttribute('aria-label', /^Show log, command/u);
    await window.keyboard.press('Enter');
    await expect(page(window)).toHaveAttribute('data-page', 'log');
    await expect(field(window)).toHaveCount(0);
    await window.keyboard.press('Alt+Home');
    await expect(page(window)).toHaveAttribute('data-page', 'home');
    await window.keyboard.press('Control+Shift+P');
    await expect(field(window)).toHaveValue('>');
    await window.keyboard.type('settings');
    await window.keyboard.press('Enter');
    await expect(page(window)).toHaveAttribute('data-page', 'settings');
  });

  test('Ctrl+K lists the prefixes; Esc closes it, gives the focus back, and it opens empty the next time', async () => {
    const window = await launch();
    await window.getByRole('navigation', { name: 'Rail' }).getByRole('button', { name: 'Settings' }).focus();
    await window.keyboard.press('Control+k');
    await expect(field(window)).toBeFocused();
    await expect(window.getByText('> commands')).toBeVisible();
    await window.keyboard.type('abc');
    await window.keyboard.press('Escape');
    await expect(field(window)).toHaveCount(0);
    await expect(
      window.getByRole('navigation', { name: 'Rail' }).getByRole('button', { name: 'Settings' }),
    ).toBeFocused();
    await window.getByRole('button', { name: /Go to/u }).first().click();
    await expect(field(window)).toHaveValue('');
  });

  test('zzzz shows Nothing matches; Down on the last row selects the first; both themes pass', async () => {
    const window = await launch();
    await window.keyboard.press('Control+k');
    await window.keyboard.type('zzzz');
    await expect(window.getByText('Nothing matches "zzzz".')).toBeVisible();
    await window.keyboard.press('Control+a');
    await window.keyboard.type('>zoom');
    const options = window.getByRole('option');
    await expect(options).toHaveCount(2);
    await window.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await window.keyboard.press('ArrowDown');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    for (const theme of ['light', 'dark']) {
      await window.evaluate((name) => {
        document.documentElement.dataset['theme'] = name;
      }, theme);
      await expectAccessible(window);
    }
  });

  test('Ctrl+K again closes Go to; with a dialog open, Ctrl+K does nothing', async () => {
    const window = await launch();
    await window.keyboard.press('Control+k');
    await expect(field(window)).toBeFocused();
    await window.keyboard.press('Control+k');
    await expect(field(window)).toHaveCount(0);
    await window.keyboard.press('Control+k');
    await window.keyboard.type('>about');
    await window.keyboard.press('Enter');
    await expect(window.getByRole('dialog')).toBeVisible();
    await window.keyboard.press('Control+k');
    await expect(field(window)).toHaveCount(0);
  });
});

test.describe('palette.run-command', () => {
  test('Enter on Zoom in closes Go to and the zoom is 110%', async () => {
    const window = await launch();
    await window.keyboard.press('Control+k');
    await window.keyboard.type('>zoom in');
    await window.keyboard.press('Enter');
    await expect(field(window)).toHaveCount(0);
    await expect(window.locator('[data-feature="window.zoom@status-line"]')).toContainText('110%');
  });
});
