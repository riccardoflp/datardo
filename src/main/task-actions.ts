/**
 * The app steps of the scheduled tasks, as the main process carries them out: the tasks saved, deleted, enabled or
 * disabled (`task.edit`, `task.delete`, `task.enable`), and the state of a task changed as its run goes (`task.run`,
 * `task.retention`, `task.missed`, `task.cancel`), each change in the app's state then in the task's file.
 */
import { finishedRun, startedRun } from '../features/task/run';
import { afterRetention } from '../features/task/retention';
import { recordMissed } from '../features/task/missed';
import { planText } from '../features/task/text';
import type { Json } from '../shared/engine-request';
import { taskId, type RunInProgress, type RunTrigger, type ScheduledTask } from '../shared/state/tasks';
import type { AppAction } from '../runner/ports';
import type { JsonObject } from '../storage/store';
import { taskOf } from '../storage/tasks';
import { TaskFailure } from './task-backup';
import { changeTaskState, taskNow, type TaskHost } from './task-host';

type Fields = Readonly<Record<string, Json>>;

function fieldsOf(args: Json): Fields {
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Fields) : {};
}

function textOf(args: Json, name: string): string {
  const value = fieldsOf(args)[name];
  return typeof value === 'string' ? value : '';
}

function numberOf(args: Json, name: string): number | undefined {
  const value = fieldsOf(args)[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function textsOf(args: Json, name: string): readonly string[] {
  const value = fieldsOf(args)[name];
  return Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : [];
}

const triggers: readonly RunTrigger[] = ['schedule', 'manual', 'missed'];

function runOf(args: Json): RunInProgress {
  const asked = textOf(args, 'trigger');
  const slot = numberOf(args, 'slot');
  return {
    start: numberOf(args, 'start') ?? 0,
    trigger: triggers.find((each) => each === asked) ?? 'manual',
    ...(slot === undefined ? {} : { slot }),
  };
}

/** Saves the list of tasks; a list that cannot be saved fails with *Could not save the task: <error>*. */
function saveList(host: TaskHost, tasks: readonly ScheduledTask[]): void {
  if (!host.files.isWritable() || !host.files.saveTasks(tasks)) {
    throw new TaskFailure('task.edit/save-failed', planText.saveFailed(planText.newerFile));
  }
}

/** `task.save` `{ task, message }`: the task added or replaced, and the page's message. */
function save(host: TaskHost): AppAction {
  return (args) => {
    let task: ScheduledTask;
    try {
      task = taskOf(fieldsOf(args)['task'] as JsonObject) as ScheduledTask;
    } catch (error: unknown) {
      throw new TaskFailure('task.edit/save-failed', planText.saveFailed((error as Error).message));
    }
    const tasks = host.state.get().tasks.tasks;
    const saved = tasks.some((each) => each.id === task.id)
      ? tasks.map((each) => (each.id === task.id ? task : each))
      : [...tasks, task];
    try {
      saveList(host, saved);
    } catch (error: unknown) {
      host.state.dispatch({
        slice: 'tasks',
        type: 'message',
        message: { text: (error as Error).message, failed: true },
      });
      throw error;
    }
    host.state.dispatch({ slice: 'tasks', type: 'task-saved', task });
    host.state.dispatch({ slice: 'tasks', type: 'message', message: { text: textOf(args, 'message'), failed: false } });
    return Promise.resolve(null);
  };
}

/** `task.delete` `{ task }`: the task and its state; a run in progress is stopped. The files it wrote stay. */
function remove(host: TaskHost): AppAction {
  return async (args) => {
    const id = textOf(args, 'task');
    host.book.cancel(id);
    saveList(
      host,
      host.state.get().tasks.tasks.filter((each) => each.id !== id),
    );
    host.state.dispatch({ slice: 'tasks', type: 'task-deleted', task: taskId(id) });
    await host.files.deleteState(id).catch(() => undefined);
    return null;
  };
}

/** `task.set-enabled` `{ task, enabled, since }`. */
function setEnabled(host: TaskHost): AppAction {
  return (args) => {
    const task = taskNow(host, textOf(args, 'task'));
    if (task !== undefined) {
      const enabled = fieldsOf(args)['enabled'] === true;
      const changed = { ...task, enabled, since: numberOf(args, 'since') ?? task.since };
      saveList(
        host,
        host.state.get().tasks.tasks.map((each) => (each.id === task.id ? changed : each)),
      );
      host.state.dispatch({ slice: 'tasks', type: 'task-saved', task: changed });
    }
    return Promise.resolve(null);
  };
}

/** `task.start-run` `{ task, trigger, slot, start }`: the run in progress, in the state and on the page. */
function startRun(host: TaskHost): AppAction {
  return (args) => {
    const id = textOf(args, 'task');
    const running = runOf(args);
    if (!host.book.has(id)) {
      host.book.begin(id);
    }
    host.book.markStarted(id);
    changeTaskState(host, id, (state) => startedRun(state, running));
    host.state.dispatch({
      slice: 'tasks',
      type: 'run-changed',
      task: taskId(id),
      run: { start: running.start, trigger: running.trigger },
    });
    return Promise.resolve(null);
  };
}

/** `task.record-run` `{ task, output, folder }`: the run in the log as done, its output in the list. */
function recordRun(host: TaskHost): AppAction {
  return (args) => {
    const id = textOf(args, 'task');
    const task = taskNow(host, id);
    const written = host.book.written(id);
    if (task !== undefined && written !== undefined) {
      const output = {
        path: textOf(args, 'output'),
        at: numberOf(args, 'start') ?? host.now(),
        size: written.size,
        folder: fieldsOf(args)['folder'] === true,
      };
      const ended = {
        kind: 'done' as const,
        output,
        documents: written.documents,
        ...(written.collections === undefined ? {} : { collections: written.collections }),
        ...(written.note === undefined ? {} : { note: written.note }),
      };
      changeTaskState(host, id, (state) => finishedRun(task, state, ended, host.now()));
      host.book.recorded(id);
    }
    host.state.dispatch({ slice: 'tasks', type: 'run-changed', task: taskId(id) });
    return Promise.resolve(null);
  };
}

/** `task.forget-outputs` `{ task, deleted, dropped }`: the outputs gone from the list, those not deleted kept. */
function forgetOutputs(host: TaskHost): AppAction {
  return (args) => {
    const id = textOf(args, 'task');
    const errors = host.book.deleteErrors(id);
    const result = {
      deleted: textsOf(args, 'deleted').filter((path) => !errors.has(path)),
      dropped: textsOf(args, 'dropped'),
      errors: [...errors].map(([path, error]) => ({ path, error })),
    };
    changeTaskState(host, id, (state) => afterRetention(state, result));
    return Promise.resolve(null);
  };
}

/** The app steps of the area, by name. */
export function taskActions(host: TaskHost): Readonly<Record<string, AppAction>> {
  return {
    'task.save': save(host),
    'task.delete': remove(host),
    'task.set-enabled': setEnabled(host),
    'task.start-run': startRun(host),
    'task.record-run': recordRun(host),
    'task.forget-outputs': forgetOutputs(host),
    'task.record-missed': (args) => {
      const slot = numberOf(args, 'slot');
      if (slot !== undefined) {
        changeTaskState(host, textOf(args, 'task'), (state) => recordMissed(state, slot));
      }
      return Promise.resolve(null);
    },
    'task.cancel-run': (args) => {
      host.book.cancel(textOf(args, 'task'));
      return Promise.resolve(null);
    },
    'task.default-folder': () => Promise.resolve(host.defaultFolder()),
  };
}
