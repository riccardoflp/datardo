/**
 * The scheduled tasks in the main process: their files loaded into the app's state at start, the scheduler started,
 * whether closing the window keeps Datardo running in the tray worked out whenever the tasks or the settings change
 * (`task.tray`), and the {@link TaskHost} the actions, the file writer and the bridge use.
 */
import { Notification } from 'electron';
import { keepsRunning } from '../features/task/tray';
import { planText } from '../features/task/text';
import type { Intent, IntentResult } from '../shared/bridge';
import { featureId, type ConnectionId } from '../shared/ids';
import { appTarget } from '../shared/target';
import { notify } from '../runner/notify';
import { start as startFeature } from '../runner/start';
import type { Found } from '../storage/store';
import type { AreaStart } from './areas';
import { startsItself, whenRunnerReady } from './bridge';
import { connectionEngines, isConnected } from './connections';
import { lastFolderOf } from './actions/transfer';
import type { MainServices } from './services';
import { RunBook, type TaskHost, type TaskWindow } from './task-host';
import { runTask } from './task-runs';
import { Scheduler } from './task-scheduler';
import { TaskStore } from './task-store';

let host: TaskHost | undefined;

/** The tasks' host, once the area has started. */
export function taskHost(): TaskHost | undefined {
  return host;
}

/** **Run now** (`task.run@list`), sent by the window: the run started as the scheduler starts one. */
export function taskRunOf(intent: Intent): Promise<IntentResult> | undefined {
  if (intent.feature !== 'task.run' || host === undefined) {
    return undefined;
  }
  const args = intent.args;
  const task =
    typeof args === 'object' && args !== null && !Array.isArray(args)
      ? (args as Readonly<Record<string, unknown>>)['task']
      : undefined;
  return typeof task === 'string' ? runTask(host, task, 'manual') : undefined;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `connection.connect`, asking nothing, for a run: the error when the connection cannot be reached. */
async function connect(connection: ConnectionId): Promise<string | undefined> {
  const ports = await whenRunnerReady();
  const result = await startFeature(
    ports,
    { feature: featureId('connection.connect'), target: { kind: 'connection', connection } },
    { startedBy: 'task' },
  );
  if (result.kind === 'failed' || result.kind === 'refused') {
    return result.message;
  }
  return isConnected(connection) ? undefined : planText.notConnected;
}

/** The window's part: hidden in the tray, and the system's notification, whose click shows it with the page. */
function windowPart(services: MainServices): TaskWindow {
  return {
    isHidden: () => {
      const window = services.window();
      return window === undefined || window.isDestroyed() || !window.isVisible();
    },
    notifySystem: (text) => {
      if (!Notification.isSupported()) {
        return;
      }
      const shown = new Notification({ title: 'Datardo', body: text });
      shown.on('click', () => {
        void services
          .start({ feature: featureId('window.single-instance'), target: appTarget })
          .then(() => services.start({ feature: featureId('task.show'), target: appTarget }));
      });
      shown.show();
    },
  };
}

function tellHowFound(services: MainServices, found: Found): void {
  const ports = { state: services.state, now: () => Date.now() };
  if (found.kind === 'newer') {
    notify(ports, { feature: featureId('task.show'), level: 'warning', text: planText.newerTasks });
  } else if (found.kind === 'damaged') {
    notify(ports, {
      feature: featureId('task.show'),
      level: 'warning',
      text: planText.damagedTasks(found.setAsideAs),
      actions: [{ label: planText.openDataFolder, feature: featureId('window.open-data-folder'), target: appTarget }],
    });
  }
}

/** `task.tray`: closing the window keeps Datardo running while the setting is on and a task is enabled. */
function followTheTray(services: MainServices): void {
  const update = (): void => {
    const now = services.state.get();
    const keeps = keepsRunning(now.settings, now.tasks.tasks);
    if (now.window.closeKeepsRunning !== keeps) {
      services.state.dispatch({ slice: 'window', type: 'changed', window: { closeKeepsRunning: keeps } });
    }
  };
  update();
  services.state.listen((event) => {
    if (event.slice === 'tasks' || event.slice === 'settings') {
      update();
    }
  });
}

/** Loads the tasks and their states, then starts the scheduler; at quit, it stops and the files are written. */
export const start: AreaStart = async (services) => {
  const ports = { state: services.state, now: () => Date.now() };
  const store = new TaskStore(services.dataFolder, (error: unknown) => {
    notify(ports, { feature: featureId('task.edit'), level: 'error', text: planText.notSaved(reasonOf(error)) });
  });
  const loaded = await store.load();
  services.state.dispatch({
    slice: 'tasks',
    type: 'loaded',
    tasks: loaded.tasks,
    states: loaded.states,
    writable: store.isWritable(),
  });
  tellHowFound(services, loaded.found);
  const made: TaskHost = {
    state: services.state,
    files: store,
    engines: connectionEngines,
    now: () => Date.now(),
    platform: services.platform,
    runner: whenRunnerReady,
    connect,
    isConnected,
    window: windowPart(services),
    defaultFolder: () => lastFolderOf('backup'),
    book: new RunBook(),
  };
  host = made;
  // **Run now** of the page runs as the scheduler's runs do (`src/main/task-runs.ts`).
  startsItself(taskRunOf);
  followTheTray(services);
  const scheduler = new Scheduler({
    state: () => services.state.get(),
    isStarting: (task) => made.book.isStarting(task),
    run: (task, trigger) => runTask(made, task, trigger),
  });
  scheduler.start();
  services.onQuit(async () => {
    scheduler.stop();
    await store.flush();
  });
};
