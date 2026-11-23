/**
 * The pages M36 checks, each opened as the user opens it: Home and Settings with no server; a collection tab and the
 * Monitor page on a MongoDB seeded by the test file; the keys tab, a value tab, the console and the Server page on the
 * shared Redis (database 13, keys of this run only, as testing.md says).
 */
import { expect, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createClient } from 'redis';
import { openCollection, startIntent, type TestMongo } from '../query/collection-app';
import { goTo, gridOf, seedPeople } from '../table/parts-app';

export const redisUrl = process.env['DATARDO_TEST_REDIS_URL'] ?? 'redis://127.0.0.1:6390';
const redisDatabase = 13;
export const prefix = `m36:ui-${randomBytes(4).toString('hex')}`;

function newRedisClient() {
  return createClient({ url: redisUrl, database: redisDatabase });
}

/** Runs something against the shared Redis, in the database these tests may use. */
export async function withRedis(use: (client: ReturnType<typeof newRedisClient>) => Promise<void>): Promise<void> {
  const client = newRedisClient();
  await client.connect();
  try {
    await use(client);
  } finally {
    client.destroy();
  }
}

/** Writes the keys of this run: a string, a hash with a few fields, a list. */
export async function seedRedis(): Promise<void> {
  await withRedis(async (client) => {
    await client.set(`${prefix}:orders:1`, 'paid');
    await client.hSet(`${prefix}:users:7`, { name: 'Ada', city: 'Milano', plan: 'pro' });
    await client.rPush(`${prefix}:queue`, ['a', 'b', 'c']);
  });
}

/** Deletes the keys of this run, and nothing else. */
export async function cleanRedis(): Promise<void> {
  await withRedis(async (client) => {
    for await (const keys of client.scanIterator({ MATCH: `${prefix}:*`, COUNT: 1000 })) {
      if (keys.length > 0) {
        await client.unlink(keys);
      }
    }
  });
}

/** Adds the connection *Cache* to the shared Redis and connects. */
export async function addRedis(window: Page): Promise<void> {
  const url = new URL(redisUrl);
  await startIntent(window, 'connection.add', 'redis', { kind: 'app' });
  const form = window.getByRole('form', { name: 'New connection' });
  await form.locator('[data-field="name"]').fill('Cache');
  await form.locator('[data-field="host"]').fill(url.hostname);
  await form.locator('[data-field="port"]').fill(url.port);
  await form.getByRole('button', { name: 'Save and connect' }).click();
  await expect(form).toBeHidden();
}

function tree(window: Page) {
  return window.getByRole('tree', { name: 'Tree' });
}

/** The keys tab of database 13, scanned for the keys of this run. */
export async function openKeys(window: Page): Promise<void> {
  await tree(window)
    .getByRole('treeitem', { name: /^db13, / })
    .click();
  const pattern = window.getByRole('textbox', { name: 'Pattern' });
  await expect(pattern).toBeVisible();
  await pattern.fill(`${prefix}:*`);
  await pattern.press('Enter');
  await expect(window.getByRole('grid', { name: 'Keys' }).getByRole('row')).not.toHaveCount(0);
}

/** The value tab of the hash of this run, opened from the keys tab. */
export async function openHash(window: Page): Promise<void> {
  const keys = window.getByRole('grid', { name: 'Keys' });
  await keys
    .getByRole('row')
    .filter({ has: window.getByRole('gridcell', { name: `${prefix}:users:7`, exact: true }) })
    .click();
  await keys.press('Enter');
  await expect(window.getByRole('toolbar', { name: `${prefix}:users:7` })).toBeVisible();
}

/** The console of the connection, from its line among its pages. */
export async function openConsole(window: Page): Promise<void> {
  await tree(window).getByRole('treeitem', { name: 'Console, page', exact: true }).click();
  await expect(window.locator('[data-feature="console.input@editor"]')).toBeVisible();
}

/** The Server page of the connection. */
export async function openServer(window: Page): Promise<void> {
  await tree(window)
    .getByRole('treeitem', { name: /^Server, / })
    .click();
  await expect(
    window.getByRole('tablist', { name: 'Sections of the Server page' }).getByRole('tab', { name: 'Overview' }),
  ).toHaveAttribute('aria-selected', 'true');
}

/** The tab of `shop.people`, its rows shown. */
export async function openPeople(window: Page): Promise<void> {
  await openCollection(window, 'shop', 'people');
  await expect(gridOf(window).locator('td[data-pos="c:2:0:0"]')).toBeVisible();
}

/** The Monitor page of the MongoDB connection. */
export async function openMonitor(window: Page): Promise<void> {
  await goTo(window, 'Monitor');
  await expect(window.getByRole('tablist', { name: 'Sections of the Monitor page' })).toBeVisible();
}

/** The Settings page. */
export async function openSettings(window: Page): Promise<void> {
  await startIntent(window, 'settings.page', { group: 'Undo history' });
  await expect(window.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
}

/** Whether a MongoDB server can be started for these tests (`mongodb-memory-server`, or `MONGOMS_SYSTEM_BINARY`). */
export async function mongoStarts(mongo: TestMongo): Promise<boolean> {
  try {
    await seedPeople(mongo);
    return true;
  } catch (error: unknown) {
    console.warn('No MongoDB for the pages of a collection:', error);
    return false;
  }
}

/** Whether the shared Redis answers. */
export async function redisAnswers(): Promise<boolean> {
  try {
    await withRedis(async (client) => {
      await client.ping();
    });
    return true;
  } catch {
    return false;
  }
}
