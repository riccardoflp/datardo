/**
 * Feature: task.delete — deletes the task and its run log, and leaves the files it wrote.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { run } from '../../shared/feature';
import { cancelStep } from './cancel';
import { planText } from './text';
import { appStep, argumentTask, isRunning, nothingToDo, tasksOf } from './types';

/**
 * Feature: task.delete — `args.task` is the task. The confirmation **Delete the scheduled task "<name>"?**, then
 * `cancel the run of "<name>"` when it runs, and `delete the scheduled task "<name>" and its run log`. Its list of
 * outputs goes with it: no later task deletes the files it wrote.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const task = argumentTask(context.state, answers);
  if (task === undefined) {
    return nothingToDo(planText.deleteQuestion(''), planText.cannotUndoDelete);
  }
  const running = isRunning(tasksOf(context.state), task.id);
  return run({
    title: planText.deleteQuestion(task.name),
    steps: [
      ...(running ? [cancelStep(task)] : []),
      appStep('task.delete', { task: task.id }, planText.deleteTask(task.name)),
    ],
    danger: { kind: 'confirm', text: planText.deleteText, button: planText.deleteButton },
    undo: { cannot: planText.cannotUndoDelete },
    publishes: false,
    after: [],
  });
}
