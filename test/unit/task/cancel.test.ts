import { appStateWith, at, contextOf, stepsOf, stepTexts, task, tasksWith } from './harness';
import { describe, expect, it } from 'vitest';
import { nextTaskRun } from '../../../src/features/task/due';
import { plan } from '../../../src/features/task/cancel';
import { view as notification } from '../../../src/features/task/notify';
import { finishedRun, startedRun } from '../../../src/features/task/run';
import { view } from '../../../src/features/task/show';
import type { TaskOutput, TaskState } from '../../../src/features/task/types';
import { initialSettingsState } from '../../../src/shared/state/settings';

const nightly = task({ notifySuccess: true });
const start = at(2026, 11, 11, 2);
const earlier: TaskOutput = {
  path: 'D:\\backups\\shop_2026-11-10_02-00-00.agz',
  at: at(2026, 11, 10, 2),
  size: 5,
  folder: false,
};
const before: TaskState = { lastSlot: at(2026, 11, 10, 2), runs: [], outputs: [earlier] };

describe('task.cancel', () => {
  it('stops the run of a running task with one step', () => {
    const tasks = tasksWith([nightly], {}, { [nightly.id]: { start, trigger: 'schedule' } });
    const outcome = plan(contextOf('task.cancel', appStateWith(tasks), start + 1000), { args: { task: nightly.id } });
    expect(stepTexts(outcome)).toEqual(['cancel the run of "Back up shop"']);
    expect(stepsOf(outcome)[0]).toMatchObject({ kind: 'app', action: 'task.cancel-run', args: { task: 't-1' } });
    expect(outcome).toMatchObject({ kind: 'run', plan: { danger: { kind: 'none' } } });
  });

  it('logs the run as cancelled, notifies nothing, and keeps the outputs of earlier runs', () => {
    const running = startedRun(before, { start, trigger: 'schedule', slot: start });
    const ended = finishedRun(nightly, running, { kind: 'cancelled' }, start + 2000);
    expect(ended.runs[0]).toEqual({
      start,
      end: start + 2000,
      trigger: 'schedule',
      status: 'cancelled',
      error: 'Cancelled: the incomplete output was deleted',
    });
    expect(ended.outputs).toEqual([earlier]);
    const run = ended.runs[0];
    expect(run === undefined ? 'none' : notification({ task: nightly, run, hidden: false })).toBeUndefined();
  });

  it('leaves the next run as it was and offers Run now again', () => {
    const running = startedRun(before, { start, trigger: 'schedule', slot: start });
    const ended = finishedRun(nightly, running, { kind: 'cancelled' }, start + 2000);
    expect(nextTaskRun(nightly, ended)).toBe(at(2026, 11, 12, 2));
    const page = view({
      tasks: tasksWith([nightly], { [nightly.id]: ended }),
      connections: [],
      settings: initialSettingsState,
      now: start + 3000,
    });
    expect(page.items[0]?.button).toMatchObject({ kind: 'run', label: 'Run now', element: 'task.run@list' });
  });

  it('has nothing to cancel once the run ended, which stays logged as done', () => {
    const outcome = plan(contextOf('task.cancel', appStateWith(tasksWith([nightly])), start), {
      args: { task: nightly.id },
    });
    expect(stepsOf(outcome)).toEqual([]);
  });
});
