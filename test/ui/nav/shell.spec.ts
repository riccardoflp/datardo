/**
 * The shell of islands with no connection saved: `nav.empty`, `nav.rail`, `nav.layout`, `nav.focus-island`,
 * `nav.toggle-explorer`, `nav.resize`, `nav.scope-bar` and `nav.status-line`, driven through the window.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectAccessible, startApp, type StartedApp } from '../app';

let started: StartedApp;
let window: Page;

test.beforeEach(async () => {
  started = await startApp();
  window = started.window;
  await expect(window.getByRole('navigation', { name: 'Rail' })).toBeVisible();
});

test.afterEach(async () => {
  await started.close();
});

/** The island that holds the focus, as its `data-island` names it. */
async function focusedIsland(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () => document.activeElement?.closest<HTMLElement>('[data-island]')?.dataset['island'] ?? undefined,
  );
}

function explorerGap(page: Page): Locator {
  return page.getByRole('separator', { name: 'Resize explorer' });
}

async function explorerWidth(page: Page): Promise<number> {
  return Number(await explorerGap(page).getAttribute('aria-valuenow'));
}

test.describe('nav.empty', () => {
  test('the first start shows how to add a connection, in both themes', async () => {
    const connection = window.locator('[data-island="connection"]');
    await expect(connection).toContainText('No connections yet');
    await expect(connection.getByRole('button', { name: 'Add connection' })).toBeVisible();
    await expect(window.locator('[data-island="tree"]')).toContainText('Your databases and keys will be listed here.');
    await expect(window.getByRole('contentinfo', { name: 'Status line' })).toContainText('No connection');
    await expect(window.locator('[data-feature="nav.path@scope-bar"]')).toHaveText('Home');
    for (const theme of ['light', 'dark']) {
      await window.evaluate((name) => {
        document.documentElement.dataset['theme'] = name;
      }, theme);
      await expectAccessible(window);
    }
  });
});

test.describe('nav.rail', () => {
  test('six entries, Search waits for a connection, and Up and Down move between them', async () => {
    const rail = window.getByRole('navigation', { name: 'Rail' });
    await expect(rail.getByRole('button')).toHaveCount(6);
    await expect(rail.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-disabled', 'true');
    await expect(rail.getByRole('button', { name: 'Explorer' })).toHaveAttribute('aria-pressed', 'true');
    await rail.getByRole('button', { name: 'Home' }).focus();
    await window.keyboard.press('ArrowDown');
    await expect(rail.getByRole('button', { name: 'Explorer' })).toBeFocused();
    await window.keyboard.press('ArrowUp');
    await expect(rail.getByRole('button', { name: 'Home' })).toBeFocused();
  });
});

test.describe('nav.focus-island', () => {
  test('F6 goes round the islands shown, Shift+F6 goes back, with the keyboard only', async () => {
    await window.getByRole('navigation', { name: 'Rail' }).getByRole('button', { name: 'Home' }).focus();
    const visited: (string | undefined)[] = [];
    for (let step = 0; step < 5; step += 1) {
      await window.keyboard.press('F6');
      visited.push(await focusedIsland(window));
    }
    expect(visited).toEqual(['connection', 'tree', 'main', 'status', 'rail']);
    await window.keyboard.press('Shift+F6');
    expect(await focusedIsland(window)).toBe('status');
  });

  test('with the explorer hidden, F6 skips it', async () => {
    await window.getByRole('navigation', { name: 'Rail' }).getByRole('button', { name: 'Home' }).focus();
    await window.keyboard.press('Control+B');
    await expect(explorerGap(window)).toHaveCount(0);
    const visited: (string | undefined)[] = [];
    for (let step = 0; step < 3; step += 1) {
      await window.keyboard.press('F6');
      visited.push(await focusedIsland(window));
    }
    expect(visited).toEqual(['main', 'status', 'rail']);
  });
});

test.describe('nav.toggle-explorer', () => {
  test('Ctrl+B hides the explorer and shows it again at the same width', async () => {
    const explorer = window.getByRole('group', { name: 'Explorer' });
    await expect(explorer).toBeVisible();
    const before = await explorerWidth(window);
    await window.keyboard.press('Control+B');
    await expect(explorer).toHaveCount(0);
    await expect(window.getByRole('button', { name: 'Explorer' })).toHaveAttribute('aria-pressed', 'false');
    await window.keyboard.press('Control+B');
    await expect(explorer).toBeVisible();
    expect(await explorerWidth(window)).toBe(before);
  });
});

test.describe('nav.resize', () => {
  test('a drag, the arrow keys and a double click set the width of the explorer', async () => {
    const gap = explorerGap(window);
    await expect(gap).toHaveAttribute('aria-valuenow', '280');
    const box = await gap.boundingBox();
    if (box === null) {
      throw new Error('The gap of the explorer is not shown.');
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await window.mouse.move(x, y);
    await window.mouse.down();
    await window.mouse.move(x + 20, y);
    await window.mouse.move(x + 40, y);
    await window.mouse.up();
    await expect(gap).toHaveAttribute('aria-valuenow', '320');
    await gap.focus();
    await window.keyboard.press('ArrowRight');
    await expect(gap).toHaveAttribute('aria-valuenow', '336');
    await window.keyboard.press('ArrowRight');
    await expect(gap).toHaveAttribute('aria-valuenow', '352');
    await gap.dblclick();
    await expect(gap).toHaveAttribute('aria-valuenow', '280');
  });

  test('a drag far under the minimum hides the explorer', async () => {
    const gap = explorerGap(window);
    const box = await gap.boundingBox();
    if (box === null) {
      throw new Error('The gap of the explorer is not shown.');
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await window.mouse.move(x, y);
    await window.mouse.down();
    await window.mouse.move(x - 75, y);
    await window.mouse.move(x - 150, y);
    await window.mouse.up();
    await expect(window.getByRole('group', { name: 'Explorer' })).toHaveCount(0);
    await window.keyboard.press('Control+B');
    await expect(gap).toHaveAttribute('aria-valuenow', '200');
  });
});

test.describe('nav.layout', () => {
  test('a narrow window leaves the explorer out and keeps the main island', async () => {
    await window.setViewportSize({ width: 640, height: 900 });
    await expect(window.getByRole('group', { name: 'Explorer' })).toHaveCount(0);
    await expect(window.getByRole('region', { name: 'Main' })).toBeVisible();
    await window.setViewportSize({ width: 1440, height: 900 });
    await expect(window.getByRole('group', { name: 'Explorer' })).toBeVisible();
  });
});

test.describe('nav.scope-bar', () => {
  test('Back and Forward are disabled on the first page', async () => {
    const bar = window.getByRole('toolbar', { name: 'Scope bar' });
    await expect(bar.getByRole('button', { name: 'Back' })).toHaveAttribute('aria-disabled', 'true');
    await expect(bar.getByRole('button', { name: 'Forward' })).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('nav.status-line', () => {
  test('no connection and no zoom at 100 %', async () => {
    const line = window.getByRole('contentinfo', { name: 'Status line' });
    await expect(line).toContainText('No connection');
    await expect(line.locator('[data-feature="window.zoom@status-line"]')).toHaveCount(0);
  });
});
