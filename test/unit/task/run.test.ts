import {
  appStateWith,
  at,
  cacheConnection,
  connection,
  contextOf,
  local,
  localConnection,
  stepsOf,
  stepTexts,
  task,
  tasksWith,
} from './harness';
import { describe, expect, it } from 'vitest';
import { dueTasks, nextTaskRun } from '../../../src/features/task/due';
import { finishedRun, plan, refusedRunStatus, startedRun } from '../../../src/features/task/run';
import type { ScheduledTask, TaskOutput, TaskState } from '../../../src/features/task/types';
import type { FileStep } from '../../../src/shared/feature';

const nightly = task({ schedule: { kind: 'daily', time: '02:00' }, keep: 0 });
const first = at(2026, 11, 1, 2, 0, 0);
const handled: TaskState = { lastSlot: at(2026, 10, 31, 2), runs: [], outputs: [] };

function runAt(
  scheduled: ScheduledTask,
  now: number,
  answers: Readonly<Record<string, unknown>> = {},
  state: TaskState = handled,
) {
  const tasks = tasksWith([scheduled], { [scheduled.id]: state });
  return plan(contextOf('task.run', appStateWith(tasks), now), {
    args: { task: scheduled.id, trigger: 'schedule' },
    ...answers,
  });
}

function written(outcome: ReturnType<typeof plan>): FileStep | undefined {
  return stepsOf(outcome).find((step): step is FileStep => step.kind === 'file' && step.action === 'write');
}

