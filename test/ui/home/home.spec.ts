/**
 * Home driven through the window (`home.show`, `home.filter`, `home.connections`, `home.card`, `home.card-menu`,
 * `home.jump-back-in`), with the keyboard and the accessibility check in both themes, and the start of QA14 (200 saved
 * connections and 20 tabs to restore). The saved connections and the recent places are written in the data folder
 * before Datardo starts. Each test closes its Datardo even when it fails.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expectAccessible, firstWindow } from '../app';

let folder: string;
const running: ElectronApplication[] = [];

test.beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-ui-home-'));
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

interface Saved {
  readonly id: string;
  readonly name: string;
  readonly engine: 'mongodb' | 'redis';
  readonly hosts: string;
  readonly folder?: string;
  readonly color?: string;
  readonly readOnly?: boolean;
}

const connections: readonly Saved[] = [
  { id: 'local', name: 'Local', engine: 'mongodb', hosts: '127.0.0.1:1' },
  { id: 'cache-local', name: 'Cache local', engine: 'redis', hosts: '127.0.0.1:2' },
  { id: 'staging', name: 'Staging', engine: 'mongodb', hosts: 'staging.example.com:27017', folder: 'Dev' },
  {
    id: 'production',
    name: 'Production',
    engine: 'mongodb',
    hosts: 'db1.example.com:27017',
    folder: 'Live',
    color: 'red',
    readOnly: true,
  },
];

async function writeData(saved: readonly Saved[], more: Readonly<Record<string, unknown>> = {}): Promise<void> {
  const list = saved.map((each) => ({ readOnly: false, keepsUndo: true, ...each }));
  await writeFile(join(folder, 'connections.json'), `${JSON.stringify({ version: 1, connections: list })}\n`);
  for (const [file, content] of Object.entries(more)) {
    await writeFile(join(folder, file), `${JSON.stringify(content)}\n`);
  }
}

async function launch(): Promise<Page> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, DATARDO_DATA: folder, DATARDO_TEST: '1' } });
  running.push(app);
  const window = await firstWindow(app);
  await window.setViewportSize({ width: 1440, height: 900 });
  await expect(window.getByRole('navigation', { name: 'Rail' })).toBeVisible();
  return window;
}

async function bothThemes(window: Page): Promise<void> {
  for (const theme of ['light', 'dark']) {
    await window.evaluate((name) => {
      document.documentElement.dataset['theme'] = name;
    }, theme);
    await expectAccessible(window);
  }
}

function cards(window: Page): ReturnType<Page['locator']> {
  return window.locator('[data-feature="home.card@home"]');
}

test.describe('home.show', () => {
  test('the first start shows the welcome, Add connection and Import connections…, and no filter; both themes pass', async () => {
    const window = await launch();
    await expect(window.locator('[data-page="home"]')).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Welcome to Datardo' })).toBeVisible();
    await expect(window.getByText('A client for MongoDB and Redis. Add a connection to begin.')).toBeVisible();
    await expect(window.locator('[data-feature="connection.add@home"]')).toHaveText('Add connection');
    await expect(window.locator('[data-feature="connection.import@home"]')).toHaveText('Import connections…');
    await expect(window.getByRole('searchbox', { name: 'Filter connections' })).toHaveCount(0);
    await bothThemes(window);
  });

  test('with saved connections, the filter row, Jump back in and the cards by folder; both themes pass', async () => {
    await writeData(connections, {
      'home.json': {
        version: 1,
        places: [{ shows: { kind: 'collection', connection: 'local', database: 'shop', collection: 'orders' }, at: 1 }],
        engine: 'all',
        collapsed: [],
      },
    });
    const window = await launch();
    await expect(window.getByRole('heading', { name: 'Jump back in' })).toBeVisible();
    await expect(window.locator('[data-feature="home.jump-back-in@home"]')).toContainText('shop / orders');
    await expect(cards(window)).toHaveCount(4);
    await expect(window.locator('[data-feature="home.connections@home"]')).toHaveText(['Dev 1', 'Live 1']);
    await bothThemes(window);
  });
});

test.describe('home.filter', () => {
  test('typing in the page types in the filter; Esc empties it; Redis is remembered across starts', async () => {
    await writeData(connections);
    let window = await launch();
    await cards(window).first().focus();
    await window.keyboard.type('live');
    const filter = window.getByRole('searchbox', { name: 'Filter connections' });
    await expect(filter).toHaveValue('live');
    await expect(cards(window)).toHaveCount(1);
    await window.keyboard.press('Escape');
    await expect(filter).toHaveValue('');
    await expect(cards(window)).toHaveCount(4);
    await window.getByRole('radio', { name: /^Redis/u }).click();
    await expect(cards(window)).toHaveCount(1);
    for (const app of running.splice(0)) {
      await app.close();
    }
    window = await launch();
    await expect(window.getByRole('radio', { name: /^Redis/u })).toHaveAttribute('aria-checked', 'true');
    await expect(window.getByRole('searchbox', { name: 'Filter connections' })).toHaveValue('');
  });
});

test.describe('home.connections', () => {
  test('Right on the last card of a group moves to the first card of the next; a click on Live collapses it', async () => {
    await writeData(connections);
    const window = await launch();
    await cards(window).nth(1).focus();
    await window.keyboard.press('ArrowRight');
    await expect(cards(window).nth(2)).toBeFocused();
    await expect(cards(window).nth(2)).toHaveAttribute('aria-label', /^Staging/u);
    await window.getByRole('button', { name: 'Live 1' }).click();
    await expect(cards(window)).toHaveCount(3);
    await expect(window.getByRole('button', { name: 'Live 1' })).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('home.card-menu', () => {
  test('Shift+F10 on a card opens the menu of the connection; Esc closes it and the focus is back on the card', async () => {
    await writeData(connections);
    const window = await launch();
    const local = cards(window).first();
    await local.focus();
    await window.keyboard.press('Shift+F10');
    const menu = window.getByRole('menu');
    await expect(menu.getByRole('menuitem').first()).toHaveText('Connect');
    await expect(menu.getByRole('menuitem', { name: 'Go to' })).toHaveCount(0);
    await bothThemes(window);
    await window.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(local).toBeFocused();
  });
});

test.describe('QA14', () => {
  test('with 200 saved connections and 20 tabs to restore, the last tab is usable in under 2 seconds', async () => {
    const many: Saved[] = Array.from({ length: 200 }, (_, index) => ({
      id: `c${String(index)}`,
      name: `Connection ${String(index)}`,
      engine: index % 3 === 0 ? 'redis' : 'mongodb',
      hosts: `host${String(index)}.example.com:27017`,
      ...(index % 4 === 0 ? {} : { folder: `Folder ${String(index % 10)}` }),
    }));
    const tabs = Array.from({ length: 20 }, (_, index) => ({
      shows: {
        kind: 'collection',
        connection: `c${String(index * 2 + 1)}`,
        database: 'shop',
        collection: `c${String(index)}`,
      },
    }));
    await writeData(many, { 'session.json': { version: 1, tabs, active: 19, collapsed: [] } });
    const started = Date.now();
    const window = await launch();
    await window.keyboard.press('Control+k');
    await expect(window.getByRole('combobox', { name: 'Go to' })).toBeFocused();
    const elapsed = Date.now() - started;
    await expect(window.locator('[data-feature="tab.strip@tab-strip"]').getByRole('tab')).toHaveCount(20);
    expect(elapsed).toBeLessThan(2000);
  });

  test('with 200 saved connections and nothing to restore, Home is usable and shows every card', async () => {
    const many: Saved[] = Array.from({ length: 200 }, (_, index) => ({
      id: `c${String(index)}`,
      name: `Connection ${String(index)}`,
      engine: 'mongodb',
      hosts: `host${String(index)}.example.com:27017`,
    }));
    await writeData(many);
    const window = await launch();
    await expect(cards(window)).toHaveCount(200);
    await window.getByRole('searchbox', { name: 'Filter connections' }).fill('Connection 199');
    await expect(cards(window)).toHaveCount(1);
  });
});
