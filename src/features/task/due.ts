/**
 * Feature: task.due — whether a task has a run to do now, and whether that run was missed because Datardo was not
 * running; the next run of a task; the run log.
 */
import { nextRun, previousRun } from './next-runs';
import type { ScheduledTask, TaskId, TaskRun, TaskState, TasksState } from './types';
import { stateOf } from './types';

/** A scheduled run found up to 5 minutes late still runs; later, it was missed (Mongoster's number). */
export const graceMs = 5 * 60_000;

/** The runs a run log keeps, newest first. */
export const runLogLength = 20;

/** What a task has to do now. */
export type Due =
  | { readonly kind: 'none' }
  /** A run for the scheduled time `slot`. */
  | { readonly kind: 'run'; readonly slot: number }
  /** The run of `slot` was missed: run late when the task says so, else recorded (`task.missed`). */
  | { readonly kind: 'missed'; readonly slot: number };

/** From when the runs of a task count: the later of `since` and the last scheduled time handled. */
export function runsCountFrom(task: ScheduledTask, state: TaskState): number {
  return Math.max(task.since, state.lastSlot ?? Number.NEGATIVE_INFINITY);
}

/** The next run of a task; undefined when it is disabled or its schedule never runs. */
export function nextTaskRun(task: ScheduledTask, state: TaskState): number | undefined {
  return task.enabled ? nextRun(task.schedule, runsCountFrom(task, state)) : undefined;
}

/**
 * Feature: task.due — whether a task has a run to do at `now`. Of several runs due, only the latest counts; a slot
 * more than 5 minutes old was missed.
 */
export function dueRun(task: ScheduledTask, state: TaskState, now: number): Due {
  const next = nextTaskRun(task, state);
  if (next === undefined || next > now) {
    return { kind: 'none' };
  }
  const slot = previousRun(task.schedule, now) ?? next;
  return now - slot <= graceMs ? { kind: 'run', slot } : { kind: 'missed', slot };
}

/** Adds a run to the log, newest first, keeping the 20 newest. */
export function addRun(state: TaskState, run: TaskRun): TaskState {
  return { ...state, runs: [run, ...state.runs].slice(0, runLogLength) };
}

/** What the scheduler starts for a task that has something due: a run, or what is done with a missed run. */
export interface DueTask {
  readonly task: TaskId;
  readonly feature: 'task.run' | 'task.missed';
  readonly slot: number;
}

/**
 * What the scheduler's check starts at `now`, 3 seconds after Datardo starts and every 15 seconds: `task.run` for a
 * run due, `task.missed` for a run missed. A task with a run in progress is left alone: the run in progress skips the
 * slots that came meanwhile (`task.run`).
 */
export function dueTasks(tasks: TasksState, now: number): readonly DueTask[] {
  return tasks.tasks.flatMap((task): readonly DueTask[] => {
    if (tasks.running[task.id] !== undefined) {
      return [];
    }
    const due = dueRun(task, stateOf(tasks, task.id), now);
    switch (due.kind) {
      case 'none':
        return [];
      case 'run':
        return [{ task: task.id, feature: 'task.run', slot: due.slot }];
      case 'missed':
        return [{ task: task.id, feature: 'task.missed', slot: due.slot }];
    }
  });
}
