/**
 * The connection area driven through the window (`connection.form`, `connection.test`, `connection.save`,
 * `connection.connect`, `connection.overview`, `connection.menu`, `connection.state`): a MongoDB replica set and a
 * Redis server, each with a password, the Redis one through TLS, added, tested, saved, connected and shown in their
 * Overview; after a restart they connect again without asking the password, which is in no file of the data folder,
 * no event sent to the window and no Log line (R14.1); a read-only connection refuses a write. Each test closes every
 * Datardo it started, even when it fails. No password is printed: each is made here and only compared.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { connect as netConnect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createTlsServer, type Server } from 'node:tls';
import { createClient } from 'redis';
import { expectAccessible, firstWindow, keepsSecrets, noKeychain } from '../app';

const tlsFolder = join(import.meta.dirname, '..', '..', 'fixtures', 'tls');
const caFile = join(tlsFolder, 'ca.pem');
const redisUrl = process.env['DATARDO_TEST_REDIS_URL'] ?? 'redis://127.0.0.1:6390';
const mongoPassword = randomBytes(12).toString('hex');
const redisPassword = randomBytes(12).toString('hex');
const redisUser = `datardo-ui-${randomBytes(4).toString('hex')}`;

let replicaSet: MongoMemoryReplSet | undefined;
let proxy: { readonly port: number; readonly close: () => void } | undefined;
let folder: string;
const running: ElectronApplication[] = [];

/** A TLS server with the test certificate that hands each connection to the plain Redis server. */
async function tlsProxy(target: URL): Promise<{ readonly port: number; readonly close: () => void }> {
  const pem = readFileSync(join(tlsFolder, 'server.pem'));
  const sockets = new Set<Socket>();
  const server: Server = createTlsServer({ cert: pem, key: pem }, (socket) => {
    const plain = netConnect(Number(target.port), target.hostname);
    sockets.add(plain).add(socket);
    socket.pipe(plain).pipe(socket);
    socket.on('error', () => plain.destroy());
    plain.on('error', () => socket.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    port: typeof address === 'object' && address !== null ? address.port : 0,
    close: () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close();
    },
  };
}

/** Sends one command to the Redis server as its administrator. */
async function redisAdmin(command: readonly string[]): Promise<void> {
  const client = createClient({ url: redisUrl });
  await client.connect();
  try {
    await client.sendCommand([...command]);
  } finally {
    client.destroy();
  }
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const binary = process.env['MONGOMS_SYSTEM_BINARY'];
  replicaSet = await MongoMemoryReplSet.create({
    ...(binary === undefined || binary === '' ? {} : { binary: { systemBinary: binary } }),
    replSet: {
      count: 1,
      storageEngine: 'wiredTiger',
      auth: { enable: true, customRootName: 'ada', customRootPwd: mongoPassword },
    },
  });
  await redisAdmin(['ACL', 'SETUSER', redisUser, 'on', `>${redisPassword}`, '~*', '&*', '+@all']);
  proxy = await tlsProxy(new URL(redisUrl));
});

test.afterAll(async () => {
  proxy?.close();
  await redisAdmin(['ACL', 'DELUSER', redisUser]).catch((error: unknown) => {
    console.warn('The test user of Redis was not removed:', error);
  });
  await replicaSet?.stop();
});

test.beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-ui-connection-'));
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

/** Starts Datardo on the test's data folder, and records every event the main process sends to the window. */
async function launch(): Promise<{ readonly app: ElectronApplication; readonly window: Page }> {
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...(process.env as Record<string, string>),
      DATARDO_TEST_UPDATE_ADDRESS: 'http://127.0.0.1:9/',
      DATARDO_DATA: folder,
      DATARDO_TEST: '1',
    },
  });
  running.push(app);
  const window = await firstWindow(app);
  await window.setViewportSize({ width: 1440, height: 900 });
  await expect(window.getByRole('navigation', { name: 'Rail' })).toBeVisible();
  await window.evaluate(() => {
    const global = globalThis as unknown as {
      events: string[];
      datardo: { onEvent: (listener: (event: unknown) => void) => void };
    };
    global.events = [];
    global.datardo.onEvent((event) => global.events.push(JSON.stringify(event)));
  });
  return { app, window };
}

async function quit(app: ElectronApplication): Promise<void> {
  running.splice(running.indexOf(app), 1);
  await app.close();
}

/** Starts a feature from the window, on a connection or on the app, and gives its result. */
async function start(window: Page, feature: string, connection?: string, args?: unknown): Promise<unknown> {
  return window.evaluate(
    async ({ id, on, given }) => {
      const bridge = (globalThis as unknown as { datardo: { start: (intent: unknown) => Promise<unknown> } }).datardo;
      return bridge.start({
        feature: id,
        target: on === undefined ? { kind: 'app' } : { kind: 'connection', connection: on },
        ...(given === undefined ? {} : { args: given }),
      });
    },
    { id: feature, on: connection, given: args },
  );
}

