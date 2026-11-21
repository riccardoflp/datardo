/**
 * The stored files of the scheduled tasks as the main process reads and writes them (`src/main/task-store.ts`): the
 * files recorded at version 1 (`test/fixtures/stored/tasks/v1/`), read whole; a task that has no state file yet; the
 * state of a deleted task deleted with it; and a tasks file of a newer Datardo, never written.
 */
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskStore } from '../../../src/main/task-store';

const recorded = join(import.meta.dirname, '..', '..', 'fixtures', 'stored', 'tasks', 'v1');

let folder = '';

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-task-store-'));
  await cp(recorded, folder, { recursive: true });
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function opened(): TaskStore {
  return new TaskStore(folder, (error) => {
    throw error;
  });
}

describe('task.show', () => {
  it('reads the tasks and the states recorded at version 1', async () => {
    const loaded = await opened().load();
    expect(loaded.found).toEqual({ kind: 'current' });
    expect(loaded.tasks.map((task) => [task.id, task.kind, task.engine])).toEqual([
      ['t-nightly', 'backup', 'mongodb'],
      ['t-orders', 'export', 'mongodb'],
    ]);
    expect(loaded.tasks[1]).toMatchObject({
      collection: 'orders',
      filter: '{ status: "open" }',
      schedule: { kind: 'weekly', days: [1, 4], time: '06:30' },
      runMissed: true,
    });
    expect(loaded.states['t-nightly']).toMatchObject({ lastSlot: 1762045200000, outputs: [{ size: 1048576 }] });
    expect(loaded.states['t-nightly']?.runs.map((run) => run.status)).toEqual(['done', 'missed']);
    expect(loaded.states['t-orders']).toEqual({ runs: [], outputs: [] });
  });
});

describe('task.delete', () => {
  it('deletes the state file of a deleted task, and writes the tasks without it', async () => {
    const store = opened();
    const loaded = await store.load();
    expect(store.saveTasks(loaded.tasks.filter((task) => task.id !== 't-nightly'))).toBe(true);
    await store.deleteState('t-nightly');
    await store.flush();
    expect(existsSync(join(folder, 'tasks', 't-nightly.json'))).toBe(false);
    const written = JSON.parse(await readFile(join(folder, 'tasks', 'tasks.json'), 'utf8')) as { tasks: unknown[] };
    expect(written.tasks).toHaveLength(1);
  });
});

describe('task.edit', () => {
  it('never writes a tasks file of a newer Datardo', async () => {
    const newer = JSON.stringify({ version: 2, tasks: [] });
    await writeFile(join(folder, 'tasks', 'tasks.json'), newer);
    const store = opened();
    expect((await store.load()).found).toEqual({ kind: 'newer', version: 2 });
    expect(store.isWritable()).toBe(false);
    expect(store.saveTasks([])).toBe(false);
    await store.flush();
    expect(await readFile(join(folder, 'tasks', 'tasks.json'), 'utf8')).toBe(newer);
  });
});
