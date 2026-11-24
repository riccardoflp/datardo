/**
 * The data folder at a start on Linux and macOS (R14.11, T25; platform.md, "Per system"): files and folders an older
 * version made with the umask's modes are readable only by the user once Datardo has started, and what it writes then
 * is too; `chromium/` is left as Electron makes it.
 */
import { expect, test } from '@playwright/test';
import { chmod, lstat, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { closeAll, launch, newDataFolder, removeDataFolder } from './launch';

let dataFolder: string;

test.beforeEach(async () => {
  dataFolder = await newDataFolder();
});

test.afterEach(async () => {
  await closeAll();
  await removeDataFolder(dataFolder);
});

function modeOf(path: string): Promise<number> {
  return lstat(path).then((found) => found.mode & 0o777);
}

test('after a start every file of the data folder is 0600 and every folder 0700, also those made 0644 by hand', async () => {
  test.skip(process.platform === 'win32', 'Windows keeps the permissions of the profile folder');
  for (const folder of ['state', 'saved-queries', 'undo', 'tasks']) {
    await mkdir(join(dataFolder, folder), { recursive: true, mode: 0o755 });
    await chmod(join(dataFolder, folder), 0o755);
  }
  const files = ['state/c1.json', 'saved-queries/c1.json', 'undo/index.json', 'tasks/tasks.json', 'pins.json'];
  for (const file of files) {
    await writeFile(join(dataFolder, file), '{ "version": 1 }\n', { mode: 0o644 });
    await chmod(join(dataFolder, file), 0o644);
  }
  await chmod(dataFolder, 0o755);
  const { app } = await launch(dataFolder);
  expect(await modeOf(dataFolder)).toBe(0o700);
  for (const folder of ['state', 'saved-queries', 'undo', 'tasks']) {
    expect(await modeOf(join(dataFolder, folder)), folder).toBe(0o700);
  }
  const own = ['state', 'saved-queries', 'undo', 'tasks'];
  // A file the start found damaged was set aside under another name: every file is looked at, as it is now.
  const now = (await readdir(dataFolder, { recursive: true, withFileTypes: true })).filter(
    (entry) =>
      entry.isFile() &&
      (entry.parentPath === dataFolder
        ? entry.name.endsWith('.json')
        : own.includes(relative(dataFolder, entry.parentPath).split(sep)[0] ?? '')),
  );
  expect(now.length).toBeGreaterThanOrEqual(files.length);
  for (const entry of now) {
    const path = join(entry.parentPath, entry.name);
    expect(await modeOf(path), path).toBe(0o600);
  }
  // What Datardo writes after the start: the window's place, once the window has moved.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setBounds({ x: 100, y: 100, width: 1000, height: 700 });
  });
  await expect.poll(() => modeOf(join(dataFolder, 'window.json')).catch(() => 0), { timeout: 15_000 }).toBe(0o600);
});
