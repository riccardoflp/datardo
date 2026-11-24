/**
 * Connections organized and shared, driven through the window (M7): the menu of a connection on Home (`connection.set-
 * color`, `connection.move-to-folder`, `connection.duplicate`, `connection.copy-string`), the menu of a folder
 * (`connection.folder-menu`, `connection.rename-folder`, `connection.remove-folder`), and the files of connections
 * (`connection.export`, `connection.import`) with the system's dialogs answered by the test in the main process. No
 * connection is connected: none needs a server. The password is made here and only compared.
 */
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expectAccessible, startApp, type StartedApp } from '../app';

const password = randomBytes(12).toString('hex');
let started: StartedApp | undefined;
let files: string;

test.beforeEach(async () => {
  files = await mkdtemp(join(tmpdir(), 'datardo-ui-files-'));
});

test.afterEach(async () => {
  await started?.close();
  started = undefined;
  await rm(files, { recursive: true, force: true });
});

/** Saves a Redis connection named Cache, with a password, without connecting it. */
async function addCache(window: Page): Promise<void> {
  await window.evaluate(async () => {
    const bridge = (globalThis as unknown as { datardo: { start: (intent: unknown) => Promise<unknown> } }).datardo;
    await bridge.start({ feature: 'connection.add', target: { kind: 'app' }, args: 'redis' });
  });
  const form = window.getByRole('form', { name: 'New connection' });
  await form.locator('[data-field="name"]').fill('Cache');
  await form.locator('[data-field="host"]').fill('127.0.0.1');
  await form.locator('[data-field="port"]').fill('6390');
  await form.locator('[data-field="password"]').fill(password);
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toBeHidden();
}

/** Home, where the cards are, once the form is closed. */
async function home(window: Page): Promise<void> {
  await expect(window.locator('[data-feature="home.card@home"]').first()).toBeVisible();
}

async function cardMenu(window: Page, name: string, entry: string): Promise<void> {
  await window.locator(`[data-feature="connection.menu@home"][aria-label="Menu of ${name}"]`).click();
  await window
    .getByRole('menu', { name: `Menu of ${name}`, exact: true })
    .getByRole('menuitem', { name: entry })
    .click();
}

async function folderMenu(window: Page, folder: string, entry: string): Promise<void> {
  await window.locator('[data-feature="connection.folder-menu@home"]').click();
  await window
    .getByRole('menu', { name: `Menu of the folder ${folder}` })
    .getByRole('menuitem', { name: entry })
    .click();
}

/** The answers of the system's dialogs, given in the main process before the feature opens them. */
async function answerDialogs(
  app: ElectronApplication,
  open: string | undefined,
  save: string | undefined,
): Promise<void> {
  await app.evaluate(
    ({ dialog }, paths) => {
      const chosen = dialog as unknown as Record<string, unknown>;
      chosen['showOpenDialog'] = () => Promise.resolve({ canceled: paths.open === undefined, filePaths: [paths.open] });
      chosen['showSaveDialog'] = () => Promise.resolve({ canceled: paths.save === undefined, filePath: paths.save });
    },
    { open, save },
  );
}

async function events(window: Page): Promise<string> {
  return window.evaluate(async () => {
    const bridge = (globalThis as unknown as { datardo: { state: () => Promise<unknown> } }).datardo;
    return JSON.stringify(await bridge.state());
  });
}

