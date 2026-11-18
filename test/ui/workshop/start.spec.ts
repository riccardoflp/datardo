import { expect, test } from '@playwright/test';
import { expectAccessible, startApp, type StartedApp } from '../app';

let started: StartedApp;

test.beforeEach(async () => {
  started = await startApp();
});

test.afterEach(async () => {
  await started.close();
});

test('the window opens and the main process answers through the bridge', async () => {
  const reply = await started.window.evaluate(() => window.datardo.ping());
  expect(reply.name).toBe('Datardo');
  expect(reply.version).toMatch(/^\d+\.\d+\.\d+$/);
  await expect(started.window.getByRole('navigation', { name: 'Rail' })).toBeVisible();
  await expect(started.window.getByRole('contentinfo', { name: 'Status line' })).toContainText('No connection');
  await expectAccessible(started.window);
});

test('the window process is a sandbox', async () => {
  const reach = await started.window.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
  }));
  expect(reach).toEqual({ require: 'undefined', process: 'undefined' });
});
