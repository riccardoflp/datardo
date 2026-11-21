/**
 * The values of lists, sets, sorted sets and streams driven through the window (M15): the toolbar of each type and the
 * reads it starts, the forms of its writes, the editor of an element and of a score, rows selected with the keyboard
 * and removed from the selection bar or with `Delete`, the form of **Add entry**, the **Groups** section of a stream,
 * and a read-only connection that offers nothing that writes. Each page and dialog is checked for accessibility in both
 * themes. The keys are `m15:ui-<run>:*` in database 4 of the shared Redis; each test closes every Datardo it started,
 * even when it fails.
 */
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createClient } from 'redis';
import { expectAccessible, startApp, type StartedApp } from '../app';

const redisUrl = process.env['DATARDO_TEST_REDIS_URL'] ?? 'redis://127.0.0.1:6390';
/** The database of the shared Redis these tests may use: only the keys of this run are written. */
const redisDatabase = 4;
const prefix = `m15:ui-${randomBytes(4).toString('hex')}`;
const running: StartedApp[] = [];

function newRedisClient() {
  return createClient({ url: redisUrl, database: redisDatabase });
}

async function withRedis<T>(use: (client: ReturnType<typeof newRedisClient>) => Promise<T>): Promise<T> {
  const client = newRedisClient();
  await client.connect();
  try {
    return await use(client);
  } finally {
    client.destroy();
  }
}

/** A command sent to the shared Redis, its reply as the client gives it. */
async function redis(...words: string[]): Promise<unknown> {
  return withRedis((client) => client.sendCommand(words));
}

test.beforeEach(async () => {
  await withRedis(async (client) => {
    await client.rPush(`${prefix}:queue`, ['a', 'b', 'c', 'd', 'e']);
    await client.sAdd(`${prefix}:tags`, ['redis', 'cache', 'db']);
    await client.zAdd(`${prefix}:board`, [
      { score: 1, value: 'ada' },
      { score: 2, value: 'bob' },
      { score: 3, value: 'eve' },
    ]);
    for (const [id, user] of [
      ['1700000000000-0', '1'],
      ['1700000000001-0', '2'],
      ['1700000000002-0', '3'],
    ] as const) {
      await client.sendCommand(['XADD', `${prefix}:events`, id, 'type', 'signup', 'user', user]);
    }
    await client.sendCommand(['XGROUP', 'CREATE', `${prefix}:events`, 'mailers', '0']);
    await client.sendCommand([
      'XREADGROUP',
      'GROUP',
      'mailers',
      'worker-1',
      'COUNT',
      '2',
      'STREAMS',
      `${prefix}:events`,
      '>',
    ]);
  });
});

test.afterEach(async () => {
  for (const started of running.splice(0)) {
    await started.close().catch((error: unknown) => {
      // Already closed by the test: nothing is left running.
      console.warn('Datardo was already closed:', error);
    });
  }
  await withRedis(async (client) => {
    for await (const keys of client.scanIterator({ MATCH: `${prefix}:*`, COUNT: 1000 })) {
      if (keys.length > 0) {
        await client.unlink(keys);
      }
    }
  });
});

async function launch(): Promise<Page> {
  const started = await startApp();
  running.push(started);
  await expect(started.window.getByRole('navigation', { name: 'Rail' })).toBeVisible();
  return started.window;
}

async function addRedis(window: Page, readOnly = false): Promise<void> {
  const url = new URL(redisUrl);
  await window.evaluate(async () => {
    const bridge = (globalThis as unknown as { datardo: { start: (intent: unknown) => Promise<unknown> } }).datardo;
    await bridge.start({ feature: 'connection.add', target: { kind: 'app' }, args: 'redis' });
  });
  const form = window.getByRole('form', { name: 'New connection' });
  await form.locator('[data-field="name"]').fill('Cache');
  await form.locator('[data-field="host"]').fill(url.hostname);
  await form.locator('[data-field="port"]').fill(url.port);
  if (readOnly) {
    await form.locator('[data-field="read-only"]').check();
  }
  await form.getByRole('button', { name: 'Save and connect' }).click();
  await expect(form).toBeHidden();
}

function keysGrid(window: Page) {
  return window.getByRole('grid', { name: 'Keys' });
}

