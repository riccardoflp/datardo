/**
 * How the main process starts a run of a task (`task.run`, `task.missed`), from the scheduler or from **Run now**:
 * the task's connection connected first, asking nothing (`connection.connect`), what is on disk looked up for the plan
 * (`args.disk`), the feature started as a task, then how the run ended recorded in its run log when its own steps did
 * not, and told by `task.notify`: in the window, or by the system while the window is hidden in the tray.
 */
import { stat, readdir } from 'node:fs/promises';
import { dueRun } from '../features/task/due';
import { view as notification } from '../features/task/notify';
import { finishedRun, refusedRunStatus, startedRun, type RunEnd } from '../features/task/run';
import { planText } from '../features/task/text';
import type { DiskFacts, PathKind } from '../features/task/types';
import type { IntentResult } from '../shared/bridge';
import type { NotificationAction } from '../shared/feature';
import { featureId, type RefusalCode } from '../shared/ids';
import { savedConnection } from '../shared/state/connections';
import type { RunTrigger, ScheduledTask, TaskState } from '../shared/state/tasks';
import { taskId } from '../shared/state/tasks';
import { appTarget } from '../shared/target';
import { writeLog } from '../runner/log';
import { notify } from '../runner/notify';
import { start } from '../runner/start';
import { changeTaskState, taskNow, taskStateNow, type TaskHost } from './task-host';

async function kindAt(path: string): Promise<PathKind> {
  const found = await stat(path).catch(() => undefined);
  return found === undefined ? 'missing' : found.isDirectory() ? 'folder' : 'file';
}

/** What is on disk for a run of the task: its folder, the names in it, and what is at each output's path. */
export async function diskFacts(task: ScheduledTask, state: TaskState): Promise<DiskFacts> {
  if ((await kindAt(task.folder)) !== 'folder') {
    return { folder: 'missing' };
  }
  const taken = await readdir(task.folder).catch(() => [] as string[]);
  const at = await Promise.all(state.outputs.map(async (output) => [output.path, await kindAt(output.path)] as const));
  return { folder: 'present', taken, at: Object.fromEntries(at) };
}

function slotOf(task: ScheduledTask, state: TaskState, trigger: RunTrigger, now: number): number | undefined {
  const due = dueRun(task, state, now);
  if (trigger === 'manual' || due.kind === 'none') {
    return undefined;
  }
  return due.slot;
}

/** Records how a run ended when its own steps did not: refused, failed, cancelled, or skipped before it started. */
function recordEnd(host: TaskHost, task: ScheduledTask, trigger: RunTrigger, ended: RunEnd): void {
  changeTaskState(host, task.id, (state) => {
    const now = host.now();
    if (host.book.isStarted(task.id) && state.running !== undefined) {
      return finishedRun(task, state, ended, now);
    }
    const slot = slotOf(task, state, trigger, now);
    const begun = startedRun(state, { start: now, trigger, ...(slot === undefined ? {} : { slot }) });
    return finishedRun(task, begun, ended, now);
  });
}

function actionsOf(task: ScheduledTask, run: TaskState['runs'][number]): readonly NotificationAction[] {
  const shown = notification({ task, run, hidden: false });
  return (shown?.buttons ?? []).map((button) =>
    button.kind === 'show'
      ? { label: button.label, element: button.element, feature: featureId('task.show'), target: appTarget }
      : { label: button.label, feature: featureId('task.show'), target: appTarget, args: { reveal: button.path } },
  );
}

/** `task.notify`: the notification of the newest run of the task, when it has one. */
export async function notifyRun(host: TaskHost, id: string): Promise<void> {
  const task = taskNow(host, id);
  const run = taskStateNow(host, id).runs[0];
  if (task === undefined || run === undefined) {
    return;
  }
  const hidden = host.window?.isHidden() ?? false;
  const shown = notification({ task, run, hidden });
  if (shown === undefined) {
    return;
  }
  const ports = await host.runner();
  if (shown.system && host.window !== undefined) {
    // The window is hidden in the tray: the system shows it, and the Log keeps it.
    host.window.notifySystem(shown.text);
    writeLog(ports, [{ feature: 'task.notify', kind: 'notification', text: shown.text }]);
    return;
  }
  notify(ports, {
    feature: featureId('task.notify'),
    level: shown.level,
    text: shown.text,
    actions: actionsOf(task, run),
  });
}

