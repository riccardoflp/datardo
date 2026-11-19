/**
 * The undo history driven through the window (`undo.show`, `undo.details`, `undo.revert`, `undo.notification`,
 * `undo.last`, `undo.per-connection`, `undo.record`): a plan of test steps that updates three documents of a real
 * MongoDB server is recorded, undone from its notification and from the page, and the documents are as they were
 * (M11's exit criterion); the page is used from the keyboard and checked for accessibility in both themes; a damaged
 * `undo/index.json` is set aside and no operation file is deleted (QA17).
 */
import { expect, test, type Page } from '@playwright/test';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accessible, launch, notice, type Started } from '../runner/launch';

let mongo: MongoMemoryServer | undefined;
let started: Started | undefined;

const originals = [1, 2, 3].map((n) => ({ _id: `o${String(n)}`, status: 'new', n }));

async function orders(): Promise<unknown[]> {
  const client = new MongoClient(mongo?.getUri() ?? '');
  await client.connect();
  try {
    return await client
      .db('shop')
      .collection('orders')
      .find({}, { sort: { _id: 1 } })
      .toArray();
  } finally {
    await client.close();
  }
}

async function resetOrders(): Promise<void> {
  const client = new MongoClient(mongo?.getUri() ?? '');
  await client.connect();
  try {
    const collection = client.db('shop').collection<{ _id: string }>('orders');
    await collection.deleteMany({});
    await collection.insertMany(originals);
  } finally {
    await client.close();
  }
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  const binary = process.env['MONGOMS_SYSTEM_BINARY'];
  mongo = await MongoMemoryServer.create(
    binary === undefined || binary === '' ? {} : { binary: { systemBinary: binary } },
  );
});

test.afterAll(async () => {
  await mongo?.stop();
});

test.beforeEach(async () => {
  await resetOrders();
});

test.afterEach(async () => {
  await started?.close();
  started = undefined;
});

async function addMongo(window: Page): Promise<string> {
  await window.evaluate(async () => {
    const bridge = (globalThis as unknown as { datardo: { start: (intent: unknown) => Promise<unknown> } }).datardo;
    void bridge.start({ feature: 'connection.add', target: { kind: 'app' }, args: 'mongodb' });
    await Promise.resolve();
  });
  const form = window.getByRole('form', { name: 'New connection' });
  await form.locator('[data-field="name"]').fill('Local');
  await form.locator('[data-field="connection-string"]').fill(mongo?.getUri() ?? '');
  await form.getByRole('button', { name: 'Save and connect' }).click();
  await expect(form).toBeHidden();
  const connected = async (): Promise<string> =>
    window.evaluate(async () => {
      type Connections = { saved: { id: string }[]; live: Record<string, { state: string } | undefined> };
      const bridge = (globalThis as unknown as { datardo: { state: () => Promise<{ connections: Connections }> } })
        .datardo;
      const { connections } = await bridge.state();
      const id = connections.saved[0]?.id ?? '';
      return connections.live[id]?.state === 'connected' ? id : '';
    });
  await expect.poll(connected, { timeout: 30_000 }).not.toBe('');
  return connected();
}

/** Starts the test plan that sets `status` on the three orders, as a control would. */
async function updateOrders(window: Page, connection: string, status: string): Promise<void> {
  await window.evaluate(
    ({ id, value }) => {
      const bridge = (globalThis as unknown as { datardo: { start: (intent: unknown) => Promise<unknown> } }).datardo;
      void bridge.start({
        feature: 'test.update-documents',
        target: { kind: 'app' },
        args: {
          connection: id,
          database: 'shop',
          collection: 'orders',
          ids: ['o1', 'o2', 'o3'],
          set: { status: value },
        },
      });
    },
    { id: connection, value: status },
  );
  const confirmation = window.getByRole('dialog', { name: 'Update 3 documents' });
  await expect(confirmation.getByText('It can be undone from the Undo history.')).toBeVisible();
  await confirmation.getByRole('button', { name: 'Continue' }).click();
  await expect(confirmation).toBeHidden();
}