/** Opens a key of this run in its own tab, from the keys tab of db4. */
async function openKey(window: Page, name: string, readOnly = false): Promise<void> {
  await addRedis(window, readOnly);
  await window
    .getByRole('tree', { name: 'Tree' })
    .getByRole('treeitem', { name: /^db4, / })
    .click();
  const pattern = window.getByRole('textbox', { name: 'Pattern' });
  await expect(pattern).toBeVisible();
  await pattern.fill(`${prefix}:${name}`);
  await pattern.press('Enter');
  await keysGrid(window)
    .getByRole('row')
    .filter({ has: window.getByRole('gridcell', { name: `${prefix}:${name}`, exact: true }) })
    .click();
  await keysGrid(window).press('Enter');
  await expect(window.getByRole('toolbar', { name: `${prefix}:${name}` })).toBeVisible();
}

function items(window: Page) {
  return window.getByRole('grid', { name: 'Items' });
}

function toolbar(window: Page) {
  return window.getByRole('toolbar', { name: 'Value' });
}

async function bothThemes(window: Page): Promise<void> {
  for (const theme of ['light', 'dark']) {
    await window.evaluate((name) => {
      document.documentElement.dataset['theme'] = name;
    }, theme);
    await expectAccessible(window);
  }
}

/** Waits until a read of the shared Redis gives what is expected. */
async function eventually(words: readonly string[], expected: unknown): Promise<void> {
  await expect.poll(async () => JSON.stringify(await redis(...words))).toBe(JSON.stringify(expected));
}

test.describe('value.read-list', () => {
  test('a list is read from the head, from the tail and from an index typed in Go to index', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'queue');
    await expect(items(window).getByRole('columnheader')).toHaveText(['Index', 'Element']);
    const head = toolbar(window).getByRole('button', { name: 'From the head' });
    await expect(head).toHaveAttribute('aria-pressed', 'true');
    await toolbar(window).getByRole('button', { name: 'From the tail' }).click();
    await expect(items(window).getByRole('row').nth(1)).toContainText('e');
    const index = toolbar(window).getByRole('textbox', { name: 'Go to index' });
    await index.fill('2');
    await index.press('Enter');
    await expect(items(window).getByRole('row').nth(1)).toContainText('c');
    await index.fill('abc');
    await index.press('Enter');
    await expect(window.getByRole('region', { name: 'Value' }).getByRole('alert')).toBeVisible();
    await bothThemes(window);
  });
});

test.describe('value.push-element', () => {
  test('Push… opens its form; Enter pushes the element to the tail', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'queue');
    await toolbar(window).getByRole('button', { name: 'Push…' }).click();
    const form = window.getByRole('dialog', { name: `Push to ${prefix}:queue` });
    await expect(form).toBeVisible();
    await bothThemes(window);
    await form.getByLabel('Element', { exact: true }).fill('welcome');
    await form.getByLabel('Element', { exact: true }).press('Enter');
    await eventually(['LINDEX', `${prefix}:queue`, '-1'], 'welcome');
    await expect(items(window).getByRole('gridcell', { name: 'welcome', exact: true })).toBeVisible();
  });
});

test.describe('value.edit-element', () => {
  test('a double click on an element opens its editor, and Enter saves it at its index', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'queue');
    await items(window).getByRole('gridcell', { name: 'b', exact: true }).dblclick();
    const editor = window.getByRole('textbox', { name: /^Element/ });
    await expect(editor).toHaveValue('b');
    await expectAccessible(window);
    await editor.fill('bee');
    await editor.press('Enter');
    await eventually(['LINDEX', `${prefix}:queue`, '1'], 'bee');
  });
});

test.describe('value.remove-elements', () => {
  test('rows selected with the keyboard are removed with Delete after the confirmation', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'queue');
    await items(window).focus();
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('Shift+ArrowDown');
    await expect(window.getByRole('toolbar', { name: '2 elements selected' })).toBeVisible();
    await bothThemes(window);
    await window.keyboard.press('Delete');
    const confirmation = window.getByRole('dialog', { name: `Remove 2 elements from ${prefix}:queue` });
    await expect(confirmation).toBeVisible();
    await expectAccessible(window);
    await confirmation.getByRole('button', { name: 'Remove' }).click();
    await eventually(['LRANGE', `${prefix}:queue`, '0', '-1'], ['c', 'd', 'e']);
  });
});

test.describe('value.trim-list', () => {
  test('Trim… keeps the range typed after its confirmation', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'queue');
    await toolbar(window).getByRole('button', { name: 'Trim…' }).click();
    const form = window.getByRole('dialog', { name: `Trim ${prefix}:queue` });
    await expect(form).toBeVisible();
    await expectAccessible(window);
    await form.getByLabel('Keep the elements from index', { exact: true }).fill('0');
    await form.getByLabel('to', { exact: true }).fill('1');
    await form.getByLabel('to', { exact: true }).press('Enter');
    const confirmation = window.getByRole('dialog', { name: `Trim ${prefix}:queue to 0…1` });
    await confirmation.getByRole('button', { name: 'Trim' }).click();
    await eventually(['LRANGE', `${prefix}:queue`, '0', '-1'], ['a', 'b']);
  });
});

