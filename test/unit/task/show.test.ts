import { at, cacheConnection, localConnection, task, tasksWith } from './harness';
import { describe, expect, it } from 'vitest';
import { durationText, runningText, sizeText, view, type ShowState } from '../../../src/features/task/show';
import type { ScheduledTask, TaskState, TasksState } from '../../../src/features/task/types';
import { reduceTasks, taskId } from '../../../src/features/task/types';
import { initialSettingsState, type SettingsState } from '../../../src/shared/state/settings';

const connections = [localConnection, cacheConnection];
const wednesday = at(2026, 11, 11, 1);
const trayOn: SettingsState = { ...initialSettingsState, stored: { 'datardo.task.keepRunningInTray': true } };

function page(tasks: TasksState, more: Partial<ShowState> = {}) {
  return view({ tasks, connections, settings: initialSettingsState, now: wednesday, ...more });
}

function only(scheduled: ScheduledTask, state?: TaskState, more: Partial<TasksState> = {}) {
  const tasks = { ...tasksWith([scheduled], state === undefined ? {} : { [scheduled.id]: state }), ...more };
  return page(tasks).items[0];
}

describe('task.show', () => {
  it('says what tasks are for when there is none', () => {
    const shown = page(tasksWith([]));
    expect(shown.empty).toEqual({
      text: 'No scheduled tasks yet. New task… (or Schedule… on a connection, a database or a collection) backs up or exports periodically.',
      newTask: { label: 'New task…', element: 'task.edit@empty-state' },
    });
    expect(shown.items).toEqual([]);
  });

  it('counts the tasks and the enabled ones in the toolbar, beside New task…', () => {
    const tasks = [task(), task({ id: taskId('t-2') }), task({ id: taskId('t-3'), enabled: false })];
    expect(page(tasksWith(tasks)).toolbar).toEqual({
      summary: '3 tasks, 2 enabled',
      newTask: { label: 'New task…', element: 'task.edit@toolbar' },
    });
  });

  it('says the next run today, tomorrow or with its date, and — for a disabled task', () => {
    const handled: TaskState = { lastSlot: at(2026, 11, 10, 2), runs: [], outputs: [] };
    expect(only(task(), handled)?.next).toBe('today 02:00');
    const today = { [task().id]: { ...handled, lastSlot: at(2026, 11, 11, 2) } };
    expect(page(tasksWith([task()], today), { now: at(2026, 11, 11, 3) }).items[0]?.next).toBe('tomorrow 02:00');
    const friday = task({ schedule: { kind: 'weekly', days: [5], time: '02:00' } });
    expect(only(friday, { ...handled, lastSlot: at(2026, 11, 6, 2) })?.next).toBe('Fri 13 Nov 02:00');
    expect(only(task({ enabled: false }), handled)?.next).toBe('—');
  });

  it('shows the last run with its result and when, running while it runs, and never without runs', () => {
    const done: TaskState = {
      runs: [
        {
          start: at(2026, 11, 10, 2),
          end: at(2026, 11, 10, 2) + 12_400,
          trigger: 'schedule',
          status: 'done',
          collections: 2,
          documents: 1200,
          size: 3_565_158,
        },
      ],
      outputs: [],
    };
    expect(only(task(), done)?.last).toEqual({
      status: 'done',
      text: 'done',
      when: 'yesterday 02:00',
      details: '2 collections, 1,200 documents, 3.4 MB, 12.4 s',
    });
    const failed: TaskState = {
      runs: [
        {
          start: at(2026, 11, 10, 2),
          end: at(2026, 11, 10, 2),
          trigger: 'schedule',
          status: 'failed',
          error: 'disk full',
        },
      ],
      outputs: [],
    };
    expect(only(task(), failed)?.last).toMatchObject({ status: 'failed', text: 'failed', details: 'disk full' });
    const running = {
      running: {
        [task().id]: { start: wednesday, trigger: 'manual' as const, progress: 'shop.orders: 12,000 documents' },
      },
    };
    expect(only(task(), undefined, running)?.last).toEqual({
      status: 'running',
      text: 'running',
      details: 'shop.orders: 12,000 documents',
    });
    expect(only(task(), undefined, running)?.button).toMatchObject({ kind: 'cancel', element: 'task.cancel@list' });
    expect(only(task())?.last).toEqual({ status: 'never', text: 'never' });
  });

  it('shows in the details what the task writes, keeps and does with missed runs, then its runs', () => {
    const exported = task({
      kind: 'export',
      collection: 'orders',
      format: 'csv',
      filter: '{ status: "open" }',
      projection: '{ total: 1 }',
      runMissed: true,
      keep: 3,
    });
    const state: TaskState = {
      runs: [
        {
          start: at(2026, 11, 10, 2),
          end: at(2026, 11, 10, 2) + 2000,
          trigger: 'manual',
          status: 'done',
          documents: 3,
          size: 10,
          deleted: 2,
          output: 'D:\\backups\\orders_2026-11-10_02-00-00.csv',
        },
      ],
      outputs: [
        { path: 'D:\\backups\\orders_2026-11-10_02-00-00.csv', at: at(2026, 11, 10, 2), size: 10, folder: false },
      ],
    };
    const details = only(exported, state, { open: [exported.id] })?.details;
    expect(details?.facts).toEqual([
      'Writes: CSV in D:\\backups, named {name}_{date}_{time}',
      'Query: filter { status: "open" }, projection { total: 1 }',
      'Keeps: the last 3 files it wrote',
      'Missed runs: run when Datardo starts',
    ]);
    expect(details?.runs).toEqual([
      {
        started: 'yesterday 02:00',
        how: 'Run now',
        status: 'done',
        result: 'done',
        details: '3 documents, 10 B, 2.0 s. 2 old outputs deleted',
        output: {
          name: 'orders_2026-11-10_02-00-00.csv',
          path: 'D:\\backups\\orders_2026-11-10_02-00-00.csv',
          deleted: false,
        },
      },
    ]);
    expect(only(task({ keep: 0 }), undefined, { open: [task().id] })?.details).toEqual({
      facts: ['Writes: Archive (.agz) in D:\\backups, named {name}_{date}_{time}', 'Keeps: everything it writes'],
      noRuns: 'No runs yet.',
      runs: [],
    });
    expect(only(task({ format: 'gzip', keep: 2 }), undefined, { open: [task().id] })?.details?.facts[1]).toBe(
      'Keeps: the last 2 folders it wrote',
    );
  });

  it('greys an output that retention deleted, with the tooltip Deleted by retention', () => {
    const state: TaskState = {
      runs: [{ start: 1, end: 2, trigger: 'schedule', status: 'done', output: 'D:\\backups\\gone.agz' }],
      outputs: [],
    };
    expect(only(task(), state, { open: [task().id] })?.details?.runs[0]?.output).toEqual({
      name: 'gone.agz',
      path: 'D:\\backups\\gone.agz',
      deleted: true,
      tooltip: 'Deleted by retention',
    });
  });

  it('keeps the details open in the state of the session, and closes them on a second toggle', () => {
    const opened = reduceTasks(tasksWith([task()]), { slice: 'tasks', type: 'details-toggled', task: task().id });
    expect(page(opened).items[0]?.details).toBeDefined();
    const closed = reduceTasks(opened, { slice: 'tasks', type: 'details-toggled', task: task().id });
    expect(page(closed).items[0]?.details).toBeUndefined();
  });

  it('notes that tasks run while Datardo is open, unless the tray keeps it running or no task is enabled', () => {
    expect(page(tasksWith([task()])).trayNote).toEqual({
      text: 'Tasks run while Datardo is open.',
      link: 'Keep running in the tray',
      setting: 'datardo.task.keepRunningInTray',
    });
    expect(page(tasksWith([task()]), { settings: trayOn }).trayNote).toBeUndefined();
    expect(page(tasksWith([task({ enabled: false })])).trayNote).toBeUndefined();
  });

  it('lists no task of a Redis connection', () => {
    const redis = task({ id: taskId('t-9'), engine: 'redis', connection: cacheConnection.id });
    expect(page(tasksWith([redis])).items).toEqual([]);
  });

  it('shows the item with its kind, its source in its connection color, its schedule and its menu', () => {
    expect(only(task())).toMatchObject({
      name: 'Back up shop',
      kind: 'Backup, Archive (.agz)',
      source: { text: 'Local › shop (all collections)', color: 'blue', removed: false },
      schedule: 'Daily at 02:00',
      button: { kind: 'run', label: 'Run now', tooltip: 'Run it once now (the schedule stays as it is)' },
      menu: [
        { label: 'Edit', element: 'task.edit@item-menu' },
        { label: 'Delete', element: 'task.delete@item-menu', tooltip: 'Delete the task (the files it wrote stay)' },
      ],
    });
    const { database: _database, ...everything } = task();
    expect(only(everything)?.source.text).toBe('Local › all databases');
    expect(only(task({ connection: localConnection.id, collection: 'orders' }))?.source.text).toBe(
      'Local › shop.orders',
    );
  });

  it('says that the connection of a task was removed, in the error color', () => {
    const orphan = task({ connection: 'c-gone' as typeof localConnection.id, collection: 'orders' });
    expect(only(orphan)?.source).toEqual({ text: 'The connection was removed › shop.orders', removed: true });
  });

  it('counts the tasks running for the status line', () => {
    const one = tasksWith([task()], {}, { [task().id]: { start: 1, trigger: 'manual' } });
    expect(runningText(one)).toBe('1 task running');
    expect(runningText({ ...one, running: { ...one.running, 't-2': { start: 1, trigger: 'manual' } } })).toBe(
      '2 tasks running',
    );
    expect(runningText(tasksWith([task()]))).toBe('');
  });

  it('writes sizes and durations as the cards do', () => {
    expect([sizeText(512), sizeText(1536), sizeText(12 * 1024 * 1024)]).toEqual(['512 B', '1.5 KB', '12 MB']);
    expect([durationText(12_400), durationText(200_000), durationText(3_900_000)]).toEqual([
      '12.4 s',
      '3 min 20 s',
      '1 h 5 min',
    ]);
  });

  it('shows the last message of the page', () => {
    const message = { text: 'Saved "Back up shop" (Daily at 02:00). It is disabled.', failed: false };
    expect(page({ ...tasksWith([task()]), message }).message).toEqual(message);
  });
});
