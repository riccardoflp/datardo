/**
 * What the scheduled tasks need in the main process, given once at start: the state, their files, the engines, the
 * time, the runner, and the window's part (whether it is hidden in the tray, the system's notifications). Tests give
 * their own: no part of the tasks' work reads Electron or the clock except through it. And the book of the runs in
 * progress, which only the main process keeps: what each run may be cancelled with, and what its writer reported.
 */
import type { EngineService } from '../engines';
import type { RunnerPorts, StateHolder } from '../runner/ports';
import type { Platform } from '../shared/feature';
import type { ConnectionId } from '../shared/ids';
import { emptyTaskState, taskId, type ScheduledTask, type TaskState } from '../shared/state/tasks';
import type { TaskFiles } from './task-store';

/** The window's part: whether it is hidden in the tray, and a notification of the system, whose click shows it. */
export interface TaskWindow {
  readonly isHidden: () => boolean;
  readonly notifySystem: (text: string) => void;
}

/** Everything the tasks' work uses. */
export interface TaskHost {
  readonly state: StateHolder;
  readonly files: TaskFiles;
  readonly engines: () => EngineService;
  readonly now: () => number;
  readonly platform: Platform;
  /** The runner's ports, once the runner is ready. */
  readonly runner: () => Promise<RunnerPorts>;
  /**
   * Connects a saved connection that is not connected, as opening it would, asking nothing (`connection.connect`);
   * the error when it cannot be reached.
   */
  readonly connect: (connection: ConnectionId) => Promise<string | undefined>;
  readonly isConnected: (connection: ConnectionId) => boolean;
  readonly window?: TaskWindow;
  /** The folder of a new task: that of the last backup made by hand, else the home folder. */
  readonly defaultFolder: () => string;
  readonly book: RunBook;
}

/** What the writer of a successful run reported. */
export interface WrittenOutput {
  readonly documents: number;
  readonly collections?: number;
  readonly size: number;
  readonly note?: string;
}

/** One run in progress, as the main process keeps it. */
interface BookEntry {
  readonly cancel: AbortController;
  written?: WrittenOutput;
  error?: string;
  recorded: boolean;
  started: boolean;
  readonly deleteErrors: Map<string, string>;
}

/** The runs in progress, and the tasks whose run is being started (connected, looked up on disk). */
export class RunBook {
  private readonly entries = new Map<string, BookEntry>();
  private readonly starting = new Set<string>();

  /** Marks a task as starting a run; false when one is already starting. */
  beginStarting(task: string): boolean {
    if (this.starting.has(task)) {
      return false;
    }
    this.starting.add(task);
    return true;
  }

  /** The run is started, or did not start. */
  endStarting(task: string): void {
    this.starting.delete(task);
  }

  /** Whether a run of the task is being started. */
  isStarting(task: string): boolean {
    return this.starting.has(task);
  }

  /** A run begins: what cancels it, and what its writer reports. */
  begin(task: string): void {
    this.entries.set(task, { cancel: new AbortController(), recorded: false, started: false, deleteErrors: new Map() });
  }

  /** Whether a run of the task has begun and not ended. */
  has(task: string): boolean {
    return this.entries.has(task);
  }

  /** What `task.cancel` aborts; none when the task does not run. */
  signal(task: string): AbortSignal | undefined {
    return this.entries.get(task)?.cancel.signal;
  }

  /** Stops the run of the task (`task.cancel`). */
  cancel(task: string): void {
    this.entries.get(task)?.cancel.abort();
  }

  /** Its step `task.start-run` ran: the state records it in progress. */
  markStarted(task: string): void {
    const entry = this.entries.get(task);
    if (entry !== undefined) {
      entry.started = true;
    }
  }

  /** Whether the state records the run in progress. */
  isStarted(task: string): boolean {
    return this.entries.get(task)?.started ?? false;
  }

  /** The writer wrote the output. */
  wrote(task: string, written: WrittenOutput): void {
    const entry = this.entries.get(task);
    if (entry !== undefined) {
      entry.written = written;
    }
  }

  /** What the writer wrote, once it did. */
  written(task: string): WrittenOutput | undefined {
    return this.entries.get(task)?.written;
  }

  /** The writer failed, with the message of the run's log. */
  failed(task: string, error: string): void {
    const entry = this.entries.get(task);
    if (entry !== undefined) {
      entry.error = error;
    }
  }

  /** Why the writer failed, when it did. */
  error(task: string): string | undefined {
    return this.entries.get(task)?.error;
  }

  /** The run is in the log. */
  recorded(task: string): void {
    const entry = this.entries.get(task);
    if (entry !== undefined) {
      entry.recorded = true;
    }
  }

  /** Whether the run is in the log already. */
  isRecorded(task: string): boolean {
    return this.entries.get(task)?.recorded ?? false;
  }

  /** Retention could not delete a path. */
  couldNotDelete(task: string, path: string, error: string): void {
    this.entries.get(task)?.deleteErrors.set(path, error);
  }

  /** The paths retention could not delete, with why. */
  deleteErrors(task: string): ReadonlyMap<string, string> {
    return this.entries.get(task)?.deleteErrors ?? new Map<string, string>();
  }

  /** The run is over: nothing more is kept of it. */
  end(task: string): void {
    this.entries.delete(task);
  }
}

/** The task of an id, as the app's state has it now. */
export function taskNow(host: TaskHost, id: string): ScheduledTask | undefined {
  return host.state.get().tasks.tasks.find((each) => each.id === id);
}

/** The state of a task now. */
export function taskStateNow(host: TaskHost, id: string): TaskState {
  return host.state.get().tasks.states[id] ?? emptyTaskState;
}

/** Changes the state of a task that still exists: in the app's state, then in its file. */
export function changeTaskState(host: TaskHost, id: string, change: (state: TaskState) => TaskState): void {
  if (taskNow(host, id) === undefined) {
    return;
  }
  const next = change(taskStateNow(host, id));
  host.state.dispatch({ slice: 'tasks', type: 'state-changed', task: taskId(id), state: next });
  host.files.saveState(id, next);
}
