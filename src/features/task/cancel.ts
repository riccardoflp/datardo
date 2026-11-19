/**
 * Feature: task.cancel — stops the run of a task and deletes what it wrote so far.
 */
import type { AppStep, Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { planText } from './text';
import type { ScheduledTask } from './types';
import { appStep, argumentTask, isRunning, nothingToDo, tasksOf } from './types';

/** The step that stops a run: the run then deletes its incomplete output and is logged as `cancelled`. */
export function cancelStep(task: ScheduledTask): AppStep {
  return appStep('task.cancel-run', { task: task.id }, planText.cancelRun(task.name));
}

/**
 * Feature: task.cancel — `args.task` is the task: `cancel the run of "<name>"`, when it is running. A run that ended
 * meanwhile has nothing to cancel, and is logged as it ended. Retention does not run after a cancelled run, and no
 * notification is shown.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const task = argumentTask(context.state, answers);
  if (task === undefined || !isRunning(tasksOf(context.state), task.id)) {
    return nothingToDo(planText.cancelTitle(task?.name ?? ''), planText.cannotUndoCancel);
  }
  return run({
    title: planText.cancelTitle(task.name),
    steps: [cancelStep(task)],
    danger: noDanger,
    undo: { cannot: planText.cannotUndoCancel },
    publishes: false,
    after: [],
  });
}
