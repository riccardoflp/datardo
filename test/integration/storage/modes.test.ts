/**
 * The modes of the data folder on Linux and macOS (R14.11, T25; platform.md, "Per system"): what the stores write is
 * `0600` in folders `0700` whatever the `umask`, and a start sets these modes again on what an older version made.
 */
import { chmod, lstat, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDataFolder } from '../../../src/storage/modes';
import { Store, writeAtomically, writeOnce, type StoredFile } from '../../../src/storage/store';

const linux = process.platform !== 'win32';

const names: StoredFile<{ readonly names: readonly string[] }> = {
  path: 'state/c1.json',
  holds: 'The names',
  version: 1,
  migrations: {},
  empty: () => ({ names: [] }),
  read: (object) => ({ names: Array.isArray(object['names']) ? object['names'].map(String) : [] }),
  write: (value) => ({ names: [...value.names] }),
};

let folder: string;
let umask: number;

function modeOf(path: string): Promise<number> {
  return lstat(path).then((found) => found.mode & 0o777);
}

beforeEach(async () => {
  folder = join(await mkdtemp(join(tmpdir(), 'datardo-modes-')), 'data');
  umask = process.umask(0o022);
});

afterEach(async () => {
  process.umask(umask);
  await rm(join(folder, '..'), { recursive: true, force: true });
});

describe.skipIf(!linux)('the modes of the data folder', () => {
  it('writes a stored file 0600 in folders 0700 with a umask of 022', async () => {
    const store = new Store(folder, names);
    await store.load(new Date());
    store.set({ names: ['Ada'] });
    await store.flush();
    expect(await modeOf(join(folder, 'state', 'c1.json'))).toBe(0o600);
    expect(await modeOf(join(folder, 'state'))).toBe(0o700);
    expect(await modeOf(folder)).toBe(0o700);
    await writeOnce(folder, 'undo/op-1.json.gz', 'x');
    expect(await modeOf(join(folder, 'undo', 'op-1.json.gz'))).toBe(0o600);
    expect(await modeOf(join(folder, 'undo'))).toBe(0o700);
  });

  it('closes again a file left beside by a write that did not end', async () => {
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'settings.json.tmp'), 'old', { mode: 0o644 });
    await writeAtomically(join(folder, 'settings.json'), '{}', { private: true });
    expect(await modeOf(join(folder, 'settings.json'))).toBe(0o600);
  });

  it('leaves a file the user picked to the umask', async () => {
    await writeAtomically(join(folder, 'export', 'orders.json'), '[]');
    expect(await modeOf(join(folder, 'export', 'orders.json'))).toBe(0o644);
  });

  it('sets 0600 and 0700 at start on files and folders made 0644 and 0755 by hand, and leaves chromium/', async () => {
    for (const each of ['state', 'saved-queries', 'undo/deep', 'tasks', 'chromium/Cache']) {
      await mkdir(join(folder, each), { recursive: true, mode: 0o755 });
    }
    const files = [
      'settings.json',
      'secrets.json',
      'connections.damaged-2026-01-01_10-00-00-000.json',
      'state/c1.json',
      'saved-queries/c1.json',
      'undo/index.json',
      'undo/deep/op.json.gz',
      'tasks/tasks.json',
      'chromium/Cache/data_0',
    ];
    for (const each of files) {
      await writeFile(join(folder, each), '{}', { mode: 0o644 });
    }
    await chmod(folder, 0o755);
    const outside = join(folder, '..', 'outside');
    await mkdir(outside, { mode: 0o755 });
    await symlink(outside, join(folder, 'state', 'linked'));
    const said: string[] = [];
    const set = await closeDataFolder(folder, (text) => said.push(text));
    expect(said).toEqual([]);
    expect(await modeOf(folder)).toBe(0o700);
    for (const each of ['state', 'saved-queries', 'undo', 'undo/deep', 'tasks']) {
      expect(await modeOf(join(folder, each)), each).toBe(0o700);
    }
    for (const each of files.filter((file) => !file.startsWith('chromium/'))) {
      expect(await modeOf(join(folder, each)), each).toBe(0o600);
    }
    expect(await modeOf(join(folder, 'chromium'))).toBe(0o755);
    expect(await modeOf(join(folder, 'chromium', 'Cache', 'data_0'))).toBe(0o644);
    expect(await modeOf(outside)).toBe(0o755);
    expect(set.changed).toBe(14);
    expect((await closeDataFolder(folder)).changed).toBe(0);
  });

  it('says once in the Log the modes it cannot set, and stops nothing', async () => {
    await mkdir(join(folder, 'state'), { recursive: true });
    for (const each of ['a.json', 'b.json', 'c.json']) {
      await writeFile(join(folder, 'state', each), '{}', { mode: 0o644 });
    }
    const refused = new Set([join(folder, 'state', 'a.json'), join(folder, 'state', 'b.json')]);
    const said: string[] = [];
    const set = await closeDataFolder(
      folder,
      (text) => said.push(text),
      (path, mode) => (refused.has(path) ? Promise.reject(new Error('EPERM')) : chmod(path, mode)),
    );
    expect(await modeOf(join(folder, 'state', 'c.json'))).toBe(0o600);
    expect(await modeOf(join(folder, 'state'))).toBe(0o700);
    expect(set.failed).toBe(2);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(
      /^The data folder could not be made readable only by you: 2 modes not set, the first of .*state.[ab]\.json\.$/u,
    );
  });

  it('does nothing when the data folder is not there yet', async () => {
    expect(await closeDataFolder(join(folder, 'missing'))).toEqual({ changed: 0, failed: 0 });
  });
});
