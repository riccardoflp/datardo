/**
 * `window.check-update` against a server of the test: in test mode only, `DATARDO_TEST_UPDATE_ADDRESS` replaces the
 * address of GitHub, and `DATARDO_TEST_UPDATE_DELAY_MS` the 10 seconds after the window shows.
 */
import { expect, test } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, notice, type Started } from '../runner/launch';

let server: Server;
let requests: IncomingHttpHeaders[];
let started: Started | undefined;

test.beforeEach(async () => {
  requests = [];
  server = createServer((request, response) => {
    requests.push(request.headers);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ tag_name: 'v99.0.0', html_url: 'https://example.com/x' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
});

test.afterEach(async () => {
  await started?.close();
  started = undefined;
  await new Promise((resolve) => server.close(resolve));
});

function environment(): Record<string, string> {
  const { port } = server.address() as AddressInfo;
  return { DATARDO_TEST_UPDATE_ADDRESS: `http://127.0.0.1:${String(port)}/`, DATARDO_TEST_UPDATE_DELAY_MS: '500' };
}

test('window.check-update: with the setting on, one request is sent after the window shows, named Datardo/<version>', async () => {
  started = await launch(environment());
  await expect.poll(() => requests.length, { timeout: 5000 }).toBe(1);
  expect(requests[0]?.['user-agent']).toMatch(/^Datardo\/\d+\.\d+\.\d+$/u);
  expect(requests[0]?.['cookie']).toBeUndefined();
  expect(requests[0]?.['authorization']).toBeUndefined();
  const notifications = started.window.getByRole('region', { name: 'Notifications' });
  await expect(notice(notifications, /^Datardo 99\.0\.0 is available\. You have /u)).toBeVisible();
  await expect(notifications.getByRole('button', { name: 'Download' })).toBeVisible();
  await started.window.waitForTimeout(1000);
  expect(requests).toHaveLength(1);
});

test('window.check-update: with the setting off, no request is sent; turning it on sends one at once', async () => {
  const dataFolder = await mkdtemp(join(tmpdir(), 'datardo-ui-update-'));
  await writeFile(
    join(dataFolder, 'settings.json'),
    JSON.stringify({ version: 1, 'datardo.window.checkForUpdates': false }),
  );
  started = await launch(environment(), dataFolder);
  await started.window.waitForTimeout(2000);
  expect(requests).toHaveLength(0);
  await started.window.evaluate(() => {
    const datardo = (globalThis as unknown as { datardo: { start: (intent: unknown) => Promise<unknown> } }).datardo;
    return datardo.start({
      feature: 'settings.change',
      target: { kind: 'app' },
      args: { name: 'datardo.window.checkForUpdates', value: true },
    });
  });
  await expect.poll(() => requests.length, { timeout: 5000 }).toBe(1);
});
