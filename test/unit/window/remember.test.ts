import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { plan, rememberDelayMs } from '../../../src/features/window/remember';
import { placement } from '../../../src/features/window/placement';
import { windowFile } from '../../../src/main/window-file';
import { Store } from '../../../src/storage/store';
import { contextFor, planOf, startedWith } from './context';

const display = { left: 0, top: 0, width: 1920, height: 1040 };
let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-window-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function saveAndReopen(
  saved: Parameters<typeof plan>[1]['args'],
): Promise<Store<ReturnType<typeof windowFile.empty>>> {
  const store = new Store(folder, windowFile);
  await store.load();
  const step = planOf(plan(contextFor('window.remember'), startedWith(saved as never))).steps[0];
  if (step?.kind === 'app') {
    store.set({ ...store.get(), placement: step.args as never });
  }
  await store.flush();
  const again = new Store(folder, windowFile);
  await again.load();
  return again;
}

describe('window.remember', () => {
  it('saves the size and place of the window in one app step', () => {
    const outcome = plan(
      contextFor('window.remember'),
      startedWith({ left: 200, top: 100, width: 1000, height: 700, maximized: false }),
    );
    expect(planOf(outcome).steps).toEqual([
      {
        kind: 'app',
        text: 'save the size and place of the window',
        action: 'window.save-placement',
        args: { left: 200, top: 100, width: 1000, height: 700, maximized: false },
      },
    ]);
    expect(planOf(outcome).danger).toEqual({ kind: 'none' });
    expect(rememberDelayMs).toBe(500);
  });

  it('a window of 1,000 × 700 at 200, 100 opens again 1,000 × 700 at 200, 100', async () => {
    const again = await saveAndReopen({ left: 200, top: 100, width: 1000, height: 700, maximized: false });
    expect(placement(again.get().placement, [display])).toEqual({
      left: 200,
      top: 100,
      width: 1000,
      height: 700,
      maximized: false,
    });
  });

  it('a maximized window opens maximized, with the size it had before it was maximized', async () => {
    const again = await saveAndReopen({ left: 150, top: 90, width: 1100, height: 720, maximized: true });
    expect(placement(again.get().placement, [display])).toEqual({
      left: 150,
      top: 90,
      width: 1100,
      height: 720,
      maximized: true,
    });
  });

  it('writes window.json at version 1 and keeps the fields it does not know', async () => {
    await writeFile(join(folder, 'window.json'), JSON.stringify({ version: 1, islands: { explorer: 280 } }));
    await saveAndReopen({ left: 1, top: 2, width: 800, height: 600, maximized: false });
    const written = JSON.parse(await readFile(join(folder, 'window.json'), 'utf8')) as Record<string, unknown>;
    expect(written).toEqual({
      version: 1,
      left: 1,
      top: 2,
      width: 800,
      height: 600,
      maximized: false,
      islands: { explorer: 280 },
    });
  });

  it('started with nothing usable, saves nothing', () => {
    expect(planOf(plan(contextFor('window.remember'), startedWith({ left: 'x' }))).steps).toEqual([]);
  });

  it('a window.json that is not JSON gives the default size and place, set aside and not deleted', async () => {
    await writeFile(join(folder, 'window.json'), 'not json at all');
    const store = new Store(folder, windowFile);
    const found = await store.load(new Date(Date.UTC(2026, 10, 18, 9, 30)));
    expect(found.kind).toBe('damaged');
    expect(placement(store.get().placement, [display])).toEqual({
      left: 320,
      top: 120,
      width: 1280,
      height: 800,
      maximized: false,
    });
    const names = await readdir(folder);
    expect(names.some((name) => name.startsWith('window.damaged-'))).toBe(true);
  });

  it('a window.json of a newer version gives the default window and is never written', async () => {
    const newer = JSON.stringify({ version: 2, frame: { x: 5 } });
    await writeFile(join(folder, 'window.json'), newer);
    const store = new Store(folder, windowFile);
    expect((await store.load()).kind).toBe('newer');
    expect(placement(store.get().placement, [display]).width).toBe(1280);
    expect(store.set({ others: {}, placement: { left: 0, top: 0, width: 900, height: 600, maximized: false } })).toBe(
      false,
    );
    await store.flush();
    expect(await readFile(join(folder, 'window.json'), 'utf8')).toBe(newer);
  });

  it('a data folder that cannot be written is not an error for the user', async () => {
    const errors: unknown[] = [];
    const store = new Store(join(folder, 'file-not-folder', 'x'), windowFile, (error) => errors.push(error));
    await writeFile(join(folder, 'file-not-folder'), 'a file where a folder should be');
    await store.load();
    store.set({ others: {}, placement: { left: 0, top: 0, width: 900, height: 600, maximized: false } });
    await expect(store.flush()).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });
});
