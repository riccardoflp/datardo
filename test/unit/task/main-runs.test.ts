/**
 * The runs of scheduled tasks as the main process starts and records them (`src/main/task-runs.ts`,
 * `src/main/task-actions.ts`), without a server: what a run that cannot start logs and notifies, **Run now** while
 * a run is going, the notifications of the system while the window is hidden, and the app steps of the other cards.
 */
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newTaskForm } from '../../../src/features/task/edit';
import { runTask } from '../../../src/main/task-runs';
import { start } from '../../../src/runner/start';
import type { Json } from '../../../src/shared/engine-request';
import { featureId } from '../../../src/shared/ids';
import { appTarget } from '../../../src/shared/target';
import { at, localConnection, task } from './harness';
import { taskWorld, type TaskWorld } from './host-harness';

const missing = join(tmpdir(), 'datardo-m26-no-such-folder');

function startIn(world: TaskWorld, feature: string, args: Json) {
  return start(world.ports, { feature: featureId(feature), target: appTarget, args }, { startedBy: 'user' });
}

function newestRun(world: TaskWorld) {
  return world.state().tasks.states['t-1']?.runs[0];
}

describe('task.run', () => {
  it('fails a run whose folder does not exist, creates nothing, and notifies it', async () => {
    const world = taskWorld({
      connections: [localConnection],
      tasks: [task({ folder: missing })],
      now: at(2026, 11, 1, 2, 0, 5),
    });
    const result = await runTask(world.host, 't-1', 'schedule');
    const error = `The folder ${missing} doesn't exist (is the drive connected?)`;
    expect(result).toMatchObject({ kind: 'refused', code: 'task.run/no-folder' });
    expect(newestRun(world)).toMatchObject({ status: 'failed', trigger: 'schedule', error });
    expect(world.state().tasks.states['t-1']?.lastSlot).toBe(at(2026, 11, 1, 2, 0));
    expect(world.notices()).toEqual([`Scheduled task "Back up shop" failed: ${error}`]);
    expect(world.files.states.get('t-1')).toEqual(world.state().tasks.states['t-1']);
    expect(existsSync(missing)).toBe(false);
    expect(world.state().tasks.running).toEqual({});
  });

  it('skips the task of a removed connection, and one whose connection cannot be reached', async () => {
    const removed = taskWorld({ connections: [], tasks: [task()], now: at(2026, 11, 1, 2, 0, 5) });
    await runTask(removed.host, 't-1', 'schedule');
    expect(newestRun(removed)).toMatchObject({ status: 'skipped', error: 'The connection was removed' });
    expect(removed.notices()).toEqual(['Scheduled task "Back up shop" was skipped: The connection was removed']);

    const away = taskWorld({
      connections: [localConnection],
      tasks: [task()],
      now: at(2026, 11, 1, 2, 0, 5),
      connected: [],
    });
    away.unreachable.set(localConnection.id, 'connect ECONNREFUSED 127.0.0.1:27017');
    const result = await runTask(away.host, 't-1', 'schedule');
    expect(result).toMatchObject({ kind: 'refused', code: 'task.run/not-connected' });
    expect(newestRun(away)).toMatchObject({
      status: 'skipped',
      error: 'Connection unavailable: connect ECONNREFUSED 127.0.0.1:27017',
    });
    expect(away.state().tasks.states['t-1']?.lastSlot).toBe(at(2026, 11, 1, 2, 0));
  });

  it('says Run now while the task runs is already running, and starts nothing', async () => {
    const world = taskWorld({ connections: [localConnection], tasks: [task()], now: at(2026, 11, 1, 10, 0) });
    world.host.state.dispatch({
      slice: 'tasks',
      type: 'run-changed',
      task: task().id,
      run: { start: at(2026, 11, 1, 9, 59), trigger: 'manual' },
    });
    const result = await runTask(world.host, 't-1', 'manual');
    expect(result).toMatchObject({ kind: 'refused', code: 'task.run/running' });
    expect(world.state().tasks.message).toEqual({ text: '"Back up shop" is already running.', failed: true });
    expect(world.state().tasks.states['t-1']).toBeUndefined();
  });

  it('logs Run now of a disabled task as Run now and leaves the next run as it was', async () => {
    const world = taskWorld({
      connections: [localConnection],
      tasks: [task({ folder: missing, enabled: false })],
      now: at(2026, 11, 1, 10, 0),
    });
    await runTask(world.host, 't-1', 'manual');
    expect(newestRun(world)).toMatchObject({ trigger: 'manual', status: 'failed' });
    expect(world.state().tasks.states['t-1']?.lastSlot).toBeUndefined();
  });
});