interface Saved {
  readonly id: string;
  readonly name: string;
}

async function appState(window: Page): Promise<{
  readonly connections: { readonly saved: readonly Saved[]; readonly live: Record<string, { state: string }> };
}> {
  return window.evaluate(async () => {
    const bridge = (globalThis as unknown as { datardo: { state: () => Promise<unknown> } }).datardo;
    return (await bridge.state()) as never;
  });
}

async function idOf(window: Page, name: string): Promise<string> {
  const saved = (await appState(window)).connections.saved.find((each) => each.name === name);
  if (saved === undefined) {
    throw new Error(`${name} is not saved.`);
  }
  return saved.id;
}

async function expectConnected(window: Page, name: string): Promise<void> {
  const id = await idOf(window, name);
  await expect
    .poll(async () => (await appState(window)).connections.live[id]?.state, { timeout: 20_000 })
    .toBe('connected');
}

function mongoAddress(): string {
  const uri = new URL(replicaSet?.getUri() ?? '');
  return `mongodb://ada@${uri.host}/?replicaSet=${uri.searchParams.get('replicaSet') ?? ''}&authSource=admin`;
}

async function addMongo(window: Page): Promise<void> {
  await start(window, 'connection.add', undefined, 'mongodb');
  const form = window.getByRole('form', { name: 'New connection' });
  await expect(form.locator('[data-field="connection-string"]')).toBeFocused();
  await form.locator('[data-field="name"]').fill('Replica');
  await form.locator('[data-field="connection-string"]').fill(mongoAddress());
  await form.locator('[data-field="password"]').fill(mongoPassword);
  await form.getByRole('button', { name: 'Test connection' }).click();
  await expect(form.getByRole('status')).toContainText(/^Connected to 127\.0\.0\.1:\d+: MongoDB 8\./u);
  await form.getByRole('button', { name: 'Save and connect' }).click();
  await expect(form).toBeHidden();
  await expectConnected(window, 'Replica');
}

async function addRedis(window: Page): Promise<void> {
  await start(window, 'connection.add', undefined, 'redis');
  const form = window.getByRole('form', { name: 'New connection' });
  await expect(form.locator('[data-field="host"]')).toBeFocused();
  await form.locator('[data-field="name"]').fill('Cache');
  await form.locator('[data-field="host"]').fill('127.0.0.1');
  await form.locator('[data-field="port"]').fill(String(proxy?.port ?? 0));
  await form.locator('[data-field="username"]').fill(redisUser);
  await form.locator('[data-field="password"]').fill(redisPassword);
  await form.locator('[data-field="read-only"]').check();
  await form.locator('[data-field="tls"]').check();
  await form.locator('[data-field="ca-file"]').fill(caFile);
  await form.getByRole('button', { name: 'Test connection' }).click();
  await expect(form.getByRole('status')).toContainText(/^Connected to 127\.0\.0\.1:\d+: (Redis|Valkey) /u);
  await form.getByRole('button', { name: 'Save and connect' }).click();
  await expect(form).toBeHidden();
  await expectConnected(window, 'Cache');
}

/** Every file of a folder, read whole. */
async function filesOf(root: string): Promise<readonly { readonly path: string; readonly bytes: Buffer }[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
  return Promise.all(files.map(async (path) => ({ path, bytes: await readFile(path) })));
}

/** R14.1: neither password is in an event sent to the window, in the state or in the Log. */
async function expectNoPasswordSent(window: Page): Promise<void> {
  const seen = await window.evaluate(async () => {
    const global = globalThis as unknown as { events: string[]; datardo: { state: () => Promise<unknown> } };
    return [...global.events, JSON.stringify(await global.datardo.state())].join('\n');
  });
  for (const password of [mongoPassword, redisPassword]) {
    expect(seen.includes(password)).toBe(false);
  }
}

/** R14.1: neither password is in a file of the data folder, read once Datardo has quit and left them. */
async function expectNoPasswordInFiles(): Promise<void> {
  for (const file of await filesOf(folder)) {
    for (const password of [mongoPassword, redisPassword]) {
      expect(file.bytes.includes(password), file.path).toBe(false);
    }
  }
}

