/**
 * The Users and roles page driven through the window (M32): opened from Go to, a user created from **New user** with
 * **Generate** and **Copy**, the dialog opened again with what was typed when the server already has the name, a role
 * granted from the inspector and the user deleted with `Delete`; a custom role created, edited with `Enter` and
 * deleted; and the new password of the connection's own user saved in the connection, which signs in with it at the
 * next connect and writes it in no file in clear text. The MongoDB is this file's own, with access control enabled;
 * its users and roles are in its own databases and the server is stopped at the end. Each state is checked for
 * accessibility in both themes (QA15, QA16).
 */
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { startApp, type StartedApp } from '../app';
import { addMongo, bothThemes, firstConnection, startIntent } from '../query/collection-app';
import { clipboardText, closeAll, goTo } from '../table/parts-app';

const shop = 'user_ui_shop';
/** The password of this file's throwaway server, never that of anything else. */
const rootPassword = `root-${randomBytes(6).toString('hex')}`;
let server: MongoMemoryServer | undefined;
let currentRootPassword = rootPassword;
const running: StartedApp[] = [];

function addressAs(user: string, password: string): string {
  const url = new URL(server?.getUri() ?? '');
  url.username = user;
  url.password = password;
  url.searchParams.set('authSource', 'admin');
  return url.toString();
}

async function asRoot<T>(action: (client: MongoClient) => Promise<T>): Promise<T> {
  const client = new MongoClient(addressAs('root', currentRootPassword));
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.close();
  }
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  const binary = process.env['MONGOMS_SYSTEM_BINARY'];
  server = await MongoMemoryServer.create({
    ...(binary === undefined || binary === '' ? {} : { binary: { systemBinary: binary } }),
    auth: { enable: true, customRootName: 'root', customRootPwd: rootPassword },
  });
});

test.afterAll(async () => {
  await server?.stop();
});

test.beforeEach(async () => {
  await asRoot(async (client) => {
    const db = client.db(shop);
    await db.command({ dropAllUsersFromDatabase: 1 });
    await db.command({ dropAllRolesFromDatabase: 1 });
    await db.dropDatabase();
    await db.collection('orders').insertOne({ total: 1 });
  });
});

test.afterEach(async () => {
  await closeAll(running);
});

async function started(): Promise<StartedApp> {
  const app = await startApp();
  running.push(app);
  await expect(app.window.getByRole('navigation', { name: 'Rail' })).toBeVisible();
  await addMongo(app.window, addressAs('root', currentRootPassword));
  return app;
}

/** A notification, by its text. */
function notified(window: Page, text: string) {
  return window.locator('[data-level]', { hasText: text });
}

/** Opens the page from Go to, and chooses the shop database in it. */
async function openOnShop(window: Page, empty = true): Promise<void> {
  await goTo(window, 'Users and roles');
  await expect(window.getByRole('tab', { name: /Users and roles/u })).toHaveAttribute('aria-selected', 'true');
  await expect(window.getByText('Connected as root@admin')).toBeVisible();
  await window.getByLabel('Database', { exact: true }).selectOption(shop);
  if (empty) {
    await expect(window.getByText(`No users in ${shop}.`)).toBeVisible();
  }
}

function usersTable(window: Page) {
  return window.locator('[data-feature="user.inspect@table"]');
}