test.describe('value.read-set', () => {
  test('a set is filtered with Filter members', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'tags');
    const filter = toolbar(window).getByRole('searchbox', { name: 'Filter members' });
    await filter.fill('red*');
    await filter.press('Enter');
    await expect(items(window).getByRole('gridcell', { name: 'redis', exact: true })).toBeVisible();
    await expect(items(window).getByRole('gridcell', { name: 'cache', exact: true })).toHaveCount(0);
    await bothThemes(window);
  });
});

test.describe('value.add-member', () => {
  test('Add member opens its form and adds the member', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'tags');
    await toolbar(window).getByRole('button', { name: 'Add member' }).click();
    const form = window.getByRole('dialog', { name: `Add a member to ${prefix}:tags` });
    await expect(form).toBeVisible();
    await bothThemes(window);
    await form.getByLabel('Member', { exact: true }).fill('search');
    await form.getByLabel('Member', { exact: true }).press('Enter');
    await eventually(['SISMEMBER', `${prefix}:tags`, 'search'], 1);
  });
});

test.describe('value.remove-members', () => {
  test('the selection bar removes the members selected', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'tags');
    await items(window).focus();
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('Shift+ArrowDown');
    const bar = window.getByRole('toolbar', { name: '2 members selected' });
    await bar.getByRole('button', { name: 'Remove…' }).click();
    await window.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
    await eventually(['SCARD', `${prefix}:tags`], 1);
  });
});

test.describe('value.read-sorted-set', () => {
  test('a sorted set is read Highest first and between a Min score and a Max score', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'board');
    await expect(items(window).getByRole('columnheader')).toHaveText(['Rank', 'Member', 'Score']);
    await toolbar(window).getByRole('button', { name: 'Highest first' }).click();
    await expect(items(window).getByRole('row').nth(1)).toContainText('eve');
    await toolbar(window).getByRole('button', { name: 'Lowest first' }).click();
    await toolbar(window).getByRole('textbox', { name: 'Min score' }).fill('2');
    await toolbar(window).getByRole('textbox', { name: 'Max score' }).fill('2');
    await toolbar(window).getByRole('textbox', { name: 'Max score' }).press('Enter');
    await expect(items(window).getByRole('columnheader')).toHaveText(['Member', 'Score']);
    await expect(items(window).getByRole('row')).toHaveCount(2);
    await bothThemes(window);
  });
});

test.describe('value.add-scored-member', () => {
  test('Add member of a sorted set adds the member with its score', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'board');
    await toolbar(window).getByRole('button', { name: 'Add member' }).click();
    const form = window.getByRole('dialog', { name: `Add a member to ${prefix}:board` });
    await expect(form).toBeVisible();
    await expectAccessible(window);
    await form.getByLabel('Member', { exact: true }).fill('zed');
    await form.getByLabel('Score', { exact: true }).fill('9');
    await form.getByLabel('Score', { exact: true }).press('Enter');
    await eventually(['ZSCORE', `${prefix}:board`, 'zed'], 9);
  });
});

test.describe('value.change-score', () => {
  test('a double click on a score opens its editor; a member says it cannot be changed', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'board');
    await items(window).getByRole('gridcell', { name: 'ada', exact: true }).dblclick();
    await expect(window.getByText('A member cannot be changed: remove it and add another.')).toBeVisible();
    await items(window)
      .getByRole('row')
      .filter({ has: window.getByRole('gridcell', { name: 'bob', exact: true }) })
      .getByRole('gridcell', { name: '2', exact: true })
      .dblclick();
    const editor = window.getByRole('textbox', { name: /^Score/ });
    await expect(editor).toHaveValue('2');
    await editor.fill('2.5');
    await editor.press('Enter');
    await eventually(['ZSCORE', `${prefix}:board`, 'bob'], 2.5);
  });
});

test.describe('value.remove-scored-members', () => {
  test('Delete removes the member selected after the confirmation', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'board');
    await items(window).focus();
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('Delete');
    await window.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
    await eventually(['ZCARD', `${prefix}:board`], 2);
  });
});

test.describe('value.read-stream', () => {
  test('a stream is read Newest first, Oldest first, and From an ID', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'events');
    await expect(items(window).getByRole('row').nth(1)).toContainText('1700000000002-0');
    await toolbar(window).getByRole('button', { name: 'Oldest first' }).click();
    await expect(items(window).getByRole('row').nth(1)).toContainText('1700000000000-0');
    const from = toolbar(window).getByRole('textbox', { name: 'From', exact: true });
    await from.fill('1700000000001-0');
    await from.press('Enter');
    await expect(items(window).getByRole('row')).toHaveCount(3);
    await bothThemes(window);
  });
});

