import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../../src/storage/store';
import { taskStateFile, tasksFile, withTasks, type StoredTask, type StoredTaskState } from '../../../src/storage/tasks';
import type { ScheduledTask, TaskState } from '../../../src/features/task/types';
import { connectionId } from '../../../src/shared/ids';

const nightly: StoredTask = {
  id: 't-1',
  name: 'Back up shop',
  engine: 'mongodb',
  kind: 'backup',
  enabled: true,
  connection: connectionId('c-local'),
  database: 'shop',
  format: 'archive',
  folder: 'D:\\backups',
  pattern: '{name}_{date}_{time}',
  schedule: { kind: 'weekly', days: [1, 4], time: '02:00' },
  keep: 7,
  runMissed: false,
  notifySuccess: true,
  since: 1_762_000_000_000,
};

const state: StoredTaskState = {
  lastSlot: 1_762_900_000_000,
  runs: [
    {
      start: 1_762_900_000_000,
      end: 1_762_900_012_400,
      trigger: 'schedule',
      status: 'done',
      output: 'D:\\backups\\shop.agz',
      size: 10,
      documents: 3,
      collections: 1,
      deleted: 1,
    },
    { start: 1_762_800_000_000, end: 1_762_800_000_000, trigger: 'schedule', status: 'missed', error: 'asleep' },
  ],
  outputs: [{ path: 'D:\\backups\\shop.agz', at: 1_762_900_000_000, size: 10, folder: false }],
};

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-tasks-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function stored(path: string, content: unknown): Promise<void> {
  await mkdir(join(folder, 'tasks'), { recursive: true });
  await writeFile(join(folder, 'tasks', path), typeof content === 'string' ? content : JSON.stringify(content));
}

describe('the scheduled tasks file', () => {
  it('has the shapes of the features, which src/storage may not import (R1.3)', () => {
    // These compile only while the shapes stay the same: a task of the features is a stored task, and a stored state
    // is a state of the features and back.
    const toStored = (task: ScheduledTask): StoredTask => task;
    const toStoredState = (value: TaskState): StoredTaskState => value;
    const fromStoredState = (value: StoredTaskState): TaskState => value;
    expect(toStoredState(fromStoredState(state))).toBe(state);
    expect(toStored).toBeTypeOf('function');
  });

  it('writes the tasks at version 1 in tasks/tasks.json and reads them back', async () => {
    const store = new Store(folder, tasksFile);
    expect(await store.load()).toEqual({ kind: 'missing' });
    store.set(withTasks(store.get(), [nightly]));
    await store.flush();
    const object = JSON.parse(await readFile(join(folder, 'tasks', 'tasks.json'), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(object)[0]).toBe('version');
    expect(object['version']).toBe(1);
    const again = new Store(folder, tasksFile);
    expect(await again.load()).toEqual({ kind: 'current' });
    expect(again.get().tasks).toEqual([nightly]);
  });

  it('keeps the fields it does not know, on a task and at the top', async () => {
    await stored('tasks.json', { version: 1, later: 1, tasks: [{ ...nightly, colour: 'red' }] });
    const store = new Store(folder, tasksFile);
    await store.load();
    store.set(withTasks(store.get(), [{ ...nightly, name: 'Nightly' }]));
    await store.flush();
    const object = JSON.parse(await readFile(join(folder, 'tasks', 'tasks.json'), 'utf8')) as {
      later: number;
      tasks: Record<string, unknown>[];
    };
    expect(object.later).toBe(1);
    expect(object.tasks[0]).toMatchObject({ name: 'Nightly', colour: 'red', engine: 'mongodb' });
  });

  it('keeps a task it cannot read as it is, and loses no other task', async () => {
    const broken = { id: 't-2', name: 'Broken', schedule: 'often' };
    await stored('tasks.json', { version: 1, tasks: [broken, nightly] });
    const store = new Store(folder, tasksFile);
    await store.load();
    expect(store.get().tasks).toEqual([nightly]);
    store.set(withTasks(store.get(), [nightly]));
    await store.flush();
    const object = JSON.parse(await readFile(join(folder, 'tasks', 'tasks.json'), 'utf8')) as { tasks: unknown[] };
    expect(object.tasks).toEqual([nightly, broken]);
  });

  it('sets a damaged file aside and starts empty', async () => {
    await stored('tasks.json', '{ not json');
    const store = new Store(folder, tasksFile);
    const found = await store.load(new Date(Date.UTC(2026, 10, 11, 9)));
    expect(found.kind).toBe('damaged');
    expect(store.get().tasks).toEqual([]);
    expect((await readdir(join(folder, 'tasks'))).some((name) => name.startsWith('tasks.damaged-'))).toBe(true);
  });

  it('never writes a file of a newer version', async () => {
    await stored('tasks.json', { version: 2, tasks: [nightly] });
    const store = new Store(folder, tasksFile);
    expect(await store.load()).toEqual({ kind: 'newer', version: 2 });
    expect(store.set(withTasks(store.get(), []))).toBe(false);
  });
});

describe('the state file of a task', () => {
  it('writes the state at version 1 in tasks/<id>.json and reads it back', async () => {
    const store = new Store(folder, taskStateFile('t-1'));
    await store.load();
    expect(store.get()).toEqual({ runs: [], outputs: [] });
    store.set({ ...state, running: { start: 1, trigger: 'manual' } });
    await store.flush();
    const object = JSON.parse(await readFile(join(folder, 'tasks', 't-1.json'), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(object)[0]).toBe('version');
    const again = new Store(folder, taskStateFile('t-1'));
    expect(await again.load()).toEqual({ kind: 'current' });
    expect(again.get()).toEqual({ ...state, running: { start: 1, trigger: 'manual' } });
  });

  it('leaves out runs and outputs it cannot read', async () => {
    await stored('t-1.json', {
      version: 1,
      runs: [{ start: 'yesterday' }, ...state.runs],
      outputs: [{ path: 5 }, ...state.outputs],
    });
    const store = new Store(folder, taskStateFile('t-1'));
    await store.load();
    expect(store.get().runs).toEqual(state.runs);
    expect(store.get().outputs).toEqual(state.outputs);
  });

  it('refuses an id that is not a file name', () => {
    expect(() => taskStateFile('../secrets')).toThrow();
    expect(() => taskStateFile('tasks')).toThrow();
  });
});
