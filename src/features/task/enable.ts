/**
 * Feature: task.enable — the switch of a task stops or starts its runs without deleting it.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { planText } from './text';
import type { ScheduledTask } from './types';
import { appStep, argumentTask, argumentsOf, nothingToDo } from './types';

/**
 * The task enabled or disabled at `now`. Enabling counts its runs from now, so the times that came while it was
 * disabled are neither run nor recorded as missed; disabling keeps when they counted from.
 */
export function withEnabled(task: ScheduledTask, enabled: boolean, now: number): ScheduledTask {
  if (task.enabled === enabled) {
    return task;
  }
  return { ...task, enabled, since: enabled ? now : task.since };
}

/**
 * Feature: task.enable — `args` is `{ task, enabled }`; without `enabled`, the switch turns the task the other way.
 * The plan: `enable the scheduled task "<name>"` or `disable the scheduled task "<name>"`. A run in progress goes on.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const task = argumentTask(context.state, answers);
  if (task === undefined) {
    return nothingToDo(planText.enableTitle(''), planText.cannotUndoEnable);
  }
  const asked = argumentsOf(answers)['enabled'];
  const enabled = typeof asked === 'boolean' ? asked : !task.enabled;
  const title = enabled ? planText.enableTitle(task.name) : planText.disableTitle(task.name);
  if (enabled === task.enabled) {
    return nothingToDo(title, planText.cannotUndoEnable);
  }
  const changed = withEnabled(task, enabled, context.now);
  return run({
    title,
    steps: [
      appStep(
        'task.set-enabled',
        { task: task.id, enabled, since: changed.since },
        enabled ? planText.enable(task.name) : planText.disable(task.name),
      ),
    ],
    danger: noDanger,
    undo: { cannot: planText.cannotUndoEnable },
    publishes: false,
    after: [],
  });
}