test('colors, folders, a copy and the connection string from the menus of Home', async () => {
  test.setTimeout(90_000);
  started = await startApp();
  const { window, app } = started;
  await addCache(window);
  await home(window);

  await cardMenu(window, 'Cache', 'Set color…');
  const colors = window.getByRole('dialog', { name: 'Color of Cache' });
  await expectAccessible(window);
  await colors.getByRole('radio', { name: 'Red' }).check();
  await colors.getByRole('button', { name: 'Choose' }).click();
  await expect(window.locator('[data-card][data-color="red"]')).toHaveCount(1);

  await cardMenu(window, 'Cache', 'Move to folder…');
  await window.getByRole('dialog').getByRole('radio', { name: 'New folder…' }).check();
  await window.getByRole('dialog').getByRole('button', { name: 'Move' }).click();
  await window.getByRole('dialog', { name: 'New folder' }).getByRole('textbox').fill('Work');
  await window.getByRole('dialog', { name: 'New folder' }).getByRole('button', { name: 'Move' }).click();
  await expect(window.locator('[data-feature="home.connections@home"]')).toHaveText(['Work 1']);

  await cardMenu(window, 'Cache', 'Duplicate');
  await expect(window.locator('[data-card]')).toHaveCount(2);
  await expect(window.getByText('Connection Cache (2) added', { exact: true })).toBeVisible();

  await folderMenu(window, 'Work', 'Rename folder…');
  await window.getByRole('dialog', { name: 'Rename folder Work' }).getByRole('textbox').fill(' Office ');
  await window.getByRole('dialog', { name: 'Rename folder Work' }).getByRole('button', { name: 'Rename' }).click();
  await expect(window.locator('[data-feature="home.connections@home"]')).toHaveText(['Office 2']);

  await folderMenu(window, 'Office', 'Remove folder (keep connections)');
  await expect(window.locator('[data-feature="home.connections@home"]')).toHaveCount(0);
  await expect(window.locator('[data-card]')).toHaveCount(2);

  await cardMenu(window, 'Cache', 'Copy connection string');
  await expect(
    window.getByText('Connection string copied (it may contain the password)', { exact: true }),
  ).toBeVisible();
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(copied === `redis://:${password}@127.0.0.1:6390`).toBe(true);
  expect((await events(window)).includes(password)).toBe(false);
});

