/**
 * What the cards of the scheduled tasks area share: a task as `tasks/tasks.json` keeps it, the state of a task as
 * `tasks/<id>.json` keeps it, and the part of the app's state the page and the plans decide from, which lives in
 * `src/shared/state/tasks.ts` and is re-exported here; then what the main process found on disk, and the helpers of
 * the plans.
 */
import type { Json } from '../../shared/engine-request';
import type { AppStep, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import type { AppState } from '../../shared/state';
import type { ScheduledTask, TaskId, TaskState, TasksState } from '../../shared/state/tasks';
import { emptyTaskState, taskId } from '../../shared/state/tasks';

export type {
  BackupFormat,
  ExportFormat,
  PageMessage,
  RunInProgress,
  RunProgress,
  RunStatus,
  RunTrigger,
  Schedule,
  ScheduledTask,
  TaskFormat,
  TaskId,
  TaskKind,
  TaskOutput,
  TaskRun,
  TaskState,
  TasksEvent,
  TasksState,
  Weekday,
} from '../../shared/state/tasks';
export { emptyTaskState, initialTasksState, reduceTasks, taskId } from '../../shared/state/tasks';

/** The tasks part of the app's state. */
export function tasksOf(state: AppState): TasksState {
  return state.tasks;
}

/** A task by its id, in the app's state. */
export function taskById(state: AppState, id: TaskId): ScheduledTask | undefined {
  return tasksOf(state).tasks.find((each) => each.id === id);
}

/** The state of a task, empty when it has none yet. */
export function stateOf(tasks: TasksState, id: TaskId): TaskState {
  return tasks.states[id] ?? emptyTaskState;
}

/** Whether a task has a run in progress. */
export function isRunning(tasks: TasksState, id: TaskId): boolean {
  return tasks.running[id] !== undefined;
}

/** What is at a path on disk. */
export type PathKind = 'file' | 'folder' | 'missing';

/**
 * What the main process looked up on disk just before a plan of a run or of retention is made, given as
 * `answers.disk` or, as the scheduler of the main process starts a run, in its arguments (`args.disk`): whether the task's folder exists, the names already in it, and what is at each output's path. A fact
 * left out is taken as the task's state records it: the folder there, no name taken, each output as it was written.
 */
export interface DiskFacts {
  readonly folder?: 'present' | 'missing';
  readonly taken?: readonly string[];
  readonly at?: Readonly<Record<string, PathKind>>;
}

type Fields = Readonly<Record<string, unknown>>;

function fieldsOf(value: unknown): Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : {};
}

const pathKinds: readonly PathKind[] = ['file', 'folder', 'missing'];

/** The facts on disk from what the main process gave; none when it gave nothing. */
export function diskFactsOf(value: unknown): DiskFacts {
  const fields = fieldsOf(value);
  const folder = fields['folder'] === 'missing' || fields['folder'] === 'present' ? fields['folder'] : undefined;
  const taken = Array.isArray(fields['taken'])
    ? (fields['taken'] as readonly unknown[]).filter((each): each is string => typeof each === 'string')
    : undefined;
  const at = Object.fromEntries(
    Object.entries(fieldsOf(fields['at'])).flatMap(([path, kind]) =>
      pathKinds.includes(kind as PathKind) ? [[path, kind as PathKind]] : [],
    ),
  );
  return {
    ...(folder === undefined ? {} : { folder }),
    ...(taken === undefined ? {} : { taken }),
    at,
  };
}

/** The facts on disk a plan was given: `answers.disk`, else `args.disk`. */
export function diskOf(answers: Readonly<Record<string, unknown>>): DiskFacts {
  return diskFactsOf(answers['disk'] ?? argumentsOf(answers)['disk']);
}

/** The arguments a feature was started with (`Intent.args`), as an object; empty when there are none. */
export function argumentsOf(answers: Readonly<Record<string, unknown>>): Fields {
  return fieldsOf(answers['args']);
}

/** An app step: the action the main process carries out, its arguments, and its text as the Log writes it. */
export function appStep(action: string, args: Json, text: string): AppStep {
  return { kind: 'app', action, args, text };
}

/** A plan with nothing to do: the task is already as the feature would leave it, or is gone. */
export function nothingToDo(title: string, cannot: string): Outcome {
  return run({ title, steps: [], danger: noDanger, undo: { cannot }, publishes: false, after: [] });
}

/** The task a feature was started on: `args.task`, when it names a task that exists. */
export function argumentTask(state: AppState, answers: Readonly<Record<string, unknown>>): ScheduledTask | undefined {
  const id = argumentsOf(answers)['task'];
  return typeof id === 'string' ? taskById(state, taskId(id)) : undefined;
}
