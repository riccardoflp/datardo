import { appStateWith, at, contextOf, stepsOf, stepTexts, task, tasksWith } from './harness';
import { describe, expect, it } from 'vitest';
import { dueTasks } from '../../../src/features/task/due';
import { plan, recordMissed } from '../../../src/features/task/missed';
import { view as notification } from '../../../src/features/task/notify';
import { view } from '../../../src/features/task/show';
import type { ScheduledTask, TaskState } from '../../../src/features/task/types';
import { initialSettingsState } from '../../../src/shared/state/settings';

const daily = task({ schedule: { kind: 'daily', time: '02:30' } });
/** Closed since Sunday 8 November 2026 after its run. */
const sunday: TaskState = { lastSlot: at(2026, 11, 8, 2, 30), runs: [], outputs: [] };
const wednesday = at(2026, 11, 11, 9);

function missedPlan(scheduled: ScheduledTask, state: TaskState, now: number) {
  return plan(contextOf('task.missed', appStateWith(tasksWith([scheduled], { [scheduled.id]: state })), now), {
    args: { task: scheduled.id },
  });
}

describe('task.missed', () => {
  it('records one missed run for Wednesday 02:30, and notifies nothing', () => {
    const outcome = missedPlan(daily, sunday, wednesday);
    expect(stepTexts(outcome)).toEqual(['record the missed run of "Back up shop"']);
    expect(stepsOf(outcome)[0]).toMatchObject({
      action: 'task.record-missed',
      args: { slot: at(2026, 11, 11, 2, 30) },
    });
    const recorded = recordMissed(sunday, at(2026, 11, 11, 2, 30));
    expect(recorded.runs).toEqual([
      {
        start: at(2026, 11, 11, 2, 30),
        end: at(2026, 11, 11, 2, 30),
        trigger: 'schedule',
        status: 'missed',
        error: "Datardo wasn't running (or the computer was asleep) at that time",
      },
    ]);
    expect(recorded.lastSlot).toBe(at(2026, 11, 11, 2, 30));
    expect(missedPlan(daily, recorded, wednesday + 15_000)).toMatchObject({ kind: 'run', plan: { steps: [] } });
    const run = recorded.runs[0];
    expect(run === undefined ? 'none' : notification({ task: daily, run, hidden: false })).toBeUndefined();
  });

  it('runs once instead with Run a missed run when Datardo starts, logged as missed, run late', () => {
    const late = { ...daily, runMissed: true };
    const outcome = missedPlan(late, sunday, wednesday);
    expect(stepsOf(outcome)[0]).toMatchObject({
      action: 'task.start-run',
      args: { trigger: 'missed', slot: at(2026, 11, 11, 2, 30) },
    });
    expect(stepTexts(outcome)[1]).toBe('write D:\\backups\\shop_2026-11-11_09-00-00.agz');
    const state: TaskState = {
      ...sunday,
      runs: [{ start: wednesday, end: wednesday + 5000, trigger: 'missed', status: 'done', documents: 1, size: 1 }],
    };
    const shown = view({
      tasks: { ...tasksWith([late], { [late.id]: state }), open: [late.id] },
      connections: [],
      settings: initialSettingsState,
      now: wednesday,
    });
    expect(shown.items[0]?.details?.runs[0]?.how).toBe('missed, run late');
  });

  it('runs a run found less than 5 minutes late as a scheduled run', () => {
    const tasks = tasksWith([daily], { [daily.id]: sunday });
    expect(dueTasks(tasks, at(2026, 11, 11, 2, 34))).toEqual([
      { task: daily.id, feature: 'task.run', slot: at(2026, 11, 11, 2, 30) },
    ]);
    expect(stepsOf(missedPlan(daily, sunday, at(2026, 11, 11, 2, 34)))).toEqual([]);
  });

  it('has no missed run for a task created, enabled or rescheduled after its time', () => {
    const recent = { ...daily, since: at(2026, 11, 11, 3) };
    expect(stepsOf(missedPlan(recent, sunday, wednesday))).toEqual([]);
    expect(dueTasks(tasksWith([recent], { [recent.id]: sunday }), wednesday)).toEqual([]);
  });

  it('records the run of a computer that slept from 01:00 to 08:00 as missed at the first check', () => {
    const before: TaskState = { lastSlot: at(2026, 11, 10, 2, 30), runs: [], outputs: [] };
    expect(dueTasks(tasksWith([daily], { [daily.id]: before }), at(2026, 11, 11, 8, 0, 15))).toEqual([
      { task: daily.id, feature: 'task.missed', slot: at(2026, 11, 11, 2, 30) },
    ]);
  });
});
