/**
 * The tab strip driven through the window: page tabs opened, reordered, closed and restored at the next start
 * (`tab.strip`, `tab.open`, `tab.reorder`, `tab.close`, `tab.activate`, `tab.restore`), with the keyboard and the
 * accessibility check in both themes. Each test starts Datardo on a data folder of its own, which it keeps across
 * the starts of the test, and closes every Datardo it started even when it fails.
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expectAccessible } from '../app';

let folder: string;
const running: ElectronApplication[] = [];

test.beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-ui-tabs-'));
});

test.afterEach(async () => {
  for (const app of running.splice(0)) {
    await app.close().catch((error: unknown) => {
      // Already closed by the test: nothing is left running.
      console.warn('Datardo was already closed:', error);
    });
  }
  await rm(folder, { recursive: true, force: true });
});

/** Starts Datardo on the test's data folder, at the fixed window size. */
async function launch(): Promise<{ readonly app: ElectronApplication; readonly window: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, DATARDO_DATA: folder, DATARDO_TEST: '1' } });
  running.push(app);
  const window = await app.firstWindow();
  await window.setViewportSize({ width: 1440, height: 900 });
  await expect(window.getByRole('navigation', { name: 'Rail' })).toBeVisible();
  return { app, window };
}

/** Quits a Datardo, which saves the open tabs. */
async function quit(app: ElectronApplication): Promise<void> {
  running.splice(running.indexOf(app), 1);
  await app.close();
}

/** Opens a page of the app in a tab, as `tab.open` does for every feature that shows a page. */
async function openPage(window: Page, page: string): Promise<void> {
  await window.evaluate(async (name) => {
    const bridge = (globalThis as unknown as { datardo: { start: (intent: unknown) => Promise<unknown> } }).datardo;
    await bridge.start({ feature: 'tab.open', target: { kind: 'app' }, args: { shows: { kind: 'app', page: name } } });
  }, page);
}

function strip(window: Page): Locator {
  return window.locator('[data-feature="tab.strip@tab-strip"]');
}

function tab(window: Page, title: string): Locator {
  return strip(window).getByRole('tab', { name: `${title}, app tab` });
}

async function titles(window: Page): Promise<string[]> {
  return strip(window)
    .getByRole('tab')
    .evaluateAll((tabs) => tabs.map((each) => each.querySelector('span:nth-child(2)')?.textContent ?? ''));
}

/** Drags a tab by the pointer onto another, past the 4 px that start a drag. */
async function drag(window: Page, from: Locator, onto: Locator): Promise<void> {
  const start = await from.boundingBox();
  const end = await onto.boundingBox();
  if (start === null || end === null) {
    throw new Error('The tabs are not drawn.');
  }
  await window.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await window.mouse.down();
  await window.mouse.move(end.x + 8, end.y + end.height / 2, { steps: 8 });
  await window.mouse.up();
}

test.describe('tab.restore', () => {
  test('three page tabs opened, reordered and closed come back in the same order with the same one active; with the setting off none does', async () => {
    let { app, window } = await launch();
    // Nothing to restore: Datardo starts on Home (home.show, D7).
    await expect.poll(() => titles(window)).toEqual(['Home']);
    await window.getByRole('navigation', { name: 'Rail' }).getByRole('button', { name: 'Settings' }).click();
    await openPage(window, 'log');
    await openPage(window, 'undo');
    await openPage(window, 'tasks');
    await expect.poll(() => titles(window)).toEqual(['Home', 'Settings', 'Log', 'Undo history', 'Scheduled tasks']);
    await drag(window, tab(window, 'Log'), tab(window, 'Settings'));
    await expect.poll(() => titles(window)).toEqual(['Home', 'Log', 'Settings', 'Undo history', 'Scheduled tasks']);
    await tab(window, 'Undo history').click({ button: 'middle' });
    await expect.poll(() => titles(window)).toEqual(['Home', 'Log', 'Settings', 'Scheduled tasks']);
    await tab(window, 'Settings').click();
    await expect(tab(window, 'Settings')).toHaveAttribute('aria-selected', 'true');
    await quit(app);

    ({ app, window } = await launch());
    await expect.poll(() => titles(window)).toEqual(['Home', 'Log', 'Settings', 'Scheduled tasks']);
    await expect(tab(window, 'Settings')).toHaveAttribute('aria-selected', 'true');
    await expect(window.locator('[data-island="main"] [data-page]')).toHaveAttribute('data-page', 'settings');
    await quit(app);

    await writeFile(join(folder, 'settings.json'), `${JSON.stringify({ version: 1, 'datardo.tab.restore': false })}\n`);
    ({ window } = await launch());
    // Nothing restored: Datardo starts on Home alone (home.show, D7).
    await expect.poll(() => titles(window)).toEqual(['Home']);
    await expect(window.locator('[data-feature="nav.path@scope-bar"]')).toHaveText('Home');
  });
});

test.describe('tab.strip', () => {
  test('the keyboard moves between the tabs without making them active, Enter makes one active; both themes pass', async () => {
    const { window } = await launch();
    await openPage(window, 'settings');
    await openPage(window, 'log');
    await tab(window, 'Settings').click();
    await tab(window, 'Settings').focus();
    await window.keyboard.press('ArrowRight');
    await expect(tab(window, 'Log')).toBeFocused();
    await expect(tab(window, 'Settings')).toHaveAttribute('aria-selected', 'true');
    await window.keyboard.press('Enter');
    await expect(tab(window, 'Log')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(window, 'Log')).toBeFocused();
    await expect(tab(window, 'Settings')).toHaveAttribute('title', 'Settings');
    for (const theme of ['light', 'dark']) {
      await window.evaluate((name) => {
        document.documentElement.dataset['theme'] = name;
      }, theme);
      await expectAccessible(window);
    }
  });

  test('Ctrl+W closes the active tab and the one active before it comes back; Ctrl+Shift+T reopens it', async () => {
    const { window } = await launch();
    await openPage(window, 'settings');
    await openPage(window, 'log');
    await openPage(window, 'tasks');
    await tab(window, 'Settings').click();
    await tab(window, 'Scheduled tasks').click();
    await window.keyboard.press('Control+w');
    await expect.poll(() => titles(window)).toEqual(['Home', 'Settings', 'Log']);
    await expect(tab(window, 'Settings')).toHaveAttribute('aria-selected', 'true');
    await window.keyboard.press('Control+Shift+T');
    await expect.poll(() => titles(window)).toEqual(['Home', 'Settings', 'Log', 'Scheduled tasks']);
    await expect(tab(window, 'Scheduled tasks')).toHaveAttribute('aria-selected', 'true');
    await window.keyboard.press('Control+Tab');
    await expect(tab(window, 'Home')).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('tab.menu', () => {
  test('a right click on a tab that is not active opens its menu; Close closes that tab and leaves the active one', async () => {
    const { window } = await launch();
    await openPage(window, 'settings');
    await openPage(window, 'log');
    await tab(window, 'Settings').click({ button: 'right' });
    const menu = window.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText([
      /^Close\s*Ctrl\+W$/u,
      'Close others',
      'Close all',
      /^Reopen closed tab/u,
    ]);
    await expectAccessible(window);
    await menu.getByRole('menuitem', { name: /^Close\s*Ctrl\+W$/u }).click();
    await expect.poll(() => titles(window)).toEqual(['Home', 'Log']);
    await expect(tab(window, 'Log')).toHaveAttribute('aria-selected', 'true');
  });
});
