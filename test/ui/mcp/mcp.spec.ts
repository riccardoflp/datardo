/**
 * The MCP server driven through the window (M29): its state in the top bar, the setup dialog, the configuration copied
 * with the token and used by a client over HTTP, a taken port with its warning and **Change port**, and the port's
 * rule. Each Datardo runs on a new data folder whose `settings.json` names a free port of 127.0.0.1; no assistant's
 * configuration file is read or written.
 */
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createServer, type Server } from 'node:net';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accessible, launch, notice, startFeature, type Started } from '../runner/launch';

let started: Started | undefined;
let blocker: Server | undefined;

test.afterEach(async () => {
  await started?.close();
  started = undefined;
  await new Promise<void>((resolve) => {
    if (blocker === undefined) {
      resolve();
    } else {
      blocker.close(() => {
        resolve();
      });
    }
  });
  blocker = undefined;
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address !== null) {
          resolve(address.port);
        } else {
          reject(new Error('No free port.'));
        }
      });
    });
  });
}

function occupy(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      resolve(server);
    });
  });
}

/** Starts Datardo on a data folder whose settings are these. */
async function launchWith(settings: Readonly<Record<string, unknown>>): Promise<Started> {
  const folder = await mkdtemp(join(tmpdir(), 'datardo-ui-mcp-'));
  await writeFile(join(folder, 'settings.json'), JSON.stringify({ version: 1, ...settings }));
  started = await launch({}, folder);
  return started;
}

function mcpButton(window: Page) {
  return window.locator('[data-feature="mcp.setup@top-bar"]');
}

function dot(window: Page) {
  return window.locator('[data-feature="mcp.status@top-bar"]');
}

async function clipboardText(app: ElectronApplication): Promise<string> {
  return app.evaluate(({ clipboard }) => clipboard.readText());
}

function post(port: number, token: string, body: unknown): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const text = JSON.stringify(body);
    const sent = request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/mcp',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(text)),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') });
        });
      },
    );
    sent.on('error', reject);
    sent.end(text);
  });
}

test('mcp.status: off by default, a hollow dot whose tooltip says how to set it up, accessible in both themes', async () => {
  const { window } = await launchWith({ 'datardo.mcp.port': await freePort() });
  await expect(mcpButton(window)).toHaveAccessibleName('MCP server: off. Click to set it up.');
  await expect(mcpButton(window)).toHaveAttribute('title', 'MCP server: off. Click to set it up.');
  await expect(dot(window)).toHaveAttribute('data-dot', 'hollow');
  await window.emulateMedia({ colorScheme: 'dark' });
  await accessible(window);
  await window.emulateMedia({ colorScheme: 'light' });
  await accessible(window);
});

test('mcp.setup: the top bar opens the dialog with Turn the server on first, and Escape changes nothing', async () => {
  const port = await freePort();
  const { window } = await launchWith({ 'datardo.mcp.port': port });
  await mcpButton(window).click();
  const dialog = window.getByRole('dialog');
  await expect(dialog).toContainText('Datardo MCP server · Off');
  const radios = dialog.getByRole('radio');
  await expect(radios.first()).toHaveAccessibleName(/^Turn the server on/u);
  await expect(dialog.locator('[data-feature="mcp.access-token@dialog"]')).toHaveCount(1);
  await expect(dialog.locator('[data-feature="mcp.change-port@dialog"]')).toHaveCount(1);
  await expect(dialog.locator('[data-feature="mcp.log@dialog"]')).toHaveCount(1);
  await window.emulateMedia({ colorScheme: 'dark' });
  await accessible(window);
  await window.emulateMedia({ colorScheme: 'light' });
  await accessible(window);
  await window.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(dot(window)).toHaveAttribute('data-dot', 'hollow');
});