test.describe('value.add-entry', () => {
  test('Add entry opens its form with an ID and a pair, and adds the entry', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'events');
    await toolbar(window).getByRole('button', { name: 'Add entry' }).click();
    const form = window.getByRole('dialog', { name: `Add an entry to ${prefix}:events` });
    await expect(form).toBeVisible();
    await expect(form.getByRole('textbox', { name: 'ID' })).toHaveValue('*');
    await bothThemes(window);
    await form.getByRole('textbox', { name: 'Field 1', exact: true }).fill('type');
    await form.getByRole('textbox', { name: 'Value 1', exact: true }).fill('login');
    await form.getByRole('button', { name: 'Add', exact: true }).click();
    await eventually(['XLEN', `${prefix}:events`], 4);
  });
});

test.describe('value.delete-entries', () => {
  test('Delete entry… of the row menu deletes the entry after the confirmation', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'events');
    await items(window).focus();
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('Shift+F10');
    await window.getByRole('menuitem', { name: 'Delete entry…' }).click();
    const confirmation = window.getByRole('dialog', { name: `Delete entry 1700000000002-0 from ${prefix}:events` });
    await expect(confirmation).toBeVisible();
    await expectAccessible(window);
    await confirmation.getByRole('button', { name: 'Delete' }).click();
    await eventually(['XLEN', `${prefix}:events`], 2);
  });
});

test.describe('value.trim-stream', () => {
  test('Trim… keeps the newest entries after its confirmation', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'events');
    await toolbar(window).getByRole('button', { name: 'Trim…' }).click();
    const form = window.getByRole('dialog', { name: `Trim ${prefix}:events` });
    await expect(form).toBeVisible();
    await expectAccessible(window);
    await form.getByRole('textbox', { name: 'Keep the newest', exact: true }).fill('1');
    await form.getByRole('textbox', { name: 'Keep the newest', exact: true }).press('Enter');
    await window
      .getByRole('dialog', { name: `Trim ${prefix}:events to 1 entry` })
      .getByRole('button', { name: 'Trim' })
      .click();
    await eventually(['XLEN', `${prefix}:events`], 1);
  });
});

test.describe('value.stream-groups', () => {
  test('the Groups section shows the groups, the consumers of one and its pending entries, from the keyboard', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'events');
    const sections = window.getByRole('tablist', { name: 'Sections' });
    await sections.getByRole('tab', { name: 'Entries' }).focus();
    await window.keyboard.press('ArrowRight');
    await expect(sections.getByRole('tab', { name: 'Groups' })).toHaveAttribute('aria-selected', 'true');
    const panel = window.getByRole('tabpanel', { name: 'Groups' });
    const groups = panel.getByRole('table', { name: 'Consumer groups' });
    await expect(groups.getByRole('button', { name: 'mailers' })).toBeVisible();
    await groups.getByRole('button', { name: 'mailers' }).focus();
    await window.keyboard.press('Enter');
    await expect(panel.getByRole('table', { name: 'Consumers of mailers' })).toContainText('worker-1');
    const pending = panel.getByRole('table', { name: 'Pending entries' });
    await expect(pending.getByRole('button')).toHaveCount(2);
    await bothThemes(window);
    await pending.getByRole('button', { name: '1700000000001-0' }).click();
    await expect(sections.getByRole('tab', { name: 'Entries' })).toHaveAttribute('aria-selected', 'true');
    await expect(items(window).getByRole('row')).toHaveCount(2);
    await expect(items(window).getByRole('row', { selected: true })).toHaveCount(1);
  });
});

test.describe('value.show', () => {
  test('a read-only connection reads a list, a set, a sorted set and a stream, and offers nothing that writes', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await openKey(window, 'queue', true);
    for (const name of ['Push…', 'Trim…']) {
      await expect(toolbar(window).getByRole('button', { name })).toHaveCount(0);
    }
    await expect(toolbar(window).getByRole('button', { name: 'From the tail' })).toBeVisible();
    await items(window).getByRole('gridcell', { name: 'b', exact: true }).dblclick();
    await expect(window.getByRole('textbox', { name: /^Element/ })).toHaveCount(0);
    await items(window).focus();
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('Delete');
    await expect(window.getByRole('dialog')).toHaveCount(0);
    await bothThemes(window);
    expect(await redis('LLEN', `${prefix}:queue`)).toBe(5);
  });
});