test('adds, tests, saves and connects a MongoDB replica set and a Redis server with their passwords', async () => {
  test.setTimeout(120_000);
  const first = await launch();
  test.skip(!(await keepsSecrets(first.window)), noKeychain);
  await addMongo(first.window);
  await expect(first.window.getByRole('region', { name: 'Connection', exact: true })).toContainText('Replica');
  await start(first.window, 'connection.overview', await idOf(first.window, 'Replica'));
  const overview = first.window.locator('[data-page="overview"]');
  await expect(overview.getByRole('heading', { name: /Replica/u })).toBeVisible();
  await expect(overview).toContainText(/Replica set \w+/u);
  await expect(overview).toContainText('primary');
  await addRedis(first.window);
  await start(first.window, 'connection.overview', await idOf(first.window, 'Cache'));
  await expect(overview.getByRole('heading', { name: /Cache/u })).toBeVisible();
  await expect(overview).toContainText('Eviction policy');
  await expect(overview).toContainText('Read-only: Datardo refuses writes through this connection');
  await expectNoPasswordSent(first.window);
  await quit(first.app);
  await expectNoPasswordInFiles();

  const second = await launch();
  for (const name of ['Replica', 'Cache']) {
    await start(second.window, 'connection.connect', await idOf(second.window, name));
    await expectConnected(second.window, name);
  }
  await expect(second.window.getByRole('dialog')).toHaveCount(0);
  await expectNoPasswordSent(second.window);
  await quit(second.app);
  await expectNoPasswordInFiles();
});

test('a read-only connection refuses a write', async () => {
  test.setTimeout(90_000);
  const { window } = await launch();
  await addRedis(window);
  const id = await idOf(window, 'Cache');
  await window.evaluate((on) => {
    const global = globalThis as unknown as {
      destroyed: Promise<unknown>;
      datardo: { start: (intent: unknown) => Promise<unknown> };
    };
    global.destroyed = global.datardo.start({
      feature: 'test.destroy',
      target: { kind: 'connection', connection: on },
      args: { connection: on },
    });
  }, id);
  await window.getByRole('dialog').getByRole('button', { name: 'Choose' }).click();
  const result = await window.evaluate(() => (globalThis as unknown as { destroyed: Promise<unknown> }).destroyed);
  expect(result).toMatchObject({ kind: 'refused', code: expect.stringMatching(/\/read-only$/u) });
});

test('the connection form: Redis fields and string, a refusal marked, Escape, and the accessibility check', async () => {
  const { window } = await launch();
  await start(window, 'connection.add', undefined, 'redis');
  const form = window.getByRole('form', { name: 'New connection' });
  await form.getByRole('radio', { name: 'Connection string' }).check();
  const address = form.locator('[data-field="connection-string"]');
  await address.fill('redis://:s3cret@cache');
  await address.blur();
  await expect(address).toHaveValue('redis://cache');
  await expect(form.locator('[data-field="password"]')).toHaveValue('s3cret');
  await address.fill('rediss://cache.example.com:6380/2');
  await form.getByRole('radio', { name: 'Fields' }).check();
  await expect(form.locator('[data-field="host"]')).toHaveValue('cache.example.com');
  await expect(form.locator('[data-field="port"]')).toHaveValue('6380');
  await expect(form.locator('[data-field="database"]')).toHaveValue('2');
  await expect(form.locator('[data-field="tls"]')).toBeChecked();
  for (const scheme of ['light', 'dark'] as const) {
    await window.emulateMedia({ colorScheme: scheme });
    await expectAccessible(window);
  }
  await form.locator('[data-field="port"]').fill('99999');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form.getByRole('alert')).toHaveText('The port must be a number from 1 to 65535');
  await expect(form.locator('[data-field="port"]')).toBeFocused();
  await expect(form.locator('[data-field="port"]')).toHaveAttribute('aria-invalid', 'true');
  await form.locator('[data-field="port"]').fill('6380');
  await expect(form.locator('[data-field="port"]')).not.toHaveAttribute('aria-invalid', 'true');
  await window.keyboard.press('Escape');
  await expect(form).toBeHidden();
});

test('the menu of the current connection, from the … button of the connection island', async () => {
  const { window } = await launch();
  await addRedis(window);
  // The Overview in front, so that the check is of the menu and of the pages of this area.
  await start(window, 'connection.overview', await idOf(window, 'Cache'));
  await window.locator('[data-feature="connection.menu@connection-island"]').click();
  const menu = window.getByRole('menu', { name: 'Menu of Cache' });
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Disconnect',
    'Open overview',
    'Edit connection…',
    'Duplicate',
    'Copy connection string',
    'Move to folder…',
    'Set color…',
    'Allow changes',
    'Remove connection',
  ]);
  await expectAccessible(window);
  await menu.getByRole('menuitem', { name: 'Edit connection…' }).click();
  const form = window.getByRole('form', { name: 'Connection Cache' });
  await expect(form.locator('[data-field="name"]')).toBeFocused();
  await expect(form.locator('[data-field="password"]')).toHaveValue('');
  await expect(form.locator('[data-field="password"]')).toHaveAttribute(
    'placeholder',
    'Saved — leave empty to keep it',
  );
  await expectAccessible(window);
});