async function confirmUndo(window: Page): Promise<void> {
  const confirmation = window.getByRole('dialog', { name: 'Undo: Update 3 documents' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(confirmation).toBeHidden();
}

async function bothThemes(window: Page): Promise<void> {
  for (const scheme of ['light', 'dark'] as const) {
    await window.emulateMedia({ colorScheme: scheme });
    await accessible(window);
  }
}

test.describe('undo.notification', () => {
  test('a write of three documents is recorded, and Undo in its notification puts them back', async () => {
    test.setTimeout(120_000);
    started = await launch();
    const { window } = started;
    const connection = await addMongo(window);
    await updateOrders(window, connection, 'paid');
    const notifications = window.getByRole('region', { name: 'Notifications' });
    await expect(notice(notifications, 'Update 3 documents.')).toBeVisible();
    expect((await orders()).map((each) => (each as { status: string }).status)).toEqual(['paid', 'paid', 'paid']);
    const recorded = notifications.locator('[data-feature="undo.notification@notification"]');
    await expect(recorded).toContainText('Update 3 documents.');
    await recorded.locator('[data-feature="undo.revert@notification"]').first().click();
    await confirmUndo(window);
    await expect(
      notice(notifications, 'Undid "Update 3 documents": 3 documents in Local › shop.orders.'),
    ).toBeVisible();
    expect(await orders()).toEqual(originals);
  });
});

test.describe('undo.show', () => {
  test('lists the operations, expands one with its details, undoes it from its row, from the keyboard, in both themes', async () => {
    test.setTimeout(120_000);
    started = await launch();
    const { window } = started;
    const connection = await addMongo(window);
    await window.getByRole('navigation', { name: 'Rail' }).getByRole('button', { name: 'Undo history' }).click();
    await expect(window.getByText('No operations yet', { exact: false })).toBeVisible();
    await bothThemes(window);
    await updateOrders(window, connection, 'paid');
    const table = window.getByRole('table', { name: 'Undo history' });
    const row = table.getByRole('row').filter({ hasText: 'Update 3 documents' });
    const operation = row.locator('[data-feature="undo.details@table"]');
    await expect(row).toContainText('Local › shop.orders');
    await expect(row).toContainText('3 updated');
    await operation.focus();
    await window.keyboard.press('Enter');
    await expect(operation).toHaveAttribute('aria-expanded', 'true');
    await expect(table.getByText('updated: the undo restores it')).toHaveCount(3);
    await bothThemes(window);
    await window.keyboard.press('Enter');
    await expect(operation).toHaveAttribute('aria-expanded', 'false');
    await window.keyboard.press('Tab');
    await expect(row.locator('[data-feature="undo.revert@table"]')).toBeFocused();
    await window.keyboard.press('Enter');
    await confirmUndo(window);
    await expect(window.getByRole('status').filter({ hasText: 'Undid "Update 3 documents"' })).toBeVisible();
    expect(await orders()).toEqual(originals);
    await expect(table.locator('tr').filter({ hasText: 'undone' })).toHaveCount(1);
    await expect(table.locator('tr').filter({ hasText: 'Undo: Update 3 documents' })).toHaveCount(1);
    await window.getByRole('searchbox', { name: 'Filter by connection, target or operation' }).fill('undo:');
    await expect(window.getByText('1 shown · 2 operations', { exact: false })).toBeVisible();
    await bothThemes(window);
  });
});

test.describe('undo.per-connection', () => {
  test('Stop keeping undo history: the next write is not recorded and its confirmation says so', async () => {
    test.setTimeout(120_000);
    started = await launch();
    const { window } = started;
    const connection = await addMongo(window);
    await window.getByRole('button', { name: 'Menu of Local' }).first().click();
    await window.locator('[data-feature="undo.per-connection@connection-island"]').click();
    await window.getByRole('button', { name: 'Menu of Local' }).first().click();
    await expect(window.locator('[data-feature="undo.per-connection@connection-island"]')).toHaveText(
      'Keep undo history',
    );
    await window.keyboard.press('Escape');
    await window.evaluate(
      ({ id }) => {
        const bridge = (globalThis as unknown as { datardo: { start: (intent: unknown) => Promise<unknown> } }).datardo;
        void bridge.start({
          feature: 'test.update-documents',
          target: { kind: 'app' },
          args: { connection: id, database: 'shop', collection: 'orders', ids: ['o1'], set: { status: 'x' } },
        });
      },
      { id: connection },
    );
    const confirmation = window.getByRole('dialog', { name: 'Update 1 documents' });
    await expect(
      confirmation.getByText("The undo history is off for this connection: this can't be undone."),
    ).toBeVisible();
    await confirmation.getByRole('button', { name: 'Continue' }).click();
    const notifications = window.getByRole('region', { name: 'Notifications' });
    await expect(notice(notifications, 'Update 1 documents.')).toBeVisible();
    await expect(notifications.locator('[data-feature="undo.revert@notification"]')).toHaveCount(0);
  });
});

test.describe('undo.limits', () => {
  test('a damaged undo/index.json is set aside, said, and no operation file is deleted', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'datardo-ui-undo-'));
    await mkdir(join(folder, 'undo'));
    await writeFile(join(folder, 'undo', 'index.json'), '{ not json');
    await writeFile(join(folder, 'undo', 'kept-1.json.gz'), 'whatever');
    started = await launch({}, folder);
    const notifications = started.window.getByRole('region', { name: 'Notifications' });
    await expect(
      notice(notifications, /The undo history could not be read and was set aside as index\.damaged-/u),
    ).toBeVisible();
    await started.window.waitForTimeout(1000);
    const names = await readdir(join(folder, 'undo'));
    expect(names).toContain('kept-1.json.gz');
    expect(names.some((name) => name.startsWith('index.damaged-'))).toBe(true);
  });
});
