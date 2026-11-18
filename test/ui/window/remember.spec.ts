import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { closeAll, launch, newDataFolder, quit, removeDataFolder, testEnvironment, track } from './launch';

let dataFolder: string;

test.beforeEach(async () => {
  dataFolder = await newDataFolder();
});

test.afterEach(async () => {
  await closeAll();
  await removeDataFolder(dataFolder);
});

test('window.remember: the window opens again with the size and place it was left with', async () => {
  const first = await launch(dataFolder);
  const wanted = { x: 120, y: 140, width: 1000, height: 700 };
  await first.app.evaluate(({ BrowserWindow }, bounds) => {
    BrowserWindow.getAllWindows()[0]?.setBounds(bounds);
  }, wanted);
  const left = await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getBounds());
  // The place is saved half a second after the window stops moving.
  await expect
    .poll(async () => JSON.parse(await readFile(join(dataFolder, 'window.json'), 'utf8').catch(() => '{}')) as unknown)
    .toMatchObject({ version: 1, width: left?.width, height: left?.height, left: left?.x, top: left?.y });
  await quit(first.app);

  const second = await launch(dataFolder);
  const opened = await second.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getBounds());
  expect(opened).toEqual(left);
});

test('window.single-instance: a second start on the same data folder shows the window that is open and ends', async () => {
  const first = await launch(dataFolder);
  const electronPath = createRequire(import.meta.url)('electron') as string;
  const second = track(spawn(electronPath, ['.'], { env: testEnvironment(dataFolder), stdio: 'ignore' }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error('The second start did not end.'));
      }, 20_000);
      second.on('exit', (exitCode) => {
        resolve(exitCode);
      });
    });
    expect(code).toBe(0);
  } finally {
    clearTimeout(timer);
    if (second.exitCode === null && second.signalCode === null) {
      second.kill();
    }
  }
  const windows = await first.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => window.isVisible()),
  );
  expect(windows).toEqual([true]);
});
