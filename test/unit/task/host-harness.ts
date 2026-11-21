/**
 * The scheduled tasks of the main process without Electron, for the unit and the integration tests: a {@link TaskHost}
 * whose files are kept in memory, whose clock the test sets, whose connections connect or fail as the test says, and
 * whose window is shown or hidden in the tray; the runner's ports with the features of the registry, the app steps of
 * the area and its file writer (`src/main/task-*.ts`).
 */
import type { EngineService } from '../../../src/engines';
import { runnableFeatures } from '../../../src/features/registry';
import type { ScheduledTask, TaskState } from '../../../src/features/task/types';
import { taskActions } from '../../../src/main/task-actions';
import { RunBook, type TaskHost } from '../../../src/main/task-host';
import type { TaskFiles } from '../../../src/main/task-store';
import { carryOutTaskStep } from '../../../src/main/task-writer';
import { endsWithOwnMessage } from '../../../src/main/transfer-steps';
import type { AppAction, RunnerPorts } from '../../../src/runner/ports';
import type { ConnectionView } from '../../../src/shared/connection';
import type { ConnectionId } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';

/** The files of the tasks, in memory. */
export class MemoryFiles implements TaskFiles {
  tasks: readonly ScheduledTask[] = [];
  readonly states = new Map<string, TaskState>();
  readonly deleted: string[] = [];
  writable = true;

  readonly isWritable = (): boolean => this.writable;

  readonly saveTasks = (tasks: readonly ScheduledTask[]): boolean => {
    if (!this.writable) {
      return false;
    }
    this.tasks = tasks;
    return true;
  };

  readonly saveState = (id: string, state: TaskState): void => {
    this.states.set(id, state);
  };

  readonly deleteState = (id: string): Promise<void> => {
    this.states.delete(id);
    this.deleted.push(id);
    return Promise.resolve();
  };
}

/** The tasks' world of a test. */
export interface TaskWorld {
  readonly host: TaskHost;
  readonly ports: RunnerPorts;
  readonly files: MemoryFiles;
  readonly state: () => AppState;
  /** The time now, which the test moves. */
  now: number;
  /** Whether the window is hidden in the tray. */
  hidden: boolean;
  /** The connections that cannot be reached, with their error; the others connect. */
  readonly unreachable: Map<string, string>;
  readonly connected: Set<string>;
  /** The notifications of the system shown, and those of the window. */
  readonly system: string[];
  readonly notices: () => readonly string[];
  readonly revealed: string[];
}

/** What a world starts with. */
export interface WorldOptions {
  readonly connections: readonly ConnectionView[];
  readonly tasks?: readonly ScheduledTask[];
  readonly states?: Readonly<Record<string, TaskState>>;
  readonly engines?: EngineService;
  readonly now: number;
  /** The connections connected at the start. */
  readonly connected?: readonly string[];
  readonly readOnly?: readonly string[];
}

const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';

function stateOf(options: WorldOptions): AppState {
  return {
    ...initialState,
    connections: { ...initialConnectionsState, loaded: true, saved: options.connections },
    tasks: {
      ...initialState.tasks,
      tasks: options.tasks ?? [],
      states: options.states ?? {},
    },
  };
}

function portsOf(world: TaskWorld, options: WorldOptions, holder: RunnerPorts['state']): RunnerPorts {
  const name = (id: ConnectionId): string => options.connections.find((each) => each.id === id)?.name ?? id;
  const extra: Readonly<Record<string, AppAction>> = {
    'transfer.reveal-path': (args) => {
      world.revealed.push(String((args as Record<string, unknown>)['path']));
      return Promise.resolve(null);
    },
  };
  return {
    features: runnableFeatures(),
    engines: options.engines ?? { send: () => Promise.reject(new Error('No server in these tests.')) },
    appActions: new Map(Object.entries({ ...taskActions(world.host), ...extra })),
    files: async (step, signal, progress) => {
      if (!(await carryOutTaskStep(world.host, step, signal, progress))) {
        throw new Error(`No writer for ${step.path} in these tests.`);
      }
    },
    dialogs: {
      ask: () => Promise.resolve(undefined),
      confirm: () => Promise.resolve(true),
    },
    state: holder,
    platform,
    isReadOnly: (id) => options.readOnly?.includes(id) ?? false,
    isConnected: (id) => world.connected.has(id),
    connectionName: name,
    now: () => world.now,
    endsWithOwnMessage,
  };
}

/** A world of scheduled tasks. */
export function taskWorld(options: WorldOptions): TaskWorld {
  let state = stateOf(options);
  const holder = {
    get: () => state,
    dispatch: (event: AppEvent) => {
      state = reduce(state, event);
    },
  };
  const files = new MemoryFiles();
  files.tasks = options.tasks ?? [];
  const world: TaskWorld = {
    host: undefined as unknown as TaskHost,
    ports: undefined as unknown as RunnerPorts,
    files,
    state: () => state,
    now: options.now,
    hidden: false,
    unreachable: new Map(),
    connected: new Set(options.connected ?? options.connections.map((each) => each.id)),
    system: [],
    notices: () => state.runner.notifications.map((each) => each.text),
    revealed: [],
  };
  const host: TaskHost = {
    state: holder,
    files,
    engines: () => options.engines ?? ({} as EngineService),
    now: () => world.now,
    platform,
    runner: () => Promise.resolve(world.ports),
    connect: (connection) => {
      const error = world.unreachable.get(connection);
      if (error === undefined) {
        world.connected.add(connection);
      }
      return Promise.resolve(error);
    },
    isConnected: (connection) => world.connected.has(connection),
    window: {
      isHidden: () => world.hidden,
      notifySystem: (text) => {
        world.system.push(text);
      },
    },
    defaultFolder: () => 'D:\\backups',
    book: new RunBook(),
  };
  (world as { host: TaskHost }).host = host;
  (world as { ports: RunnerPorts }).ports = portsOf(world, options, holder);
  return world;
}
