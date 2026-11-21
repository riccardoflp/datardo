/**
 * The stored files of the scheduled tasks in the main process (data.md): `tasks/tasks.json`, the tasks, and
 * `tasks/<id>.json`, the state of each, all at version 1, each written whole a moment after its last change and at
 * quit. A tasks file that was set aside, or a task this version cannot read, loses no other task (RS4); a file of a
 * newer Datardo is never written.
 */
import { Store, type Found } from '../storage/store';
import {
  deleteTaskState,
  taskStateFile,
  tasksFile,
  withTasks,
  type StoredTaskState,
  type TasksFile,
} from '../storage/tasks';
import { emptyTaskState, type ScheduledTask, type TaskState } from '../shared/state/tasks';

/** What the tasks and their states were found as at start. */
export interface LoadedTasks {
  readonly found: Found;
  readonly tasks: readonly ScheduledTask[];
  readonly states: Readonly<Record<string, TaskState>>;
}

/** Where the runs and the page save the tasks and their states. */
export interface TaskFiles {
  /** Whether the tasks can be saved: not to a file of a newer version. */
  readonly isWritable: () => boolean;
  /** Saves the tasks, in their order; false when the file may not be written. */
  readonly saveTasks: (tasks: readonly ScheduledTask[]) => boolean;
  readonly saveState: (id: string, state: TaskState) => void;
  /** Deletes the state of a deleted task, once what waited to be written of it is written. */
  readonly deleteState: (id: string) => Promise<void>;
}

/** The files of the tasks in a data folder. */
export class TaskStore implements TaskFiles {
  private readonly tasks: Store<TasksFile>;
  private readonly states = new Map<string, Store<StoredTaskState>>();

  /** Opens nothing yet: {@link load} reads the files. */
  constructor(
    private readonly folder: string,
    private readonly onWriteError: (error: unknown) => void,
  ) {
    this.tasks = new Store(folder, tasksFile, onWriteError);
  }

  /** Reads the tasks, then the state of each task this version can read. */
  async load(): Promise<LoadedTasks> {
    const found = await this.tasks.load();
    const tasks = this.tasks.get().tasks as readonly ScheduledTask[];
    const states: Record<string, TaskState> = {};
    for (const task of tasks) {
      states[task.id] = await this.loadState(task.id);
    }
    return { found, tasks, states };
  }

  /** Whether the tasks can be saved. */
  readonly isWritable = (): boolean => this.tasks.isWritable();

  /** Saves the tasks, keeping what this version does not know of each. */
  readonly saveTasks = (tasks: readonly ScheduledTask[]): boolean => this.tasks.set(withTasks(this.tasks.get(), tasks));

  /** Saves the state of a task. */
  readonly saveState = (id: string, state: TaskState): void => {
    this.stateStore(id).set(state);
  };

  /** Deletes the state of a task, after any write of it still waiting. */
  readonly deleteState = async (id: string): Promise<void> => {
    const store = this.states.get(id);
    this.states.delete(id);
    await store?.flush();
    await deleteTaskState(this.folder, id);
  };

  /** Writes what waits: at quit. */
  async flush(): Promise<void> {
    await Promise.all([this.tasks.flush(), ...[...this.states.values()].map((store) => store.flush())]);
  }

  /** The state of one task; a task whose id cannot name a file (written by hand) starts with an empty one. */
  private async loadState(id: string): Promise<TaskState> {
    let store: Store<StoredTaskState>;
    try {
      store = this.stateStore(id);
    } catch {
      // The id cannot name a file: the task keeps an empty state in memory, which is never written.
      return emptyTaskState;
    }
    await store.load();
    return store.get();
  }

  private stateStore(id: string): Store<StoredTaskState> {
    let store = this.states.get(id);
    if (store === undefined) {
      store = new Store(this.folder, taskStateFile(id), this.onWriteError);
      this.states.set(id, store);
    }
    return store;
  }
}
