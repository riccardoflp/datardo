/**
 * What the cards of the scheduled tasks area share: a task as `tasks/tasks.json` keeps it, the state of a task as
 * `tasks/<id>.json` keeps it (its last scheduled time handled, its run log, its outputs), and the part of the app's
 * state the page and the plans decide from.
 *
 * The part of the app's state (`TasksState`, its events and its reducer) is written here, pure, until it moves to
 * `src/shared/state/tasks.ts` and joins the lists of `src/shared/state/index.ts`; {@link tasksOf} reads it meanwhile.
 * The stored shapes are mirrored by `src/storage/tasks.ts`, which may not import this folder (R1.3).
 */
import type { EngineName, Json } from '../../shared/engine-request';
import type { AppStep, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';

/** The identifier of a scheduled task. */
export type TaskId = string & { readonly __brand: 'TaskId' };

/** A task's identifier, from the text stored for it. */
export function taskId(identifier: string): TaskId {
  return identifier as TaskId;
}

/** What a task writes: a backup in mongodump's formats, or an export of one collection. */
export type TaskKind = 'backup' | 'export';

/** The formats of a backup, as **Back up…** offers them (`backup.create`). */
export type BackupFormat = 'archive' | 'gzip' | 'plain';

/** The formats of an export, as **Export collection…** offers them (`transfer.export`). */
export type ExportFormat = 'json' | 'jsonl' | 'csv';

/** The format of what a run writes. */
export type TaskFormat = BackupFormat | ExportFormat;

/** The days of a weekly schedule: 0 is Sunday, 6 is Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * When a task runs, in local time (`task.next-runs`). `time` is `HH:MM` (also `H:MM`); `every` is 1, 2, 3, 4, 6, 8 or
 * 12; a weekly schedule runs on its `days`.
 */
export type Schedule =
  | { readonly kind: 'hours'; readonly every: number; readonly time: string }
  | { readonly kind: 'daily'; readonly time: string }
  | { readonly kind: 'weekly'; readonly days: readonly number[]; readonly time: string };

/** A scheduled task (glossary, "scheduled task"), as `tasks/tasks.json` keeps it. */
export interface ScheduledTask {
  readonly id: TaskId;
  readonly name: string;
  /** The engine of its connection: `mongodb` for every task of the first release (`task.edit`). */
  readonly engine: EngineName;
  readonly kind: TaskKind;
  readonly enabled: boolean;
  readonly connection: ConnectionId;
  /** None: every database of the connection except `admin`, `local` and `config`. */
  readonly database?: string;
  /** None: every collection of the database (an export needs one). */
  readonly collection?: string;
  readonly format: TaskFormat;
  /** An export's filter, in mongosh syntax. */
  readonly filter?: string;
  /** An export's projection, in mongosh syntax. */
  readonly projection?: string;
  /** Where the outputs go. */
  readonly folder: string;
  /** The name of what each run writes, with placeholders (`task.file-names`); the extension is added. */
  readonly pattern: string;
  readonly schedule: Schedule;
  /** How many outputs are kept, the newest; 0 keeps them all (`task.retention`). */
  readonly keep: number;
  /** A run missed while Datardo was closed runs once when it is open again (`task.missed`). */
  readonly runMissed: boolean;
  /** Successful runs notify too; failed and skipped ones always do (`task.notify`). */
  readonly notifySuccess: boolean;
  /** When its runs count from, in milliseconds since 1970: creation, enabling, a change of schedule (`task.due`). */
  readonly since: number;
}

/** How a run was started: by its schedule, by **Run now**, or late for a run that was missed. */
export type RunTrigger = 'schedule' | 'manual' | 'missed';

/** How a run ended, as the page shows it. */
export type RunStatus = 'done' | 'failed' | 'skipped' | 'cancelled' | 'missed';

/** One run of a task (glossary, "run"), in its run log. */
export interface TaskRun {
  /** When it started, in milliseconds since 1970; for a missed run, the scheduled time. */
  readonly start: number;
  readonly end: number;
  readonly trigger: RunTrigger;
  readonly status: RunStatus;
  /** The path of the file or folder it wrote. */
  readonly output?: string;
  /** The bytes it wrote. */
  readonly size?: number;
  readonly documents?: number;
  readonly collections?: number;
  /** Why it failed or was skipped. */
  readonly error?: string;
  /** What else to know: collections left out, outputs that could not be deleted, a run skipped meanwhile. */
  readonly note?: string;
  /** How many older outputs retention deleted after it. */
  readonly deleted?: number;
}

/** A file or folder a successful run of the task wrote: retention deletes only these (`task.retention`). */
export interface TaskOutput {
  readonly path: string;
  /** The time of the run that wrote it. */
  readonly at: number;
  readonly size: number;
  /** Whether it is a folder (a folder backup) rather than a file. */
  readonly folder: boolean;
}

/** A run in progress, as the state of its task records it, so that one cut short by a quit is known at the next. */
export interface RunInProgress {
  readonly start: number;
  readonly trigger: RunTrigger;
  /** The scheduled time it runs for, when the schedule started it. */
  readonly slot?: number;
}

/** The state of one task, as `tasks/<id>.json` keeps it. */
export interface TaskState {
  /** The last scheduled time handled (run, skipped or missed): it does not run again for it. */
  readonly lastSlot?: number;
  /** The run log, newest first, at most 20 (`task.due`). */
  readonly runs: readonly TaskRun[];
  /** The outputs, oldest first. */
  readonly outputs: readonly TaskOutput[];
  readonly running?: RunInProgress;
}

/** A task that has never run. */
export const emptyTaskState: TaskState = { runs: [], outputs: [] };

/** What a run in progress is doing, as the scheduler says it: `shop.orders: 12,000 documents`. */
export interface RunProgress {
  readonly start: number;
  readonly trigger: RunTrigger;
  readonly progress?: string;
}

/** The last message of the page: what `task.edit` saved, or why **Run now** did nothing. */
export interface PageMessage {
  readonly text: string;
  readonly failed: boolean;
}

/** The part of the app's state about scheduled tasks. */
export interface TasksState {
  /** In the order they were created. */
  readonly tasks: readonly ScheduledTask[];
  readonly states: Readonly<Record<string, TaskState>>;
  /** The runs in progress, by task, from the scheduler. */
  readonly running: Readonly<Record<string, RunProgress>>;
  /** False when `tasks/tasks.json` was written by a newer Datardo: changes are not saved (data.md, "Versions"). */
  readonly writable: boolean;
  /** The tasks whose details are open, kept for the session (`task.show`). */
  readonly open: readonly TaskId[];
  readonly message?: PageMessage;
}

/** No task. */
export const initialTasksState: TasksState = { tasks: [], states: {}, running: {}, writable: true, open: [] };

/** The events of this part of the state. */
export type TasksEvent =
  | {
      readonly slice: 'tasks';
      readonly type: 'loaded';
      readonly tasks: readonly ScheduledTask[];
      readonly states: Readonly<Record<string, TaskState>>;
      readonly writable: boolean;
    }
  | { readonly slice: 'tasks'; readonly type: 'task-saved'; readonly task: ScheduledTask }
  | { readonly slice: 'tasks'; readonly type: 'task-deleted'; readonly task: TaskId }
  | { readonly slice: 'tasks'; readonly type: 'state-changed'; readonly task: TaskId; readonly state: TaskState }
  | { readonly slice: 'tasks'; readonly type: 'run-changed'; readonly task: TaskId; readonly run?: RunProgress }
  | { readonly slice: 'tasks'; readonly type: 'details-toggled'; readonly task: TaskId }
  | { readonly slice: 'tasks'; readonly type: 'message'; readonly message?: PageMessage };

function without<T>(record: Readonly<Record<string, T>>, key: string): Readonly<Record<string, T>> {
  return Object.fromEntries(Object.entries(record).filter(([each]) => each !== key));
}

function savedTask(tasks: readonly ScheduledTask[], task: ScheduledTask): readonly ScheduledTask[] {
  return tasks.some((each) => each.id === task.id)
    ? tasks.map((each) => (each.id === task.id ? task : each))
    : [...tasks, task];
}

function deleted(state: TasksState, task: TaskId): TasksState {
  return {
    ...state,
    tasks: state.tasks.filter((each) => each.id !== task),
    states: without(state.states, task),
    running: without(state.running, task),
    open: state.open.filter((each) => each !== task),
  };
}

/** Changes this part of the state. */
export function reduceTasks(state: TasksState, event: TasksEvent): TasksState {
  switch (event.type) {
    case 'loaded':
      return { ...state, tasks: event.tasks, states: event.states, writable: event.writable };
    case 'task-saved':
      return { ...state, tasks: savedTask(state.tasks, event.task) };
    case 'task-deleted':
      return deleted(state, event.task);
    case 'state-changed':
      return { ...state, states: { ...state.states, [event.task]: event.state } };
    case 'run-changed':
      return {
        ...state,
        running:
          event.run === undefined ? without(state.running, event.task) : { ...state.running, [event.task]: event.run },
      };
    case 'details-toggled':
      return {
        ...state,
        open: state.open.includes(event.task)
          ? state.open.filter((each) => each !== event.task)
          : [...state.open, event.task],
      };
    case 'message':
      return withMessage(state, event.message);
  }
}

function withMessage(state: TasksState, message: PageMessage | undefined): TasksState {
  if (message !== undefined) {
    return { ...state, message };
  }
  const { message: _cleared, ...rest } = state;
  return rest;
}

/**
 * The tasks part of the app's state. Until it is one of the parts of `AppState` (`src/shared/state/index.ts`), an
 * app's state without it has no task.
 */
export function tasksOf(state: AppState): TasksState {
  return (state as AppState & { readonly tasks?: TasksState }).tasks ?? initialTasksState;
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
 * `answers.disk`: whether the task's folder exists, the names already in it, and what is at each output's path. A fact
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