describe('task.notify', () => {
  it('tells a failed run by the system while the window is hidden in the tray, and keeps it in the Log', async () => {
    const world = taskWorld({
      connections: [localConnection],
      tasks: [task({ folder: missing })],
      now: at(2026, 11, 1, 2, 0, 5),
    });
    world.hidden = true;
    await runTask(world.host, 't-1', 'schedule');
    expect(world.system).toEqual([
      `Scheduled task "Back up shop" failed: The folder ${missing} doesn't exist (is the drive connected?)`,
    ]);
    expect(world.notices()).toEqual([]);
    expect(world.state().runner.log.at(-1)?.text).toContain('[task.notify] Scheduled task "Back up shop" failed');
  });

  it('offers Show scheduled tasks, which opens the page, on the notification of a failed run', async () => {
    const world = taskWorld({
      connections: [localConnection],
      tasks: [task({ folder: missing })],
      now: at(2026, 11, 1, 2, 0, 5),
    });
    await runTask(world.host, 't-1', 'schedule');
    const actions = world.state().runner.notifications[0]?.actions ?? [];
    expect(actions).toEqual([
      { label: 'Show scheduled tasks', element: 'task.show@notification', feature: 'task.show', target: appTarget },
    ]);
  });
});

describe('task.missed', () => {
  it('records a run missed while Datardo was closed, and runs nothing', async () => {
    const world = taskWorld({ connections: [localConnection], tasks: [task()], now: at(2026, 11, 1, 9, 0) });
    await runTask(world.host, 't-1', 'missed');
    expect(newestRun(world)).toMatchObject({ status: 'missed', start: at(2026, 11, 1, 2, 0) });
    expect(world.notices()).toEqual([]);
  });
});

describe('task.edit', () => {
  it('says Could not save the task when the tasks cannot be written, and keeps the form open', async () => {
    const world = taskWorld({ connections: [localConnection], now: at(2026, 11, 1, 10, 0) });
    world.files.writable = false;
    const form = newTaskForm({ connection: localConnection.id, database: 'shop' }, [localConnection], 'D:\\backups');
    const result = await startIn(world, 'task.edit', { form: form as unknown as Json });
    expect(result.kind).toBe('failed');
    expect(world.state().tasks.message).toEqual({
      text: 'Could not save the task: the tasks were written by a newer version of Datardo',
      failed: true,
    });
    expect(world.state().tasks.tasks).toEqual([]);
  });

  it('saves a new task with the page message of its next run', async () => {
    const world = taskWorld({ connections: [localConnection], now: at(2026, 11, 1, 10, 0) });
    const form = newTaskForm({ connection: localConnection.id, database: 'shop' }, [localConnection], 'D:\\backups');
    expect((await startIn(world, 'task.edit', { form: form as unknown as Json })).kind).toBe('done');
    expect(world.files.tasks.map((each) => each.name)).toEqual(['Back up shop']);
    expect(world.state().tasks.message?.text).toBe('Saved "Back up shop" (Daily at 02:00). Next run: tomorrow 02:00.');
  });
});

describe('task.delete', () => {
  it('deletes the task and its run log, and nothing it wrote', async () => {
    const world = taskWorld({ connections: [localConnection], tasks: [task()], now: at(2026, 11, 1, 10, 0) });
    expect((await startIn(world, 'task.delete', { task: 't-1' })).kind).toBe('done');
    expect(world.files.tasks).toEqual([]);
    expect(world.files.deleted).toEqual(['t-1']);
    expect(world.state().tasks.tasks).toEqual([]);
  });
});

describe('task.enable', () => {
  it('saves the task disabled, then enabled again with its runs counted from now', async () => {
    const world = taskWorld({ connections: [localConnection], tasks: [task()], now: at(2026, 11, 1, 10, 0) });
    await startIn(world, 'task.enable', { task: 't-1', enabled: false });
    expect(world.files.tasks[0]?.enabled).toBe(false);
    await startIn(world, 'task.enable', { task: 't-1', enabled: true });
    expect(world.files.tasks[0]).toMatchObject({ enabled: true, since: at(2026, 11, 1, 10, 0) });
  });
});

describe('task.cancel', () => {
  it('has nothing to cancel when the task does not run', async () => {
    const world = taskWorld({ connections: [localConnection], tasks: [task()], now: at(2026, 11, 1, 10, 0) });
    expect((await startIn(world, 'task.cancel', { task: 't-1' })).kind).toBe('done');
    expect(world.state().tasks.states['t-1']).toBeUndefined();
  });
});
