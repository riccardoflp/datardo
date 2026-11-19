import { appStateWith, at, contextOf, stepsOf, stepTexts, task, tasksWith } from './harness';
import { describe, expect, it } from 'vitest';
import {
  afterRetention,
  outputsToDelete,
  plan,
  retentionChoice,
  retentionSteps,
} from '../../../src/features/task/retention';
import { finishedRun, plan as runPlan, startedRun } from '../../../src/features/task/run';
import type { TaskOutput, TaskState } from '../../../src/features/task/types';

function output(path: string, time: number, folder = false): TaskOutput {
  return { path, at: time, size: 1, folder };
}

const outputs = [3, 1, 5, 2, 4].map((time) => output(`D:\\b\\${String(time)}.agz`, time));
const paths = (list: readonly TaskOutput[]): readonly string[] => list.map((each) => each.path).sort();

describe('task.retention', () => {
  it('deletes all but the newest Keep, by the time of their run', () => {
    expect(paths(outputsToDelete(outputs, 3))).toEqual(['D:\\b\\1.agz', 'D:\\b\\2.agz']);
    expect(paths(outputsToDelete(outputs, 4))).toEqual(['D:\\b\\1.agz']);
    expect(outputsToDelete(outputs, 5)).toEqual([]);
    expect(outputsToDelete(outputs, 0)).toEqual([]);
  });

  it('takes of two outputs of the same time the one recorded later as newer', () => {
    const same = [output('first', 7), output('second', 7)];
    expect(outputsToDelete(same, 1)).toEqual([same[0]]);
  });

  it('deletes the first archive of three daily runs and never a file the task did not write', () => {
    const nightly = task({ keep: 2, schedule: { kind: 'daily', time: '02:00' } });
    const recorded = [1, 2].map((day) =>
      output(`D:\\backups\\shop_2026-11-0${String(day)}_02-00-00.agz`, at(2026, 11, day, 2)),
    );
    const state: TaskState = { lastSlot: at(2026, 11, 2, 2), runs: [], outputs: recorded };
    const outcome = runPlan(
      contextOf('task.run', appStateWith(tasksWith([nightly], { [nightly.id]: state })), at(2026, 11, 3, 2)),
      { args: { task: nightly.id, trigger: 'schedule' }, disk: { taken: ['shop_2020-01-01_02-00-00.agz'] } },
    );
    const deletes = stepsOf(outcome).filter((step) => step.kind === 'file' && step.action === 'delete');
    expect(deletes.map((step) => step.text)).toEqual(['delete D:\\backups\\shop_2026-11-01_02-00-00.agz']);
  });

  it('deletes a folder backup with everything in it and keeps the newer one of the same name', () => {
    const folders = [output('D:\\b\\shop-20261101', 1, true), output('D:\\b\\shop-20261101_2', 2, true)];
    const choice = retentionChoice(folders, 1, { at: { 'D:\\b\\shop-20261101': 'folder' } });
    expect(choice).toEqual({ deletes: [folders[0]], drops: [] });
  });

  it('leaves alone an archive replaced by a folder of the same name, and drops it from the list', () => {
    const recorded = [output('D:\\b\\old.agz', 1), output('D:\\b\\new.agz', 2)];
    const choice = retentionChoice(recorded, 1, { at: { 'D:\\b\\old.agz': 'folder' } });
    expect(choice).toEqual({ deletes: [], drops: [recorded[0]] });
    const steps = retentionSteps(task(), choice);
    expect(steps).toEqual([
      {
        kind: 'app',
        action: 'task.forget-outputs',
        args: { task: 't-1', deleted: [], dropped: ['D:\\b\\old.agz'] },
        text: 'save the outputs of "Back up shop" without those deleted',
      },
    ]);
    const state: TaskState = { runs: [], outputs: recorded };
    expect(afterRetention(state, { deleted: [], dropped: ['D:\\b\\old.agz'], errors: [] }).outputs).toEqual([
      recorded[1],
    ]);
    expect(retentionChoice(recorded, 1, { at: { 'D:\\b\\old.agz': 'missing' } }).drops).toEqual([recorded[0]]);
  });

  it('reports an output it cannot delete and deletes it after a later run', () => {
    const held = output('D:\\b\\held.agz', 1);
    const newer = output('D:\\b\\newer.agz', 2);
    const state: TaskState = {
      runs: [{ start: 2, end: 3, trigger: 'schedule', status: 'done', output: newer.path }],
      outputs: [held, newer],
    };
    const after = afterRetention(state, { deleted: [], dropped: [], errors: [{ path: held.path, error: 'EBUSY' }] });
    expect(after.outputs).toEqual([held, newer]);
    expect(after.runs[0]?.note).toBe('Could not delete D:\\b\\held.agz: EBUSY');
    const latest = output('D:\\b\\latest.agz', 3);
    expect(outputsToDelete([...after.outputs, latest], 2)).toEqual([held]);
    const deleted = afterRetention(
      { ...after, runs: [{ start: 3, end: 4, trigger: 'schedule', status: 'done' }, ...after.runs] },
      { deleted: [held.path], dropped: [], errors: [] },
    );
    expect(deleted.runs[0]?.deleted).toBe(1);
    expect(deleted.outputs).toEqual([newer]);
  });

  it('deletes nothing after a failed, a cancelled or a skipped run', () => {
    const nightly = task({ keep: 1 });
    const state: TaskState = { runs: [], outputs: [output('D:\\b\\a.agz', 1), output('D:\\b\\b.agz', 2)] };
    for (const ended of [
      { kind: 'failed', error: 'disk full' } as const,
      { kind: 'cancelled' } as const,
      { kind: 'skipped', error: 'The connection was removed' } as const,
    ]) {
      const after = finishedRun(nightly, startedRun(state, { start: 5, trigger: 'manual' }), ended, 6);
      expect(after.outputs).toEqual(state.outputs);
    }
  });

  it('deletes the outputs beyond Keep when started on a task', () => {
    const nightly = task({ keep: 2 });
    const state: TaskState = { runs: [], outputs };
    const outcome = plan(
      contextOf('task.retention', appStateWith(tasksWith([nightly], { [nightly.id]: state })), at(2026, 11, 11)),
      { args: { task: nightly.id } },
    );
    expect(stepTexts(outcome)).toEqual([
      'delete D:\\b\\3.agz',
      'delete D:\\b\\2.agz',
      'delete D:\\b\\1.agz',
      'save the outputs of "Back up shop" without those deleted',
    ]);
    expect(outcome).toMatchObject({ kind: 'run', plan: { danger: { kind: 'none' } } });
  });
});
