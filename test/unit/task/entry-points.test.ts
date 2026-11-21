/**
 * Where the scheduled tasks are reached from: the scheduler of the main process (`task.run`, with a clock the test
 * drives), the page opened from the rail, the tree and the status line (`task.show`), the form opened by **New
 * task…**, **Schedule…** and **Edit** (`task.edit`), and the queue a run waits in (`runner.run`).
 */
import { describe, expect, it } from 'vitest';
import { formRequestKey, formRequestOf, openForm, taskForm } from '../../../src/features/task/editing/form-request';
import { open as openPage } from '../../../src/features/task/show';
import { view as statusLine } from '../../../src/features/nav/status-line';
import { view as connectionMenu } from '../../../src/features/connection/menu';
import { view as treePages } from '../../../src/features/tree/pages';
import { Scheduler, type SchedulerClock } from '../../../src/main/task-scheduler';
import { queueKeys } from '../../../src/runner/run';
import type { Plan } from '../../../src/shared/feature';
import { noDanger } from '../../../src/shared/feature';
import type { Target } from '../../../src/shared/target';
import { input } from '../nav/inputs';
import { inputOf } from '../tree/context';
import { appStateWith, at, cacheConnection, contextOf, localConnection, task, tasksWith } from './harness';

interface Timer {
  readonly run: () => void;
  readonly milliseconds: number;
}

function fakeClock(now: () => number): { readonly clock: SchedulerClock; readonly timers: Timer[] } {
  const timers: Timer[] = [];
  return {
    timers,
    clock: {
      now,
      setTimer: (run, milliseconds) => {
        timers.push({ run, milliseconds });
        return timers.length;
      },
      clearTimer: () => undefined,
    },
  };
}

describe('task.run', () => {
  it('is checked 3 seconds after start, then every 15 seconds, for each task due', async () => {
    let now = at(2026, 11, 1, 1, 59, 50);
    const state = appStateWith(tasksWith([task({ since: at(2026, 10, 31, 12, 0) })]));
    const started: string[] = [];
    const { clock, timers } = fakeClock(() => now);
    const scheduler = new Scheduler(
      {
        state: () => state,
        isStarting: () => false,
        run: (id, trigger) => {
          started.push(`${id} ${trigger}`);
          return Promise.resolve();
        },
      },
      clock,
    );
    scheduler.start();
    expect(timers.map((each) => each.milliseconds)).toEqual([3_000]);
    timers[0]?.run();
    expect(started).toEqual([]);
    now = at(2026, 11, 1, 2, 0, 8);
    timers[1]?.run();
    expect(timers.map((each) => each.milliseconds)).toEqual([3_000, 15_000, 15_000]);
    expect(started).toEqual(['t-1 schedule']);
    scheduler.stop();
    timers[2]?.run();
    expect(timers).toHaveLength(3);
    expect(await scheduler.check()).toHaveLength(1);
  });

  it('leaves alone a task whose run is starting or going, and starts a missed run as missed', async () => {
    const now = at(2026, 11, 1, 9, 0);
    const running = appStateWith(tasksWith([task()], {}, { 't-1': { start: now, trigger: 'manual' } }));
    const started: string[] = [];
    const run = (id: string, trigger: string): Promise<void> => {
      started.push(`${id} ${trigger}`);
      return Promise.resolve();
    };
    await new Scheduler({ state: () => running, isStarting: () => false, run }, fakeClock(() => now).clock).check();
    const idle = appStateWith(tasksWith([task()]));
    await new Scheduler({ state: () => idle, isStarting: () => true, run }, fakeClock(() => now).clock).check();
    expect(started).toEqual([]);
    await new Scheduler({ state: () => idle, isStarting: () => false, run }, fakeClock(() => now).clock).check();
    expect(started).toEqual(['t-1 missed']);
  });
});

describe('runner.run', () => {
  const plan = (steps: Plan['steps']): Plan => ({
    title: 'A plan',
    steps,
    danger: noDanger,
    undo: { cannot: '' },
    publishes: false,
    after: [],
  });

  it('runs a plan that writes files behind the plans on the same files, not behind the other plans of the app', () => {
    const write = { kind: 'file', action: 'write', path: 'D:\\backups\\shop.agz', text: 'write' } as const;
    const app = { kind: 'app', action: 'task.start-run', args: null, text: 'start' } as const;
    expect(queueKeys(plan([app, write]))).toEqual(['file:D:\\backups\\shop.agz']);
    expect(queueKeys(plan([app]))).toEqual(['app']);
  });
});

