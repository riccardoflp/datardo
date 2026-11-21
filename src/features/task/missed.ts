/**
 * Feature: task.missed — a run whose time came while Datardo was closed, or the computer was asleep: recorded as
 * missed, or run once late when the task says so.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { addRun, dueRun } from './due';
import { runPlan } from './run';
import { planText } from './text';
import type { TaskState } from './types';
import { appStep, argumentTask, diskOf, nothingToDo, stateOf, tasksOf } from './types';

/** The state once the missed run of `slot` is recorded: the time handled, and the run `missed` in the log. */
export function recordMissed(state: TaskState, slot: number): TaskState {
  return addRun(
    { ...state, lastSlot: Math.max(slot, state.lastSlot ?? slot) },
    { start: slot, end: slot, trigger: 'schedule', status: 'missed', error: planText.missed },
  );
}

/**
 * Feature: task.missed — `args.task` is the task. When its run is still missed: `record the missed run of "<name>"`,
 * or, with **Run a missed run when Datardo starts**, the plan of `task.run` logged as `missed, run late`. Nothing is
 * notified for a run recorded as missed.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const task = argumentTask(context.state, answers);
  if (task === undefined) {
    return nothingToDo(planText.missedTitle(''), planText.cannotUndoMissed);
  }
  const due = dueRun(task, stateOf(tasksOf(context.state), task.id), context.now);
  if (due.kind !== 'missed') {
    return nothingToDo(planText.missedTitle(task.name), planText.cannotUndoMissed);
  }
  if (task.runMissed) {
    return runPlan(context, task, 'missed', diskOf(answers));
  }
  return run({
    title: planText.missedTitle(task.name),
    steps: [appStep('task.record-missed', { task: task.id, slot: due.slot }, planText.recordMissed(task.name))],
    danger: noDanger,
    undo: { cannot: planText.cannotUndoMissed },
    publishes: false,
    after: [],
  });
}