describe('task.run', () => {
  it('writes a daily backup of shop named by the default pattern, with a number when the name exists', () => {
    const outcome = runAt(nightly, first);
    expect(stepTexts(outcome)).toEqual([
      'start the run of "Back up shop"',
      'write D:\\backups\\shop_2026-11-01_02-00-00.agz',
      'record the run of "Back up shop"',
    ]);
    expect(written(outcome)?.content).toEqual({
      writer: 'backup.create',
      args: { task: 't-1', connection: 'c-local', database: 'shop', collection: null, format: 'archive' },
    });
    const again = runAt(nightly, first, { disk: { taken: ['shop_2026-11-01_02-00-00.agz'] } });
    expect(written(again)?.path).toBe('D:\\backups\\shop_2026-11-01_02-00-00_2.agz');
    expect(outcome).toMatchObject({ kind: 'run', plan: { danger: { kind: 'none' }, publishes: false } });
  });

  it('exports with the filter and the projection of the task', () => {
    const exported = task({
      kind: 'export',
      collection: 'orders',
      format: 'jsonl',
      filter: '{ status: "open" }',
      projection: '{ total: 1 }',
    });
    expect(written(runAt(exported, at(2026, 11, 11, 2)))?.content).toEqual({
      writer: 'transfer.export',
      args: {
        task: 't-1',
        connection: 'c-local',
        database: 'shop',
        collection: 'orders',
        format: 'jsonl',
        filter: '{ status: "open" }',
        projection: '{ total: 1 }',
        batchSize: 1000,
      },
    });
  });

  it('fails without writing when the folder does not exist', () => {
    expect(runAt(nightly, first, { disk: { folder: 'missing' } })).toEqual({
      kind: 'refuse',
      code: 'task.run/no-folder',
      message: "The folder D:\\backups doesn't exist (is the drive connected?)",
    });
    expect(refusedRunStatus('task.run/no-folder')).toBe('failed');
  });

  it('refuses an export without a collection', () => {
    expect(runAt(task({ kind: 'export', format: 'json' }), first)).toMatchObject({
      kind: 'refuse',
      code: 'task.run/invalid',
      message: 'An export needs a database and a collection.',
    });
  });

  it('runs a disabled task once with Run now, logged as Run now, without changing its next run', () => {
    const disabled = { ...nightly, enabled: false };
    const now = at(2026, 11, 11, 15);
    const tasks = tasksWith([disabled], { [disabled.id]: handled });
    const outcome = plan(contextOf('task.run', appStateWith(tasks), now), { args: { task: disabled.id } });
    expect(stepsOf(outcome)[0]).toMatchObject({ action: 'task.start-run', args: { trigger: 'manual', slot: null } });
    const enabled = { ...nightly };
    const before = nextTaskRun(enabled, handled);
    const started = startedRun(handled, { start: now, trigger: 'manual' });
    const ended = finishedRun(enabled, started, { kind: 'failed', error: 'x' }, now + 1000);
    expect(nextTaskRun(enabled, ended)).toBe(before);
    expect(ended.runs[0]).toMatchObject({ trigger: 'manual', status: 'failed' });
  });

  it('says a task is already running and starts nothing', () => {
    const tasks = tasksWith([nightly], {}, { [nightly.id]: { start: first, trigger: 'schedule' } });
    const outcome = plan(contextOf('task.run', appStateWith(tasks), first), { args: { task: nightly.id } });
    expect(outcome).toEqual({
      kind: 'refuse',
      code: 'task.run/running',
      message: '"Back up shop" is already running.',
    });
    expect(refusedRunStatus('task.run/running')).toBeUndefined();
  });

  it('skips a run due while the previous one is still going, and says so on the running one', () => {
    const hourly = task({ schedule: { kind: 'hours', every: 1, time: '00:00' } });
    const start = at(2026, 11, 11, 2);
    const running = startedRun(
      { lastSlot: at(2026, 11, 11, 1), runs: [], outputs: [] },
      {
        start,
        trigger: 'schedule',
        slot: start,
      },
    );
    expect(
      dueTasks(
        tasksWith([hourly], { [hourly.id]: running }, { [hourly.id]: { start, trigger: 'schedule' } }),
        at(2026, 11, 11, 3, 1),
      ),
    ).toEqual([]);
    const output: TaskOutput = { path: 'D:\\backups\\shop.agz', at: start, size: 10, folder: false };
    const ended = finishedRun(hourly, running, { kind: 'done', output, documents: 3 }, at(2026, 11, 11, 3, 5));
    expect(ended.runs[0]?.note).toBe('The run due at 03:00 was skipped: this one was still going');
    expect(local(ended.lastSlot)).toBe('2026-11-11 03:00');
    expect(ended.running).toBeUndefined();
    expect(ended.outputs).toEqual([output]);
  });

  it('logs a run cut short by a quit as failed at the next run', () => {
    const cut: TaskState = { ...handled, running: { start: at(2026, 11, 10, 2), trigger: 'schedule' } };
    const started = startedRun(cut, { start: first, trigger: 'schedule', slot: first });
    expect(started.runs[0]).toEqual({
      start: at(2026, 11, 10, 2),
      end: first,
      trigger: 'schedule',
      status: 'failed',
      error: 'Interrupted: Datardo was closed during the run',
    });
    expect(started).toMatchObject({ lastSlot: first, running: { start: first, trigger: 'schedule', slot: first } });
  });

  it('skips the run of a removed connection, or of a connection that cannot be reached', () => {
    const removed = { ...nightly, connection: cacheConnection.id };
    expect(runAt(removed, first)).toEqual({
      kind: 'refuse',
      code: 'task.run/no-connection',
      message: 'The connection was removed',
    });
    expect(refusedRunStatus('task.run/no-connection')).toBe('skipped');
    expect(refusedRunStatus('task.run/not-connected')).toBe('skipped');
    const started = startedRun(handled, { start: first, trigger: 'schedule', slot: first });
    const ended = finishedRun(
      nightly,
      started,
      { kind: 'skipped', error: 'Connection unavailable: connect ECONNREFUSED' },
      first + 2000,
    );
    expect(ended.runs[0]).toMatchObject({ status: 'skipped', error: 'Connection unavailable: connect ECONNREFUSED' });
    expect(ended.lastSlot).toBe(first);
  });

  it('runs the task of a read-only connection', () => {
    const readOnly = connection('c-local', 'Local', { readOnly: true });
    const tasks = tasksWith([nightly], { [nightly.id]: handled });
    const outcome = plan(contextOf('task.run', appStateWith(tasks, [readOnly]), first), {
      args: { task: nightly.id, trigger: 'schedule' },
    });
    expect(written(outcome)?.path).toBe('D:\\backups\\shop_2026-11-01_02-00-00.agz');
  });

  it('does nothing for a run of the schedule that is no longer due', () => {
    expect(stepsOf(runAt(nightly, first, {}, { ...handled, lastSlot: first }))).toEqual([]);
    expect(stepsOf(runAt(nightly, at(2026, 11, 1, 1, 59)))).toEqual([]);
  });

  it('deletes the outputs beyond Keep after recording the new one, and goes on when one cannot be deleted', () => {
    const old: TaskOutput = { path: 'D:\\backups\\shop_old.agz', at: at(2026, 10, 31, 2), size: 10, folder: false };
    const outcome = runAt({ ...nightly, keep: 1 }, first, {}, { ...handled, outputs: [old] });
    expect(stepTexts(outcome).slice(2)).toEqual([
      'record the run of "Back up shop"',
      'delete D:\\backups\\shop_old.agz',
      'save the outputs of "Back up shop" without those deleted',
    ]);
    expect(stepsOf(outcome)[3]).toMatchObject({ kind: 'file', action: 'delete', onFailure: { kind: 'go-on' } });
    expect(stepsOf(outcome)[1]?.onFailure).toBeUndefined();
  });

  it('writes on another system with its separator', () => {
    const tasks = tasksWith([{ ...nightly, folder: '/home/ada/backups/' }], { [nightly.id]: handled });
    const context = {
      ...contextOf('task.run', appStateWith(tasks, [localConnection]), first),
      platform: 'linux' as const,
    };
    expect(written(plan(context, { args: { task: nightly.id, trigger: 'schedule' } }))?.path).toBe(
      '/home/ada/backups/shop_2026-11-01_02-00-00.agz',
    );
  });
});
