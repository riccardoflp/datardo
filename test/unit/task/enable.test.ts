import { appStateWith, at, contextOf, stepsOf, stepTexts, task, tasksWith } from './harness';
import { describe, expect, it } from 'vitest';
import { dueRun, dueTasks } from '../../../src/features/task/due';
import { plan, withEnabled } from '../../../src/features/task/enable';
import { plan as runPlan } from '../../../src/features/task/run';
import { view } from '../../../src/features/task/show';
import { keepsRunning } from '../../../src/features/task/tray';
import type { TaskState } from '../../../src/features/task/types';
import { initialSettingsState } from '../../../src/shared/state/settings';

const nightly = task();
const disabled = { ...nightly, enabled: false };
const thursday = at(2026, 11, 12, 10);
const aWeekAgo: TaskState = { lastSlot: at(2026, 11, 5, 2), runs: [], outputs: [] };

describe('task.enable', () => {
  it('greys a disabled task, shows no next run, and does not run it at its time', () => {
    const page = view({
      tasks: tasksWith([disabled], { [disabled.id]: aWeekAgo }),
      connections: [],
      settings: initialSettingsState,
      now: thursday,
    });
    expect(page.items[0]).toMatchObject({
      greyed: true,
      next: '—',
      enabled: { on: false, tooltip: 'Disabled: click to enable', element: 'task.enable@list' },
    });
    expect(dueRun(disabled, aWeekAgo, at(2026, 11, 12, 2, 1))).toEqual({ kind: 'none' });
  });

  it('logs no missed run when enabled again on Thursday after a week disabled', () => {
    const outcome = plan(contextOf('task.enable', appStateWith(tasksWith([disabled])), thursday), {
      args: { task: disabled.id, enabled: true },
    });
    expect(stepTexts(outcome)).toEqual(['enable the scheduled task "Back up shop"']);
    expect(stepsOf(outcome)[0]).toMatchObject({ action: 'task.set-enabled', args: { enabled: true, since: thursday } });
    const enabled = withEnabled(disabled, true, thursday);
    expect(dueTasks(tasksWith([enabled], { [enabled.id]: aWeekAgo }), thursday + 15_000)).toEqual([]);
  });

  it('still runs a disabled task with Run now', () => {
    const outcome = runPlan(contextOf('task.run', appStateWith(tasksWith([disabled])), thursday), {
      args: { task: disabled.id, trigger: 'manual' },
    });
    expect(stepTexts(outcome)[1]).toBe('write D:\\backups\\shop_2026-11-12_10-00-00.agz');
  });

  it('lets a run in progress finish when the task is disabled', () => {
    const tasks = tasksWith([nightly], {}, { [nightly.id]: { start: thursday, trigger: 'schedule' } });
    const outcome = plan(contextOf('task.enable', appStateWith(tasks), thursday), {
      args: { task: nightly.id, enabled: false },
    });
    expect(stepTexts(outcome)).toEqual(['disable the scheduled task "Back up shop"']);
    expect(stepsOf(outcome)[0]).toMatchObject({ args: { since: nightly.since } });
  });

  it('turns the switch the other way without an answer, and does nothing when already so', () => {
    const outcome = plan(contextOf('task.enable', appStateWith(tasksWith([disabled])), thursday), {
      args: { task: disabled.id },
    });
    expect(stepTexts(outcome)).toEqual(['enable the scheduled task "Back up shop"']);
    const same = plan(contextOf('task.enable', appStateWith(tasksWith([nightly])), thursday), {
      args: { task: nightly.id, enabled: true },
    });
    expect(stepsOf(same)).toEqual([]);
  });

  it('quits on closing once the only enabled task is disabled, with the tray setting on', () => {
    const on = { ...initialSettingsState, stored: { 'datardo.task.keepRunningInTray': true } };
    expect(keepsRunning(on, [nightly])).toBe(true);
    expect(keepsRunning(on, [withEnabled(nightly, false, thursday)])).toBe(false);
  });
});