test('mcp.setup: turned on, the server runs, and the JSON copied lets a client list the tools with the token', async () => {
  const port = await freePort();
  const { window, app } = await launchWith({ 'datardo.mcp.port': port });
  await mcpButton(window).click();
  const dialog = window.getByRole('dialog');
  await dialog.getByRole('radio', { name: /^Turn the server on/u }).check();
  await dialog.getByRole('button', { name: 'Choose' }).click();
  await expect(dot(window)).toHaveAttribute('data-dot', 'green');
  await expect(mcpButton(window)).toHaveAccessibleName(`MCP server: running on http://127.0.0.1:${String(port)}/mcp`);
  await mcpButton(window).click();
  await expect(dialog).toContainText(`Running on http://127.0.0.1:${String(port)}/mcp`);
  await expect(dialog.getByRole('radio', { name: /^Turn the server on/u })).toHaveCount(0);
  await expect(dialog).not.toContainText('Bearer ey');
  await dialog.getByRole('radio', { name: /^Copy the JSON configuration/u }).check();
  await dialog.getByRole('button', { name: 'Choose' }).click();
  const notifications = window.getByRole('region', { name: 'Notifications' });
  await expect(notice(notifications, /^Copied\. It contains the access token/u)).toBeVisible();
  const configuration = JSON.parse(await clipboardText(app)) as {
    mcpServers: { datardo: { url: string; headers: { Authorization: string } } };
  };
  expect(configuration.mcpServers.datardo.url).toBe(`http://127.0.0.1:${String(port)}/mcp`);
  const token = configuration.mcpServers.datardo.headers.Authorization.replace('Bearer ', '');
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  const html = await window.content();
  expect(html).not.toContain(token);
  const listed = await post(port, token, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  expect(listed.status).toBe(200);
  expect(listed.text).toContain('list_connections');
  expect((await post(port, 'wrong', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status).toBe(401);
});

test('mcp.server: a taken port warns once with Change port, whose dialog refuses 80, 70000 and abc', async () => {
  const port = await freePort();
  blocker = await occupy(port);
  const { window } = await launchWith({ 'datardo.mcp.enabled': true, 'datardo.mcp.port': port });
  const notifications = window.getByRole('region', { name: 'Notifications' });
  const warning = notice(
    notifications,
    `Datardo's MCP server is not running. Port ${String(port)} is used by another program.`,
  );
  await expect(warning).toBeVisible();
  await expect(dot(window)).toHaveAttribute('data-dot', 'orange');
  await expect(mcpButton(window)).toHaveAccessibleName(
    `MCP server: not running. Port ${String(port)} is used by another program.`,
  );
  await window.emulateMedia({ colorScheme: 'dark' });
  await accessible(window);
  await window.emulateMedia({ colorScheme: 'light' });
  await accessible(window);
  await notifications.getByRole('button', { name: 'Change port' }).click();
  const dialog = window.getByRole('dialog');
  const field = dialog.getByRole('textbox', { name: 'Port' });
  await expect(field).not.toHaveValue(String(port));
  const suggested = Number(await field.inputValue());
  expect(suggested).toBeGreaterThan(port);
  for (const wrong of ['80', '70000', 'abc']) {
    await field.fill(wrong);
    await expect(dialog.getByText('A number from 1024 to 65535')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Change port' })).toBeDisabled();
  }
  await accessible(window);
  await field.fill(String(suggested));
  await dialog.getByRole('button', { name: 'Change port' }).click();
  await expect(dot(window)).toHaveAttribute('data-dot', 'green');
  await expect(mcpButton(window)).toHaveAccessibleName(
    `MCP server: running on http://127.0.0.1:${String(suggested)}/mcp`,
  );
});

test('mcp.access-token: Go to generates a new token, said in a notification, and the server keeps running', async () => {
  const port = await freePort();
  const { window } = await launchWith({ 'datardo.mcp.enabled': true, 'datardo.mcp.port': port });
  await expect(dot(window)).toHaveAttribute('data-dot', 'green');
  await startFeature(window, 'mcp.access-token');
  const notifications = window.getByRole('region', { name: 'Notifications' });
  await expect(
    notice(notifications, "Datardo's MCP server has a new access token: copy the configuration again."),
  ).toBeVisible();
  await expect(dot(window)).toHaveAttribute('data-dot', 'green');
});