test('connection.custom-color: Choose a color gives a custom color, a swatch a preset, Cancel and Esc nothing', async () => {
  test.setTimeout(90_000);
  started = await startApp();
  const { window } = started;
  await addCache(window);
  await home(window);
  const chooseCustom = async (): Promise<ReturnType<Page['getByRole']>> => {
    await cardMenu(window, 'Cache', 'Set color…');
    const list = window.getByRole('dialog', { name: 'Color of Cache' });
    await list.getByRole('radio', { name: /^Custom color…/u }).check();
    await list.getByRole('button', { name: 'Choose' }).click();
    return window.getByRole('dialog', { name: 'Choose a color' });
  };

  let dialog = await chooseCustom();
  await expect(dialog.getByText('Color of Cache')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'true');
  for (const scheme of ['dark', 'light'] as const) {
    await window.emulateMedia({ colorScheme: scheme });
    await expectAccessible(window);
  }
  const field = dialog.getByRole('textbox', { name: 'Color', exact: true });
  await field.fill('#12345');
  await expect(dialog.getByText('Enter a color as #rrggbb')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await field.fill('#1E90FF');
  await expect(dialog.getByRole('radio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'false');
  await expect(dialog.getByLabel('Color picker')).toHaveValue('#1e90ff');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
  const card = window.locator('[data-card][data-color="custom"]');
  await expect(card).toHaveCount(1);
  expect(
    await card.evaluate((element) => getComputedStyle(element).getPropertyValue('--connection-color').trim()),
  ).toBe('#1e90ff');

  dialog = await chooseCustom();
  await expect(dialog.getByRole('textbox', { name: 'Color', exact: true })).toHaveValue('#1e90ff');
  await dialog.getByRole('textbox', { name: 'Color', exact: true }).fill('#abc');
  await window.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(card).toHaveCount(1);

  dialog = await chooseCustom();
  await dialog.getByRole('radio', { name: 'Teal' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Color', exact: true })).toHaveValue('teal');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toHaveCount(1);

  dialog = await chooseCustom();
  await dialog.getByRole('radio', { name: 'Teal' }).click();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  const teal = window.locator('[data-card][data-color="teal"]');
  await expect(teal).toHaveCount(1);
  for (const [scheme, value] of [
    ['dark', '#4fd1c5'],
    ['light', '#00706a'],
  ] as const) {
    await window.emulateMedia({ colorScheme: scheme });
    expect(
      await teal.evaluate((element) => getComputedStyle(element).getPropertyValue('--connection-color').trim()),
    ).toBe(value);
  }
});

test('connection.form: Custom color… of Color opens Choose a color, and Save saves the color applied', async () => {
  test.setTimeout(90_000);
  started = await startApp();
  const { window } = started;
  await window.evaluate(async () => {
    const bridge = (globalThis as unknown as { datardo: { start: (intent: unknown) => Promise<unknown> } }).datardo;
    await bridge.start({ feature: 'connection.add', target: { kind: 'app' }, args: 'redis' });
  });
  const form = window.getByRole('form', { name: 'New connection' });
  await form.locator('[data-field="name"]').fill('Cache');
  const color = form.locator('[data-field="color"]');
  await color.selectOption('teal');
  await color.selectOption('custom');
  const dialog = window.getByRole('dialog', { name: 'Choose a color' });
  await expect(dialog.getByText('Color of Cache')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(color).toHaveValue('teal');
  await color.selectOption('custom');
  await dialog.getByRole('textbox', { name: 'Color', exact: true }).fill('#1e90ff');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(color).toHaveValue('#1e90ff');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(window.locator('[data-card][data-color="custom"]')).toHaveCount(1);
});

test('exports without passwords and imports a Mongoster file with a Redis address', async () => {
  test.setTimeout(90_000);
  started = await startApp();
  const { window, app } = started;
  await addCache(window);
  await home(window);

  const exported = join(files, 'datardo-connections.json');
  await answerDialogs(app, undefined, exported);
  await window.getByRole('button', { name: 'More' }).click();
  await window.getByRole('menuitem', { name: 'Export connections…' }).click();
  await window.getByRole('dialog').getByRole('button', { name: 'Next' }).click();
  await window.getByRole('dialog').getByRole('button', { name: 'Next' }).click();
  await window.getByRole('dialog').getByRole('button', { name: 'Next' }).click();
  await expect(window.getByText('1 connection exported to datardo-connections.json.', { exact: true })).toBeVisible();
  const text = await readFile(exported, 'utf8');
  expect(JSON.parse(text)).toMatchObject({ type: 'Datardo Connections', secrets: 'removed' });
  expect(text.includes(password)).toBe(false);

  const mongoster = join(files, 'mongoster.json');
  await writeFile(
    mongoster,
    JSON.stringify({
      type: 'Mongoster Connections',
      version: 1,
      secrets: 'removed',
      connections: [
        {
          name: 'Shop',
          uri: 'mongodb://db1:27017/shop',
          folder: 'Clients',
          redisOplog: { url: 'redis://127.0.0.1:6390' },
        },
        {
          name: 'Orders',
          uri: 'mongodb://db2:27017/orders',
          folder: 'Clients',
          redisOplog: { url: 'redis://cache9:6379' },
        },
      ],
    }),
  );
  await answerDialogs(app, mongoster, undefined);
  await window.getByRole('button', { name: 'More' }).click();
  await window.getByRole('menuitem', { name: 'Import connections…' }).click();
  await window.getByRole('dialog').getByRole('button', { name: 'Import' }).click();
  const choose = window.getByRole('dialog', { name: 'Import connections from mongoster.json' });
  await expect(choose.getByRole('checkbox')).toHaveCount(2);
  await choose.getByRole('button', { name: 'Import' }).click();
  await window.getByRole('dialog').getByRole('radio', { name: 'Folders from the file' }).check();
  await window.getByRole('dialog').getByRole('button', { name: 'Import' }).click();
  await expect(
    window.getByText('3 connections imported, 0 connections replaced, 0 skipped.', { exact: true }),
  ).toBeVisible();
  await expect(window.locator('[data-card]')).toHaveCount(4);
  const state = JSON.parse(await events(window)) as {
    connections: { saved: { id: string; name: string; publishesTo?: string }[] };
  };
  const byName = new Map(state.connections.saved.map((each) => [each.name, each]));
  expect(byName.get('Shop')?.publishesTo).toBe(byName.get('Cache')?.id);
  expect(byName.get('Orders')?.publishesTo).toBe(byName.get('cache9:6379')?.id);
});