describe('task.show', () => {
  it('opens the one Scheduled tasks tab, and reveals the output of a run in the file manager', () => {
    const context = contextOf('task.show', appStateWith(tasksWith([])), at(2026, 11, 1));
    const opened = openPage.plan(context, { args: null });
    expect(opened).toMatchObject({ kind: 'run', plan: { steps: [], after: [{ kind: 'open', page: 'tasks' }] } });
    const revealed = openPage.plan(context, { args: { reveal: 'D:\\backups\\shop.agz' } });
    expect(revealed).toMatchObject({
      kind: 'run',
      plan: { steps: [{ kind: 'app', action: 'transfer.reveal-path', args: { path: 'D:\\backups\\shop.agz' } }] },
    });
  });

  it('is on the status line as 1 task running, and among the pages of a MongoDB connection in the tree', () => {
    expect(statusLine(input({ tasksRunning: 1 })).tasks).toEqual({
      text: '1 task running',
      element: 'task.show@status-line',
    });
    expect(statusLine(input({ tasksRunning: 2 })).tasks?.text).toBe('2 tasks running');
    expect(statusLine(input()).tasks).toBeUndefined();
    const page = treePages(inputOf()).find((node) => node.name === 'Scheduled tasks');
    expect(page?.click).toMatchObject({ element: 'task.show@tree', feature: 'task.show' });
  });
});

describe('task.edit', () => {
  const on = (target: Target, args: Record<string, string> | null = null, folder?: string) =>
    openForm(
      { ...contextOf('task.edit', appStateWith(tasksWith([task()])), at(2026, 11, 1, 10, 0)), target },
      { args, ...(folder === undefined ? {} : { folder }) },
    );

  it('reads the default folder, then opens the page with the form of a new task of the database', () => {
    const database: Target = { kind: 'database', connection: localConnection.id, database: 'shop' };
    expect(on(database)).toMatchObject({ kind: 'read', need: { key: 'folder', read: 'task.edit:default-folder' } });
    const outcome = on(database, null, 'D:\\backups');
    expect(outcome.kind).toBe('run');
    const after = outcome.kind === 'run' ? outcome.plan.after : [];
    expect(after).toEqual([
      {
        kind: 'remember',
        key: formRequestKey,
        value: {
          asked: at(2026, 11, 1, 10, 0),
          source: { connection: 'c-local', database: 'shop' },
          folder: 'D:\\backups',
        },
      },
      { kind: 'open', page: 'tasks' },
    ]);
    const request = formRequestOf(after[0]?.kind === 'remember' ? after[0].value : null);
    expect(request?.source).toEqual({ connection: 'c-local', database: 'shop' });
  });

  it('opens the form of a task edited, as it was saved, and no source on a Redis connection', () => {
    const outcome = on({ kind: 'app' }, { task: 't-1' });
    expect(outcome.kind === 'run' ? outcome.plan.after[0] : undefined).toEqual({
      kind: 'remember',
      key: formRequestKey,
      value: { asked: at(2026, 11, 1, 10, 0), task: 't-1' },
    });
    expect(taskForm(task())).toMatchObject({ name: 'Back up shop', database: 'shop', when: 'daily', keep: '7' });
    const redis = on({ kind: 'connection', connection: cacheConnection.id }, null, 'D:\\backups');
    const value = redis.kind === 'run' && redis.plan.after[0]?.kind === 'remember' ? redis.plan.after[0].value : null;
    expect(formRequestOf(value)?.source).toEqual({});
  });

  it('offers Schedule… in the menu of the connection island of a MongoDB connection, read-only too, not of Redis', () => {
    const labels = (connection: typeof localConnection, place: 'connection-island' | 'home') =>
      connectionMenu({ connections: appStateWith(tasksWith([])).connections, connection, place }).entries.flatMap(
        (entry) => (entry.kind === 'item' && entry.feature === 'task.edit' ? [entry.element] : []),
      );
    expect(labels(localConnection, 'connection-island')).toEqual(['task.edit@connection-island']);
    expect(labels({ ...localConnection, readOnly: true }, 'connection-island')).toEqual([
      'task.edit@connection-island',
    ]);
    expect(labels(cacheConnection, 'connection-island')).toEqual([]);
    expect(labels(localConnection, 'home')).toEqual([]);
  });
});
