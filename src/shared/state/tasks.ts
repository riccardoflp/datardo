/**
 * The part of the app's state about scheduled tasks (task.md): the tasks as `tasks/tasks.json` keeps them, the state of
 * each task as `tasks/<id>.json` keeps it (its last scheduled time handled, its run log, its outputs), the runs in
 * progress from the scheduler of the main process, and the last message of the Scheduled tasks page. The main process
 * changes it from the app steps of the cards of the area; the window draws the page from it.
 *
 * The stored shapes are mirrored by `src/storage/tasks.ts`, which keeps them apart from the app's state; a unit test
 * keeps the two the same.
 */
import type { EngineName } from '../engine-request';
import type { ConnectionId } from '../ids';

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
