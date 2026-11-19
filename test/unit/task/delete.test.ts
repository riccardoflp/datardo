import { appStateWith, at, contextOf, stepsOf, stepTexts, task, tasksWith } from './harness';
import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/task/delete';
import { plan as runPlan } from '../../../src/features/task/run';
import { taskId } from '../../../src/features/task/types';

const nightly = task({ keep: 1 });
const now = at(2026, 11, 11, 9);

describe('task.delete', () => {
  it('confirms, then deletes the task and its run log, and no file it wrote', () => {
    const state = { runs: [], outputs: [{ path: 'D:\\backups\\shop.agz', at: 1, size: 1, folder: false }] };
    const outcome = plan(contextOf('task.delete', appStateWith(tasksWith([nightly], { [nightly.id]: state })), now), {
      args: { task: nightly.id },
    });
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: {
        title: 'Delete the scheduled task "Back up shop"?',
        danger: {
          kind: 'confirm',
          text: 'Its run log is deleted too. The backups and exports it wrote stay where they are.',
          button: 'Delete',
        },
      },
    });
    expect(stepTexts(outcome)).toEqual(['delete the scheduled task "Back up shop" and its run log']);
    expect(stepsOf(outcome).some((step) => step.kind === 'file')).toBe(false);
  });

  it('stops the run of a task that runs before deleting it', () => {
    const tasks = tasksWith([nightly], {}, { [nightly.id]: { start: now, trigger: 'manual' } });
    expect(stepTexts(plan(contextOf('task.delete', appStateWith(tasks), now), { args: { task: nightly.id } }))).toEqual(
      ['cancel the run of "Back up shop"', 'delete the scheduled task "Back up shop" and its run log'],
    );
  });

  it('gives a new task with the same name, folder and pattern none of the old files to delete', () => {
    const again = { ...nightly, id: taskId('t-2') };
    const outcome = runPlan(contextOf('task.run', appStateWith(tasksWith([again])), now), {
      args: { task: again.id },
      disk: { taken: ['shop_2026-11-10_02-00-00.agz', 'shop_2026-11-09_02-00-00.agz'] },
    });
    expect(stepsOf(outcome).filter((step) => step.kind === 'file' && step.action === 'delete')).toEqual([]);
  });
});