/** How a started run ended, when its steps did not record it. */
function endOf(host: TaskHost, id: string, result: IntentResult): RunEnd | undefined {
  if (host.book.isRecorded(id)) {
    return undefined;
  }
  const cancelled = host.book.signal(id)?.aborted === true || result.kind === 'cancelled';
  if (cancelled && host.book.isStarted(id)) {
    return { kind: 'cancelled' };
  }
  switch (result.kind) {
    case 'refused': {
      const status = refusedRunStatus(result.code);
      return status === undefined ? undefined : { kind: status, error: result.message };
    }
    case 'failed':
      return { kind: 'failed', error: host.book.error(id) ?? result.message };
    case 'done':
    case 'read':
    case 'cancelled':
      return undefined;
  }
}

/** Connects the task's connection when it is saved and not connected; the error when it cannot be reached. */
async function reach(host: TaskHost, task: ScheduledTask): Promise<string | undefined> {
  const saved = savedConnection(host.state.get().connections, task.connection);
  if (saved === undefined || host.isConnected(task.connection)) {
    return undefined;
  }
  return host.connect(task.connection);
}

/** A run that could not start because its connection cannot be reached: logged and notified as skipped. */
async function unreachable(
  host: TaskHost,
  task: ScheduledTask,
  trigger: RunTrigger,
  error: string,
): Promise<IntentResult> {
  const message = planText.connectionUnavailable(error);
  recordEnd(host, task, trigger, { kind: 'skipped', error: message });
  await notifyRun(host, task.id);
  return { kind: 'refused', code: 'task.run/not-connected' as RefusalCode, message };
}

async function started(host: TaskHost, task: ScheduledTask, trigger: RunTrigger): Promise<IntentResult> {
  const runs = trigger !== 'missed' || task.runMissed;
  const error = runs ? await reach(host, task) : undefined;
  if (error !== undefined) {
    return unreachable(host, task, trigger, error);
  }
  const disk = runs ? await diskFacts(task, taskStateNow(host, task.id)) : {};
  const feature = trigger === 'missed' ? 'task.missed' : 'task.run';
  host.book.begin(task.id);
  const result = await start(
    await host.runner(),
    { feature: featureId(feature), target: appTarget, args: { task: task.id, trigger, disk: disk as never } },
    { startedBy: 'task' },
  );
  const ended = endOf(host, task.id, result);
  if (ended !== undefined) {
    recordEnd(host, task, trigger, ended);
  }
  if (ended !== undefined || host.book.isRecorded(task.id)) {
    await notifyRun(host, task.id);
  }
  return result;
}

/** The page's message when **Run now** did nothing: *"<name>" is already running.* */
function alreadyRunning(host: TaskHost, task: ScheduledTask): IntentResult {
  const message = planText.alreadyRunning(task.name);
  host.state.dispatch({ slice: 'tasks', type: 'message', message: { text: message, failed: true } });
  return { kind: 'refused', code: 'task.run/running' as RefusalCode, message };
}

/**
 * Starts a run of the task, as the scheduler does for a run due (`schedule`) or missed (`missed`), and **Run now**
 * (`manual`); a task that is gone does nothing, one that is already running or starting says so on the page.
 */
export async function runTask(host: TaskHost, id: string, trigger: RunTrigger): Promise<IntentResult> {
  const task = taskNow(host, id);
  if (task === undefined) {
    return { kind: 'done' };
  }
  if (host.state.get().tasks.running[id] !== undefined || !host.book.beginStarting(id)) {
    return alreadyRunning(host, task);
  }
  try {
    return await started(host, task, trigger);
  } finally {
    host.book.end(id);
    host.book.endStarting(id);
    if (host.state.get().tasks.running[id] !== undefined) {
      host.state.dispatch({ slice: 'tasks', type: 'run-changed', task: taskId(id) });
    }
  }
}