test.describe('user.create', () => {
  test('creates a user from New user with a generated password, and opens it again on a name already taken', async () => {
    test.setTimeout(150_000);
    const app = await started();
    const { window } = app;
    await openOnShop(window);
    await window.locator('[data-feature="user.create@toolbar"]').click();
    const dialog = window.getByRole('dialog', { name: 'New user' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Database', { exact: true })).toHaveValue(shop);
    await expect(dialog.getByLabel('Role', { exact: true })).toHaveValue('readWrite');
    await dialog.getByRole('button', { name: 'Create user' }).click();
    await expect(dialog.getByText('Enter the name of the user.')).toBeVisible();
    await expect(dialog.getByText('Enter a password, or generate one.')).toBeVisible();
    await dialog.getByLabel('Name', { exact: true }).fill('app');
    await dialog.locator('[data-feature="user.generate-password@dialog"]').click();
    const password = dialog.getByLabel('Password', { exact: true });
    await expect(password).toHaveAttribute('type', 'text');
    const generated = await password.inputValue();
    expect(generated).toHaveLength(24);
    await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect.poll(async () => clipboardText(app)).toBe(generated);
    await dialog.getByRole('button', { name: 'Hide' }).click();
    await expect(password).toHaveAttribute('type', 'password');
    await dialog.getByLabel('Custom data').fill('[1, 2]');
    await dialog.getByRole('button', { name: 'Create user' }).click();
    await expect(dialog.getByText('Custom data must be an object')).toBeVisible();
    await dialog.getByLabel('Custom data').fill('{ team: "billing" }');
    await bothThemes(window);
    await dialog.getByLabel('Custom data').press('Enter');
    await expect(dialog).toBeHidden();
    await expect(notified(window, `Created the user app@${shop} with readWrite@${shop}.`)).toBeVisible();
    await expect(usersTable(window).getByText('app', { exact: true })).toBeVisible();
    await expect(window.getByRole('tabpanel', { name: 'Users' }).getByText('1 user', { exact: true })).toBeVisible();

    // The same name again: the server refuses it, and the dialog opens again as it was, with the server's error.
    await window.locator('[data-feature="user.create@toolbar"]').click();
    await dialog.getByLabel('Name', { exact: true }).fill('app');
    await dialog.getByLabel('Password', { exact: true }).fill('another-password-1');
    await dialog.getByRole('button', { name: 'Create user' }).click();
    const again = window.getByRole('dialog', { name: 'New user' });
    await expect(again.getByRole('alert').filter({ hasText: 'already exists' })).toBeVisible();
    await expect(again.getByLabel('Name', { exact: true })).toHaveValue('app');
    await expect(again.getByLabel('Password', { exact: true })).toHaveValue('another-password-1');
    await expect(again.getByLabel('Role', { exact: true })).toHaveValue('readWrite');
    await again.getByRole('button', { name: 'Cancel' }).click();
    await expect(again).toBeHidden();
    const users = await asRoot(async (client) => client.db(shop).command({ usersInfo: 1 }));
    expect((users['users'] as readonly { user: string }[]).map((each) => each.user)).toEqual(['app']);
    expect(await textsOf(app.dataFolder)).not.toContain(generated);
  });
});

test.describe('user.inspect', () => {
  test('shows the selected user, grants a role with Enter, revokes it with ✕, and deletes the user with Delete', async () => {
    test.setTimeout(150_000);
    await asRoot(async (client) =>
      client.db(shop).command({ createUser: 'app', pwd: 'app-password-1', roles: ['readWrite'] }),
    );
    const { window } = await started();
    await openOnShop(window, false);
    await usersTable(window).getByText('app', { exact: true }).click();
    const inspector = window.locator('[data-feature="user.inspect@inspector"]');
    await expect(inspector.getByRole('heading', { name: `app@${shop}` })).toBeVisible();
    await expect(inspector.getByText(`readWrite@${shop}`)).toBeVisible();
    const grant = inspector.getByLabel('Grant', { exact: true });
    await grant.fill('clusterMonitor');
    await expect(inspector.getByLabel('Database of the role to grant')).toHaveValue('admin');
    await bothThemes(window);
    await grant.press('Enter');
    await expect(notified(window, `Granted clusterMonitor@admin to app@${shop}.`)).toBeVisible();
    await expect(inspector.getByText('clusterMonitor@admin')).toBeVisible();
    await inspector.getByRole('button', { name: 'Revoke clusterMonitor@admin' }).click();
    const revoke = window.getByRole('dialog', { name: `Revoke clusterMonitor@admin from app@${shop}` });
    await expect(revoke).toBeVisible();
    await revoke.getByRole('button', { name: 'Revoke' }).click();
    await expect(inspector.getByText('clusterMonitor@admin')).toBeHidden();

    await usersTable(window).getByText('app', { exact: true }).click();
    await window.keyboard.press('Delete');
    const confirm = window.getByRole('dialog', { name: `Delete the user app@${shop}` });
    await expect(confirm).toContainText("Applications that use it can no longer sign in. This can't be undone.");
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(window.getByText(`No users in ${shop}.`)).toBeVisible();
  });
});

test.describe('user.edit-role', () => {
  test('creates a role, edits it with Enter with its name fixed, and deletes it with Delete', async () => {
    test.setTimeout(150_000);
    const { window } = await started();
    await openOnShop(window);
    const sections = window.getByRole('tablist', { name: 'Sections of Users and roles' });
    await sections.getByRole('tab', { name: 'Users' }).focus();
    await window.keyboard.press('ArrowRight');
    await expect(sections.getByRole('tab', { name: 'Roles' })).toHaveAttribute('aria-selected', 'true');
    await window.locator('[data-feature="user.create-role@toolbar"]').click();
    const dialog = window.getByRole('dialog', { name: 'New role' });
    await dialog.getByLabel('Name', { exact: true }).fill('reader');
    await dialog.locator('[data-field="privileges"] [contenteditable="true"]').click();
    await window.keyboard.insertText('[{ resource: { db: "user_ui_shop", collection: "orders" }, actions: ["find"] }]');
    await dialog.getByRole('button', { name: '+ Role' }).click();
    await dialog.getByLabel('Role', { exact: true }).fill('read');
    await bothThemes(window);
    await dialog.getByRole('button', { name: 'Create role' }).click();
    await expect(notified(window, `Created the role reader@${shop}.`)).toBeVisible();
    const table = window.locator('[data-feature="user.inspect@table"]');
    await expect(table.getByText(`${shop}.orders: find`)).toBeVisible();

    await table.getByText('reader', { exact: true }).click();
    await window.keyboard.press('Enter');
    const edit = window.getByRole('dialog', { name: `Edit reader@${shop}` });
    await expect(edit.getByLabel('Name', { exact: true })).toHaveAttribute('readonly', '');
    await expect(edit.getByLabel('Role', { exact: true })).toHaveValue('read');
    await edit.getByRole('button', { name: 'Save role' }).click();
    await expect(notified(window, `Updated the role reader@${shop}.`)).toBeVisible();

    await table.getByText('reader', { exact: true }).click();
    await window.keyboard.press('Delete');
    const confirm = window.getByRole('dialog', { name: `Delete the role reader@${shop}` });
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(table).toBeHidden();
  });
});

/** The state of a connection, as the window knows it. */
async function liveState(window: Page, connection: string): Promise<string | undefined> {
  return window.evaluate(async (id) => {
    const bridge = (
      globalThis as unknown as {
        datardo: { state: () => Promise<{ connections: { live: Record<string, { state: string } | undefined> } }> };
      }
    ).datardo;
    return (await bridge.state()).connections.live[id]?.state;
  }, connection);
}

/** Every file Datardo wrote in its data folder, read as text; the files of Chromium's own profile are not its. */
async function textsOf(folder: string): Promise<string> {
  const texts: string[] = [];
  for (const name of await readdir(folder, { recursive: true })) {
    const path = join(folder, name);
    if (name.split(/[\\/]/u)[0] === 'chromium') {
      continue;
    }
    if ((await stat(path)).isFile()) {
      texts.push(await readFile(path, 'latin1'));
    }
  }
  return texts.join('\n');
}

test.describe('user.change-password', () => {
  test("saves the new password of the connection's own user in the connection, which signs in with it next", async () => {
    test.setTimeout(150_000);
    const app = await started();
    const { window } = app;
    await goTo(window, 'Users and roles');
    await window.getByLabel('Database', { exact: true }).selectOption('admin');
    const table = window.locator('[data-feature="user.inspect@table"]');
    await table.getByText('root', { exact: true }).click({ button: 'right' });
    await window.getByRole('menuitem', { name: 'Password…' }).click();
    const dialog = window.getByRole('dialog', { name: 'New password for root@admin' });
    await expect(dialog).toContainText('This connection signs in as this user');
    const next = `Next-${randomBytes(6).toString('hex')}`;
    await dialog.getByLabel('Password', { exact: true }).fill(next);
    await dialog.getByRole('button', { name: 'Change password' }).click();
    currentRootPassword = next;
    const note = notified(window, 'Changed the password of root@admin.');
    await expect(note).toBeVisible();
    await note.getByRole('button', { name: 'Save in the connection' }).click();
    await expect(notified(window, 'Saved the new password in the connection Local.')).toBeVisible();
    const connection = await firstConnection(window);
    await startIntent(window, 'connection.disconnect', null, { kind: 'connection', connection });
    await expect.poll(async () => liveState(window, connection)).not.toBe('connected');
    // The server knows only the new password now: connecting again signs in with what the connection saved.
    await startIntent(window, 'connection.connect', null, { kind: 'connection', connection });
    await expect.poll(async () => liveState(window, connection), { timeout: 20_000 }).toBe('connected');
    await window.getByRole('toolbar', { name: 'Users and roles' }).getByRole('button', { name: 'Refresh' }).click();
    await expect(
      window.locator('[data-feature="user.inspect@table"]').getByText('root', { exact: true }),
    ).toBeVisible();
    expect(await textsOf(app.dataFolder)).not.toContain(next);
  });
});
