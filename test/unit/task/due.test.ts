import { at, local, task, tasksWith } from './harness';
import { describe, expect, it } from 'vitest';
import { addRun, dueRun, dueTasks, nextTaskRun } from '../../../src/features/task/due';
import { withEnabled } from '../../../src/features/task/enable';
import type { TaskRun, TaskState } from '../../../src/features/task/types';

const daily = task({ schedule: { kind: 'daily', time: '02:30' } });

function handled(lastSlot: number): TaskState {
  return { lastSlot, runs: [], outputs: [] };
}

describe('task.due', () => {
  it('has nothing due before the time, then a run, then nothing until the next day once handled', () => {
    const state = handled(at(2026, 11, 10, 2, 30));
    expect(dueRun(daily, state, at(2026, 11, 11, 2, 29))).toEqual({ kind: 'none' });
    expect(dueRun(daily, state, at(2026, 11, 11, 2, 31))).toEqual({ kind: 'run', slot: at(2026, 11, 11, 2, 30) });
    const after = handled(at(2026, 11, 11, 2, 30));
    expect(dueRun(daily, after, at(2026, 11, 11, 2, 31))).toEqual({ kind: 'none' });
    expect(local(nextTaskRun(daily, after))).toBe('2026-11-12 02:30');
  });

  it('counts one missed run, the latest, when Datardo opens days later', () => {
    const state = handled(at(2026, 11, 8, 2, 30));
    expect(dueRun(daily, state, at(2026, 11, 11, 9))).toEqual({ kind: 'missed', slot: at(2026, 11, 11, 2, 30) });
    expect(dueRun(daily, state, at(2026, 11, 11, 2, 34))).toEqual({ kind: 'run', slot: at(2026, 11, 11, 2, 30) });
  });

  it('has nothing due the day a task is created after its time', () => {
    const created = task({ schedule: { kind: 'daily', time: '02:30' }, since: at(2026, 11, 11, 3) });
    expect(dueRun(created, { runs: [], outputs: [] }, at(2026, 11, 11, 9))).toEqual({ kind: 'none' });
  });

  it('keeps the 20 newest runs, newest first', () => {
    const run = (start: number): TaskRun => ({ start, end: start, trigger: 'schedule', status: 'done' });
    const full: TaskState = { runs: Array.from({ length: 20 }, (_, index) => run(20 - index)), outputs: [] };
    const added = addRun(full, run(21));
    expect(added.runs).toHaveLength(20);
    expect(added.runs[0]?.start).toBe(21);
    expect(added.runs.map((each) => each.start)).not.toContain(1);
  });

  it('runs a slot exactly 5 minutes old, and counts it missed one second later', () => {
    const state = handled(at(2026, 11, 10, 2, 30));
    expect(dueRun(daily, state, at(2026, 11, 11, 2, 35, 0)).kind).toBe('run');
    expect(dueRun(daily, state, at(2026, 11, 11, 2, 35, 1)).kind).toBe('missed');
  });

  it('has nothing due for a time that came while the task was disabled', () => {
    const state = handled(at(2026, 11, 10, 2, 30));
    const disabled = { ...daily, enabled: false };
    expect(dueRun(disabled, state, at(2026, 11, 11, 2, 31))).toEqual({ kind: 'none' });
    expect(nextTaskRun(disabled, state)).toBeUndefined();
    const enabled = withEnabled(disabled, true, at(2026, 11, 11, 3, 30));
    expect(dueRun(enabled, state, at(2026, 11, 11, 3, 31))).toEqual({ kind: 'none' });
    expect(dueRun(enabled, state, at(2026, 11, 11, 9))).toEqual({ kind: 'none' });
  });

  it('starts task.run for a run due, task.missed for a run missed, and nothing for a task that runs', () => {
    const missed = task({ id: daily.id, schedule: { kind: 'daily', time: '02:30' } });
    const due = { ...missed, id: 't-2' as typeof missed.id, schedule: { kind: 'daily', time: '08:58' } as const };
    const running = { ...missed, id: 't-3' as typeof missed.id };
    const tasks = tasksWith(
      [missed, due, running],
      {
        [missed.id]: handled(at(2026, 11, 8, 2, 30)),
        [due.id]: handled(at(2026, 11, 10, 8, 58)),
        [running.id]: handled(at(2026, 11, 8, 2, 30)),
      },
      { [running.id]: { start: at(2026, 11, 11, 8), trigger: 'manual' } },
    );
    expect(dueTasks(tasks, at(2026, 11, 11, 9))).toEqual([
      { task: missed.id, feature: 'task.missed', slot: at(2026, 11, 11, 2, 30) },
      { task: due.id, feature: 'task.run', slot: at(2026, 11, 11, 8, 58) },
    ]);
  });
});
